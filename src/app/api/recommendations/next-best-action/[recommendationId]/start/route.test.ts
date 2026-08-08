import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  startRecommendation: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/shared/auth")>("@/app/api/shared/auth");
  return { ...actual, verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser };
});
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/nextbestaction/lib/nextBestActionRepository", async () => {
  const actual = await vi.importActual<typeof import("@/app/nextbestaction/lib/nextBestActionRepository")>("@/app/nextbestaction/lib/nextBestActionRepository");
  return { ...actual, createFirestoreNextBestActionRepository: vi.fn(() => ({ startRecommendation: mocks.startRecommendation })) };
});

import { POST } from "./route";

function request() {
  return new Request("https://tasklaunch.app/api/recommendations/next-best-action/nba-1/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-firebase-auth": "token" },
    body: "{}",
  });
}

describe("POST /api/recommendations/next-best-action/[recommendationId]/start", () => {
  it("returns the started handoff and preserves idempotency", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.startRecommendation.mockResolvedValue({
      kind: "started",
      recommendation: { id: "nba-1", type: "NEXT_BEST_ACTION", taskId: "task-1", status: "STARTED", startedAt: "2026-08-07T09:05:00.000Z" },
    });

    const response = await POST(request(), { params: Promise.resolve({ recommendationId: "nba-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, idempotent: false, recommendation: { taskId: "task-1", status: "STARTED" } });
    expect(mocks.startRecommendation).toHaveBeenCalledWith({ uid: "uid-1", recommendationId: "nba-1", nowMs: expect.any(Number) });
  });

  it("returns actionable stale and ineligible conflicts", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.startRecommendation.mockResolvedValueOnce({ kind: "stale" }).mockResolvedValueOnce({ kind: "ineligible" });

    const stale = await POST(request(), { params: Promise.resolve({ recommendationId: "nba-1" }) });
    const ineligible = await POST(request(), { params: Promise.resolve({ recommendationId: "nba-1" }) });

    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "recommendation/stale" });
    expect(ineligible.status).toBe(409);
    expect(await ineligible.json()).toMatchObject({ code: "recommendation/ineligible" });
  });
});
