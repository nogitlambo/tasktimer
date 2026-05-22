import { beforeEach, describe, expect, it, vi } from "vitest";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { verifyFirebaseRequestUser } from "../../shared/auth";
import { POST } from "./route";

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

  it("syncs account identity without applying a route rate limit", async () => {
    const response = await POST(
      new Request("https://tasklaunch.test/api/account/sync-identity", {
        method: "POST",
        body: JSON.stringify({ displayName: "User" }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
  });
});
