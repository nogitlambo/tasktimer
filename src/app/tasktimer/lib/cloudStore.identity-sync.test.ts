import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  collection: vi.fn((...pathParts: unknown[]) => ({ type: "collection", pathParts })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((...pathParts: unknown[]) => ({ type: "doc", pathParts })),
  getDoc: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn((value: unknown) => value),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({
    delete: vi.fn(),
    set: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
}));

const firebaseClientMocks = vi.hoisted(() => ({
  getFirebaseAuthClient: vi.fn(),
  isNativeOrFileRuntime: vi.fn(() => false),
}));

const firestoreClientMocks = vi.hoisted(() => ({
  getFirebaseFirestoreClient: vi.fn(() => ({ type: "db" })),
}));

vi.mock("firebase/firestore", () => firestoreMocks);
vi.mock("@/lib/firebaseClient", () => firebaseClientMocks);
vi.mock("@/lib/firebaseFirestoreClient", () => firestoreClientMocks);

import { ensureUserProfileIndex } from "./cloudStore";

describe("ensureUserProfileIndex identity sync", () => {
  beforeEach(() => {
    firestoreMocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ email: "user@example.com", usernameKey: "user" }),
      get: (key: string) => (key === "usernameKey" ? "user" : null),
    });
    firestoreMocks.setDoc.mockResolvedValue(undefined);
    firebaseClientMocks.getFirebaseAuthClient.mockReturnValue({
      currentUser: {
        uid: "uid-identity-sync-test",
        email: "user@example.com",
        displayName: "User",
        getIdToken: vi.fn(() => Promise.resolve("id-token")),
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json(
            { error: "Could not sync account identity.", code: "internal", logId: "acct-sync-test" },
            { status: 500 }
          )
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not console.error when best-effort identity sync fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensureUserProfileIndex("uid-identity-sync-test");

    expect(fetch).toHaveBeenCalledWith(
      "/api/account/sync-identity/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-firebase-auth": "id-token" }),
      })
    );
    expect(consoleError).not.toHaveBeenCalled();
    expect(firestoreMocks.setDoc).toHaveBeenCalled();
  });
});
