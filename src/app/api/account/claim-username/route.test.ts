import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceUidRateLimit: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock("../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
  return {
    ...actual,
    enforceUidRateLimit: mocks.enforceUidRateLimit,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: mocks.getFirebaseAdminDb,
}));

import { ApiRateLimitError } from "../../shared/rateLimit";
import { OPTIONS, POST } from "./route";

function claimRequest(body: Record<string, unknown>, origin = "https://localhost") {
  return new Request("https://tasklaunch.app/api/account/claim-username/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

function createFirestoreMock(options?: { usernameUid?: string; existingUsername?: string }) {
  const txSet = vi.fn();
  const txDelete = vi.fn();
  const txGet = vi.fn((ref: { kind: string }) => {
    if (ref.kind === "username") {
      return Promise.resolve({
        exists: !!options?.usernameUid,
        get: (field: string) => (field === "uid" ? options?.usernameUid : ""),
      });
    }
    return Promise.resolve({
      exists: !!options?.existingUsername,
      get: (field: string) => (field === "usernameKey" || field === "username" ? options?.existingUsername : ""),
    });
  });
  const db = {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({ kind: name === "usernames" ? "username" : "user", name, id })),
    })),
    runTransaction: vi.fn((handler: (tx: { get: typeof txGet; set: typeof txSet; delete: typeof txDelete }) => unknown) =>
      handler({ get: txGet, set: txSet, delete: txDelete })
    ),
  };
  return { db, txSet };
}

describe("POST /api/account/claim-username", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "uid-1",
      email: "user@example.com",
      idToken: "token",
    });
  });

  it("allows native preflight requests with the Firebase auth header", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/account/claim-username/", {
        method: "OPTIONS",
        headers: {
          origin: "https://localhost",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });

  it("keeps CORS headers on validation errors", async () => {
    const response = await POST(claimRequest({ username: "no spaces" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload.error).toBe("Username must be 3 to 20 characters and use only letters, numbers, or underscores.");
  });

  it("keeps CORS headers on rate-limit errors", async () => {
    mocks.enforceUidRateLimit.mockRejectedValueOnce(new ApiRateLimitError("account/username-rate-limited", "Slow down."));

    const response = await POST(claimRequest({ username: "pilot" }));
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({ error: "Slow down.", code: "account/username-rate-limited" });
  });

  it("creates username records and keeps CORS headers on success", async () => {
    const firestore = createFirestoreMock();
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(claimRequest({ username: "Pilot" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({ ok: true, usernameKey: "pilot" });
    expect(firestore.txSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "users" }),
      expect.objectContaining({ username: "pilot", usernameKey: "pilot" }),
      { merge: true }
    );
  });

  it("keeps CORS headers on internal errors", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getFirebaseAdminDb.mockImplementationOnce(() => {
      throw new Error("Firestore unavailable");
    });

    const response = await POST(claimRequest({ username: "pilot" }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({ error: "Could not update your username.", code: "internal" });
    consoleError.mockRestore();
  });
});
