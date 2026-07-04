import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceUidRateLimit: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  getFirebaseAdminStorageBucket: vi.fn(),
  increment: vi.fn((value: number) => ({ increment: value })),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    increment: mocks.increment,
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: mocks.getFirebaseAdminDb,
  getFirebaseAdminStorageBucket: mocks.getFirebaseAdminStorageBucket,
}));

vi.mock("../../shared/auth", () => ({
  createApiAuthErrorResponse: vi.fn((error: unknown, fallbackMessage: string) => {
    const source = error as { message?: string; code?: string; status?: number };
    return Response.json(
      { error: source.message || fallbackMessage, code: source.code || "auth/internal" },
      { status: source.status || 500 }
    );
  }),
  createApiInternalErrorResponse: vi.fn((error: unknown, fallbackMessage: string) => {
    const source = error as { message?: string };
    return Response.json({ error: source.message || fallbackMessage, code: "internal" }, { status: 500 });
  }),
  verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
}));

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
  return {
    ...actual,
    enforceUidRateLimit: mocks.enforceUidRateLimit,
  };
});

import { POST } from "./route";

function deleteUserDataRequest(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/account/delete-user-data", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

function emptyQuery() {
  return {
    empty: true,
    size: 0,
    docs: [],
    get: vi.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
    limit: vi.fn(function limit(this: unknown) {
      return this;
    }),
    orderBy: vi.fn(function orderBy(this: unknown) {
      return this;
    }),
    startAfter: vi.fn(function startAfter(this: unknown) {
      return this;
    }),
    where: vi.fn(function where(this: unknown) {
      return this;
    }),
  };
}

function createFirestoreMock() {
  const deletesByPath = new Map<string, ReturnType<typeof vi.fn>>();
  const setsByPath = new Map<string, ReturnType<typeof vi.fn>>();
  const docFor = (collectionName: string, id: string) => {
    const path = `${collectionName}/${id}`;
    const deleteFn = vi.fn(() => Promise.resolve());
    const setFn = vi.fn(() => Promise.resolve());
    deletesByPath.set(path, deleteFn);
    setsByPath.set(path, setFn);
    return {
      collectionName,
      id,
      path,
      delete: deleteFn,
      set: setFn,
      get: vi.fn(() =>
        Promise.resolve({
          exists: collectionName === "users",
          get: (field: string) => {
            if (field === "usernameKey") return "pilot";
            if (field === "email") return "user@example.com";
            return "";
          },
        })
      ),
    };
  };
  const db = {
    batch: vi.fn(() => ({
      commit: vi.fn(() => Promise.resolve()),
      delete: vi.fn(),
      set: vi.fn(),
    })),
    collection: vi.fn((collectionName: string) => ({
      doc: vi.fn((id: string) => docFor(collectionName, id)),
      get: vi.fn(() => Promise.resolve({ empty: true, size: 0, docs: [] })),
      limit: vi.fn(function limit(this: unknown) {
        return this;
      }),
      orderBy: vi.fn(() => emptyQuery()),
      where: vi.fn(() => emptyQuery()),
    })),
    recursiveDelete: vi.fn(() => Promise.resolve()),
  };
  return { db, deletesByPath, setsByPath };
}

describe("POST /api/account/delete-user-data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "token",
    });
    mocks.getFirebaseAdminStorageBucket.mockReturnValue({
      deleteFiles: vi.fn(() => Promise.resolve()),
    });
  });

  it("deletes the canonical leaderboard profile document for the authenticated uid", async () => {
    const firestore = createFirestoreMock();
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(deleteUserDataRequest({ uid: "uid-1" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(firestore.setsByPath.get("deletedAccountUids/uid-1")).toHaveBeenCalledWith(
      {
        uid: "uid-1",
        schemaVersion: 1,
        deletedAt: "SERVER_TIMESTAMP",
      },
      { merge: true }
    );
    expect(firestore.deletesByPath.get("leaderboardProfiles/uid-1")).toHaveBeenCalledTimes(1);
    expect(firestore.db.collection).toHaveBeenCalledWith("leaderboardProfiles");
    expect(firestore.db.collection).toHaveBeenCalledWith("deletedAccountUids");
    expect(firestore.db.collection).not.toHaveBeenCalledWith("leaderboardprofiles");
  });
});
