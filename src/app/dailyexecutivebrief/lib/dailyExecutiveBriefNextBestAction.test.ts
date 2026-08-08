import { describe, expect, it, vi } from "vitest";

import type { NextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";
import { resolveDailyBriefNextBestAction } from "./dailyExecutiveBriefNextBestAction";

function repository(candidates: unknown[]): NextBestActionRepository {
  return {
    loadCandidates: vi.fn().mockResolvedValue(candidates),
    saveRecommendation: vi.fn().mockResolvedValue(undefined),
    loadRecommendation: vi.fn(),
    skipRecommendation: vi.fn(),
    dismissRecommendation: vi.fn(),
    startRecommendation: vi.fn(),
  };
}

const candidate = {
  ownerUid: "uid-1",
  taskVersion: "task-version-1",
  task: {
    id: "task-1",
    name: "Prepare launch",
    order: 0,
    onceOffTargetDate: "2026-08-07",
    timeGoalMinutes: 15,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
  },
  clarification: { status: "ACTIVE", firstAction: "Open the checklist." },
};

describe("resolveDailyBriefNextBestAction", () => {
  it("uses the existing ranking and recommendation contract for an available action", async () => {
    const repo = repository([candidate]);
    const result = await resolveDailyBriefNextBestAction({ uid: "uid-1", date: "2026-08-07", nowMs: Date.parse("2026-08-07T09:00:00Z"), timezone: "UTC", repository: repo });
    expect(result.recommendation).toMatchObject({ taskId: "task-1", title: "Prepare launch", sourceTaskVersion: "task-version-1" });
    expect(result.clarificationTaskIds).toEqual(["task-1"]);
    expect(repo.saveRecommendation).toHaveBeenCalledWith("uid-1", expect.objectContaining({ taskId: "task-1", type: "NEXT_BEST_ACTION" }));
  });

  it("omits unavailable recommendations without failing brief generation", async () => {
    const repo = repository([{ ...candidate, ownerUid: "other-user" }]);
    const result = await resolveDailyBriefNextBestAction({ uid: "uid-1", date: "2026-08-07", nowMs: Date.parse("2026-08-07T09:00:00Z"), timezone: "UTC", repository: repo });
    expect(result.recommendation).toBeNull();
    expect(repo.saveRecommendation).not.toHaveBeenCalled();
  });

  it("passes adaptive remaining capacity into the existing ranking path", async () => {
    const repo = repository([candidate]);
    const result = await resolveDailyBriefNextBestAction({ uid: "uid-1", date: "2026-08-07", nowMs: Date.parse("2026-08-07T09:00:00Z"), timezone: "UTC", remainingCapacityRange: { min: 10, max: 20 }, repository: repo });
    expect(result.recommendation?.reasonCodes).toContain("FITS_REMAINING_CAPACITY");
  });
});
