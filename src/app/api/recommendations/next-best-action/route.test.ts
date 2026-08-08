import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  createFirestoreNextBestActionRepository: vi.fn(),
  loadCandidates: vi.fn(),
  saveRecommendation: vi.fn(),
  enforceUidRateLimit: vi.fn(),
  createCapacityRepository: vi.fn(),
  getCapacity: vi.fn(),
}));

vi.mock("../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/auth")>();
  return { ...actual, verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser };
});
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/api/shared/rateLimit", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/app/api/shared/rateLimit")>()), enforceUidRateLimit: mocks.enforceUidRateLimit }));
vi.mock("@/app/nextbestaction/lib/nextBestActionRepository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/nextbestaction/lib/nextBestActionRepository")>();
  return { ...actual, createFirestoreNextBestActionRepository: mocks.createFirestoreNextBestActionRepository };
});
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityRepository", () => ({ createFirestoreDailyCapacityRepository: mocks.createCapacityRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityService", () => ({ getDailyCapacity: mocks.getCapacity }));

import type { Task } from "@/app/tasktimer/lib/types";
import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.app/api/recommendations/next-best-action", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://localhost" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recommendations/next-best-action", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T09:00:00.000Z"));
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1", email: "user@example.com", idToken: "token" });
    mocks.getFirebaseAdminDb.mockReturnValue({ name: "db" });
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.loadCandidates.mockResolvedValue([
      {
        ownerUid: "uid-1",
        taskVersion: "version-server",
        task: {
          id: "task-1",
          name: "Prepare launch",
          order: 0,
          onceOffTargetDate: "2026-08-09",
          createdAtMs: 1,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          collapsed: false,
          milestonesEnabled: false,
          milestones: [],
          hasStarted: false,
        } as Task,
        userConfirmedDurationMinutes: 15,
        clarification: { firstAction: "Open the launch checklist." },
      },
    ]);
    mocks.saveRecommendation.mockResolvedValue(undefined);
    mocks.createFirestoreNextBestActionRepository.mockReturnValue({
      loadCandidates: mocks.loadCandidates,
      saveRecommendation: mocks.saveRecommendation,
    });
    mocks.createCapacityRepository.mockReturnValue({});
    mocks.getCapacity.mockResolvedValue({ snapshot: { remainingRange: { min: 10, max: 20 } } });
  });

  it("rejects unauthenticated recommendation requests", async () => {
    mocks.verifyFirebaseRequestUser.mockRejectedValueOnce(
      Object.assign(new Error("You must be signed in to continue."), {
        status: 401,
        code: "auth/unauthenticated",
      })
    );

    const result = await POST(request());
    const payload = await result.json();

    expect(result.status).toBe(401);
    expect(payload).toMatchObject({ code: "auth/unauthenticated" });
  });

  it("ranks server-loaded candidates and persists a user-owned recommendation", async () => {
    const result = await POST(
      request({
        availableMinutes: 20,
        excludeTaskIds: ["task-client-exclusion"],
        title: "Client supplied title",
        score: 999,
        reasonCodes: ["INVENTED_REASON"],
      })
    );
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      recommendation: {
        taskId: "task-1",
        title: "Prepare launch",
        firstAction: "Open the launch checklist.",
        durationSource: "USER_CONFIRMED",
        type: "NEXT_BEST_ACTION",
      },
    });
    expect(payload.recommendation.score).not.toBe(999);
    expect(payload.recommendation.reasonCodes).not.toContain("INVENTED_REASON");
    expect(payload.recommendation.reasonCodes).toContain("FITS_REMAINING_CAPACITY");
    expect(payload.recommendation).not.toHaveProperty("userId");
    expect(mocks.loadCandidates).toHaveBeenCalledWith({
      uid: "uid-1",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      timezone: "UTC",
    });
    expect(mocks.saveRecommendation).toHaveBeenCalledWith(
      "uid-1",
      expect.objectContaining({
        type: "NEXT_BEST_ACTION",
        userId: "uid-1",
        taskId: "task-1",
        sourceTaskVersion: "version-server",
        status: "ACTIVE",
        expiresAt: "2026-08-07T09:30:00.000Z",
      })
    );
  });

  it("returns the empty state without fabricating or persisting a recommendation", async () => {
    mocks.loadCandidates.mockResolvedValueOnce([]);

    const result = await POST(request({ availableMinutes: 10 }));
    const payload = await result.json();

    expect(result.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      recommendation: null,
      empty: true,
      message: "Nothing needs your attention right now.",
    });
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("rejects malformed client context before loading server candidates", async () => {
    const result = await POST(request({ availableMinutes: 0, taskId: "client-task", priority: "high" }));
    const payload = await result.json();

    expect(result.status).toBe(400);
    expect(payload).toMatchObject({ code: "recommendation/invalid-available-time" });
    expect(mocks.loadCandidates).not.toHaveBeenCalled();
  });

  it("does not load or persist recommendations for a deleted account", async () => {
    mocks.isDeletedAccountUid.mockResolvedValueOnce(true);

    const result = await POST(request());
    const payload = await result.json();

    expect(result.status).toBe(410);
    expect(payload).toMatchObject({ code: "auth/account-deleted" });
    expect(mocks.loadCandidates).not.toHaveBeenCalled();
    expect(mocks.saveRecommendation).not.toHaveBeenCalled();
  });

  it("returns a generic failure when server ranking data cannot be loaded", async () => {
    mocks.loadCandidates.mockRejectedValueOnce(new Error("private task data must not be exposed"));

    const result = await POST(request());
    const payload = await result.json();

    expect(result.status).toBe(500);
    expect(payload).toEqual({
      error: "TaskLaunch could not choose a recommendation right now.",
      code: "recommendation/internal",
    });
  });

  it("keeps the existing ranking behavior when adaptive capacity is unavailable", async () => {
    mocks.getCapacity.mockRejectedValueOnce(new Error("capacity unavailable"));
    const result = await POST(request({ availableMinutes: 20 }));
    const payload = await result.json();
    expect(result.status).toBe(200);
    expect(payload.recommendation.reasonCodes).not.toContain("FITS_REMAINING_CAPACITY");
  });
});
