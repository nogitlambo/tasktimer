import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  loadRecommendation: vi.fn(),
  skipRecommendation: vi.fn(),
  loadCandidates: vi.fn(),
  saveRecommendation: vi.fn(),
  rank: vi.fn(),
  enforceUidRateLimit: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", async () => ({ ...(await vi.importActual<typeof import("@/app/api/shared/auth")>("@/app/api/shared/auth")), verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/api/shared/rateLimit", async () => ({ enforceUidRateLimit: mocks.enforceUidRateLimit }));
vi.mock("@/app/nextbestaction/lib/nextBestActionRepository", async () => ({
  ...(await vi.importActual<typeof import("@/app/nextbestaction/lib/nextBestActionRepository")>("@/app/nextbestaction/lib/nextBestActionRepository")),
  createFirestoreNextBestActionRepository: vi.fn(() => ({
    loadRecommendation: mocks.loadRecommendation,
    skipRecommendation: mocks.skipRecommendation,
    loadCandidates: mocks.loadCandidates,
    saveRecommendation: mocks.saveRecommendation,
  })),
}));
vi.mock("@/app/nextbestaction/lib/nextBestActionRanking", async () => ({
  ...(await vi.importActual<typeof import("@/app/nextbestaction/lib/nextBestActionRanking")>("@/app/nextbestaction/lib/nextBestActionRanking")),
  rankNextBestActionCandidates: mocks.rank,
}));

import { POST } from "./route";

const previous = {
  id: "nba-1", userId: "uid-1", type: "NEXT_BEST_ACTION", taskId: "task-1", sourceTaskVersion: "version-1", status: "ACTIVE",
  createdAt: "2026-08-07T09:00:00.000Z", expiresAt: "2026-08-07T09:30:00.000Z", auditExpiresAt: "2026-09-06T09:00:00.000Z",
  payload: { title: "First task", firstAction: null, score: 80, confidence: "HIGH", reasonCodes: [], availableMinutes: null, focusWindowMatched: false, durationMinutes: 20, durationSource: "TASK_GOAL", alternativeIndex: 0, explanation: "" },
};

function request(body: Record<string, unknown>) {
  return new Request("https://tasklaunch.app/api/recommendations/next-best-action/nba-1/alternative", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": "token" }, body: JSON.stringify(body) });
}

describe("POST /api/recommendations/next-best-action/[recommendationId]/alternative", () => {
  beforeEach(() => vi.clearAllMocks());
  it("excludes previously shown tasks and persists the next alternative index", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadRecommendation.mockResolvedValue(previous);
    mocks.skipRecommendation.mockResolvedValue("skipped");
    mocks.loadCandidates.mockResolvedValue([]);
    mocks.rank.mockReturnValue({ primary: { taskId: "task-2", title: "Second task", taskVersion: "version-2", score: 70, confidence: "MEDIUM", reasonCodes: [], durationMinutes: 10, durationSource: "DEFAULT", firstAction: null, focusWindowMatched: false } });

    const response = await POST(request({ excludeTaskIds: ["task-1", "task-3"] }), { params: Promise.resolve({ recommendationId: "nba-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.rank).toHaveBeenCalledWith(expect.objectContaining({ excludedTaskIds: ["task-1", "task-3"] }));
    expect(mocks.saveRecommendation).toHaveBeenCalledWith("uid-1", expect.objectContaining({ taskId: "task-2", payload: expect.objectContaining({ alternativeIndex: 1 }) }));
  });

  it("stops at the three-alternative limit", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.loadRecommendation.mockResolvedValue({ ...previous, payload: { ...previous.payload, alternativeIndex: 3 } });

    const response = await POST(request({}), { params: Promise.resolve({ recommendationId: "nba-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "recommendation/alternative-limit" });
    expect(mocks.skipRecommendation).not.toHaveBeenCalled();
  });
});
