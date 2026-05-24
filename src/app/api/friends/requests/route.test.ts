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

import { OPTIONS, POST } from "./route";

function friendRequest(body: Record<string, unknown>, origin = "capacitor://localhost") {
  return new Request("https://tasklaunch.app/api/friends/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/friends/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "sender-uid",
      email: "sender@example.com",
      idToken: "token",
    });
  });

  it("allows native preflight requests with the Firebase auth header", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/friends/requests", {
        method: "OPTIONS",
        headers: {
          origin: "capacitor://localhost",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });

  it("keeps CORS headers on validation errors returned to native clients", async () => {
    const response = await POST(friendRequest({ receiverEmail: "" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(payload).toEqual({ error: "Email address is required." });
  });
});
