import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { verifyFirebaseRequestUser } from "../../shared/auth";
import { OPTIONS, POST } from "./route";

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: vi.fn(),
}));

vi.mock("../../shared/auth", () => ({
  createApiAuthErrorResponse: vi.fn((error: unknown, fallbackMessage: string) => {
    const source = error as { message?: string; code?: string; status?: number };
    return Response.json(
      { error: source.message || fallbackMessage, code: source.code || "auth/internal" },
      { status: source.status || 500 }
    );
  }),
  verifyFirebaseRequestUser: vi.fn(),
}));

function syncIdentityRequest(body: Record<string, unknown>, origin = "https://localhost") {
  return new Request("https://tasklaunch.test/api/account/sync-identity/", {
    method: "POST",
    headers: { "content-type": "application/json", origin, "x-firebase-auth": "token" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/sync-identity", () => {
  beforeEach(() => {
    vi.mocked(verifyFirebaseRequestUser).mockResolvedValue({
      uid: "user-123",
      email: "user@example.com",
      idToken: "token",
    });
    vi.mocked(getFirebaseAdminDb).mockReturnValue({
      batch: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        commit: vi.fn(() => Promise.resolve()),
      })),
      collection: vi.fn(() => ({
        doc: vi.fn((id: string) => ({ id })),
      })),
    } as never);
  });

  it("allows native preflight requests with the Firebase auth header", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.test/api/account/sync-identity/", {
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

  it("syncs account identity without applying a route rate limit", async () => {
    const response = await POST(syncIdentityRequest({ displayName: "User" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({ ok: true });
  });

  it("keeps CORS headers on validation errors", async () => {
    vi.mocked(verifyFirebaseRequestUser).mockResolvedValueOnce({
      uid: "user-123",
      email: null,
      idToken: "token",
    });

    const response = await POST(syncIdentityRequest({ displayName: "User" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toEqual({ error: "A verified email address is required." });
  });

  it("keeps CORS headers on internal errors", async () => {
    const commit = vi.fn(() => Promise.reject(new Error("commit failed")));
    vi.mocked(getFirebaseAdminDb).mockReturnValueOnce({
      batch: vi.fn(() => ({
        set: vi.fn(),
        delete: vi.fn(),
        commit,
      })),
      collection: vi.fn(() => ({
        doc: vi.fn((id: string) => ({ id })),
      })),
    } as never);

    const response = await POST(syncIdentityRequest({ displayName: "User" }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
    expect(payload).toMatchObject({ error: "Could not sync account identity.", code: "internal" });
    expect(payload.logId).toMatch(/^acct-sync-/);
  });
});
