import { describe, expect, it, vi } from "vitest";

import { createPlanningRefreshAdapters, type PlanningRefreshDependencies } from "./trustedAutomationPlanningAdapters";
import type { DailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";

const base = {
  uid: "uid-1",
  authenticatedUserId: "uid-1",
  entityVersion: "source-v1",
  currentEntityVersion: "source-v1",
  idempotencyKey: "9d2f1b31-6f3b-4d9e-8b3a-4f2c0b2a1d01",
  nowMs: Date.parse("2026-08-09T09:00:00.000Z"),
};

function dependencies(overrides: Partial<PlanningRefreshDependencies> = {}) {
  return {
    dailyBrief: {
      generate: vi.fn().mockResolvedValue({ snapshot: { sourceVersion: "brief-v1" }, reused: false }),
      createRepository: vi.fn(() => ({})),
      ...overrides.dailyBrief,
    },
    capacity: {
      get: vi.fn().mockResolvedValue({ snapshot: { sourceVersion: "capacity-v1" }, reused: false }),
      createRepository: vi.fn(() => ({})),
      ...overrides.capacity,
    },
    nextBestAction: {
      resolve: vi.fn().mockResolvedValue({ recommendation: { recommendationId: "nba-new", sourceTaskVersion: "task-v1" }, clarificationTaskIds: [] }),
      createRepository: vi.fn(() => ({ invalidateActiveRecommendations: vi.fn().mockResolvedValue(2) })),
      ...overrides.nextBestAction,
    },
  } as PlanningRefreshDependencies;
}

describe("Trusted Automation planning refresh adapters", () => {
  it("invokes Daily Brief through its owning service and replays duplicate requests", async () => {
    const deps = dependencies();
    const adapters = createPlanningRefreshAdapters(deps);
    const input = { ...base, entityId: "2026-08-09", date: "2026-08-09", timezone: "UTC" };

    await expect(adapters.refreshDailyBrief(input)).resolves.toMatchObject({ kind: "REFRESHED", adapter: "DAILY_BRIEF", sourceVersion: "brief-v1" });
    await expect(adapters.refreshDailyBrief(input)).resolves.toMatchObject({ kind: "REPLAYED", adapter: "DAILY_BRIEF", sourceVersion: "brief-v1" });
    expect(deps.dailyBrief?.generate).toHaveBeenCalledTimes(1);
    expect(deps.dailyBrief?.generate).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", date: "2026-08-09", forceRefresh: true }));
  });

  it.each([
    ["ownership", { authenticatedUserId: "another-user" }, "OWNERSHIP_FAILED"],
    ["stale entity", { currentEntityVersion: "source-v0" }, "ENTITY_STALE"],
    ["unavailable feature", { featureAvailable: false }, "FEATURE_UNAVAILABLE"],
    ["wrong entity", { entityId: "2026-08-10" }, "ENTITY_MISMATCH"],
  ])("rejects %s before invoking a feature service", async (_label, patch, reason) => {
    const deps = dependencies();
    const adapters = createPlanningRefreshAdapters(deps);
    const result = await adapters.refreshCapacitySnapshot({ ...base, entityId: "2026-08-09", localDate: "2026-08-09", timezone: "UTC", ...patch });

    expect(result).toMatchObject({ kind: "SKIPPED", reason });
    expect(deps.capacity?.get).not.toHaveBeenCalled();
  });

  it("uses the authoritative Adaptive Capacity service and preserves dependency failures", async () => {
    const deps = dependencies();
    const adapters = createPlanningRefreshAdapters(deps);
    const input = { ...base, entityId: "2026-08-09", localDate: "2026-08-09", timezone: "UTC" };

    await expect(adapters.refreshCapacitySnapshot(input)).resolves.toMatchObject({ kind: "REFRESHED", sourceVersion: "capacity-v1" });
    const failing = dependencies({ capacity: { get: vi.fn().mockRejectedValue(new Error("capacity unavailable")), createRepository: vi.fn(() => ({} as DailyCapacityRepository)) } });
    await expect(createPlanningRefreshAdapters(failing).refreshCapacitySnapshot({ ...input, idempotencyKey: "0b8e2f38-13d4-47da-95d9-0f73d5db7da1" })).resolves.toMatchObject({ kind: "FAILED", reason: "DEPENDENCY_UNAVAILABLE" });
  });

  it("refreshes NBA through its existing resolver and invalidates prior active recommendations", async () => {
    const invalidator = vi.fn().mockResolvedValue(2);
    const repository = { invalidateActiveRecommendations: invalidator };
    const createRepository = vi.fn(() => repository as never);
    const deps = dependencies({ nextBestAction: { createRepository } });
    const adapters = createPlanningRefreshAdapters(deps);
    const input = { ...base, entityId: "2026-08-09", date: "2026-08-09", timezone: "UTC" };

    await expect(adapters.refreshNextBestAction(input)).resolves.toMatchObject({ kind: "REFRESHED", adapter: "NEXT_BEST_ACTION", sourceVersion: "task-v1" });
    expect(invalidator).toHaveBeenCalledWith({ uid: "uid-1", nowMs: base.nowMs, exceptRecommendationId: "nba-new" });
    expect(deps.nextBestAction?.resolve).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", date: "2026-08-09", repository }));
  });
});
