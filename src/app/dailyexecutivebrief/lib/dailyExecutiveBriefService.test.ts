import { describe, expect, it, vi } from "vitest";

import { generateDailyExecutiveBrief } from "./dailyExecutiveBriefService";
import type { DailyExecutiveBriefRepository } from "./dailyExecutiveBriefRepository";
import type { DailyExecutiveBriefSnapshot } from "./dailyExecutiveBriefContract";

const snapshot = (sourceVersion: string, expiresAt = "2026-08-07T15:00:00.000Z"): DailyExecutiveBriefSnapshot => ({
  schemaVersion: 1,
  date: "2026-08-07",
  status: "READY",
  plan: {
    version: "daily-executive-brief-planning-v1",
    todayDate: "2026-08-07",
    plannedMinutes: 20,
    completedMinutes: 0,
    remainingMinutes: 20,
    realisticWorkloadRange: { minMinutes: 45, maxMinutes: 60 },
    capacityMinutes: 60,
    capacitySource: "PRODUCT_DEFAULT",
    planHealth: "REALISTIC",
    deadlineRisk: "NONE",
    reasonCodes: [],
    unknownDurationTaskCount: 0,
    activeTaskCount: 1,
    adjustments: [],
  },
  nextBestAction: null,
  clarificationTaskIds: [],
  summary: "Today has 20 minutes of remaining work. 45-60 minutes is a realistic range.",
  sourceVersion,
  generatedAt: "2026-08-07T09:00:00.000Z",
  expiresAt,
});

function repository(overrides: Partial<DailyExecutiveBriefRepository> = {}) {
  return {
    loadSourceContext: vi.fn().mockResolvedValue({ tasks: [{ id: "task-1", estimatedMinutes: 20 }], availability: {}, sourceVersion: "a".repeat(64) }),
    loadBrief: vi.fn().mockResolvedValue(null),
    saveBrief: vi.fn().mockResolvedValue(undefined),
    dismissAdjustment: vi.fn(),
    ...overrides,
  } satisfies DailyExecutiveBriefRepository;
}

describe("generateDailyExecutiveBrief", () => {
  it("reuses a fresh snapshot when the source version is unchanged", async () => {
    const existing = snapshot("a".repeat(64));
    const repo = repository({ loadBrief: vi.fn().mockResolvedValue(existing) });
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z") });
    expect(result).toEqual({ snapshot: existing, reused: true });
    expect(repo.saveBrief).not.toHaveBeenCalled();
  });

  it("regenerates after source changes, expiry, or an explicit refresh", async () => {
    const repo = repository({ loadBrief: vi.fn().mockResolvedValue(snapshot("b".repeat(64), "2026-08-07T09:30:00.000Z")) });
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z"), forceRefresh: true });
    expect(result.reused).toBe(false);
    expect(repo.saveBrief).toHaveBeenCalledOnce();
    expect(result.snapshot.sourceVersion).toBe("a".repeat(64));
  });

  it("uses an available-minutes override as the highest-precedence source and keys freshness to it", async () => {
    const repo = repository();
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z"), availableMinutes: 15 });
    expect(result.snapshot.plan.capacitySource).toBe("USER_SELECTED");
    expect(result.snapshot.plan.capacityMinutes).toBe(15);
    expect(result.snapshot.sourceVersion).not.toBe("a".repeat(64));
  });

  it("preserves a fresh existing brief when source regeneration fails", async () => {
    const existing = snapshot("a".repeat(64));
    const repo = repository({ loadBrief: vi.fn().mockResolvedValue(existing), loadSourceContext: vi.fn().mockRejectedValue(new Error("temporary source failure")) });
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z") });
    expect(result).toEqual({ snapshot: existing, reused: true });
  });

  it("creates explicit empty and insufficient-data snapshots without fabricating workload", async () => {
    const repo = repository({ loadSourceContext: vi.fn().mockResolvedValue({ tasks: [{ id: "task-1", estimatedMinutes: null }], availability: {}, sourceVersion: "c".repeat(64) }) });
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z") });
    expect(result.snapshot.status).toBe("INSUFFICIENT_DATA");
    expect(result.snapshot.plan.plannedMinutes).toBe(0);
  });

  it("keeps the deterministic brief usable when the optional NBA integration fails", async () => {
    const repo = repository();
    const result = await generateDailyExecutiveBrief({ uid: "uid-1", date: "2026-08-07", repository: repo, nowMs: Date.parse("2026-08-07T10:00:00Z"), nextBestActionLoader: vi.fn().mockRejectedValue(new Error("NBA unavailable")) });
    expect(result.snapshot.status).toBe("READY");
    expect(result.snapshot.nextBestAction).toBeNull();
    expect(repo.saveBrief).toHaveBeenCalledOnce();
  });

  it("uses adaptive remaining capacity as the authoritative brief range", async () => {
    const repo = repository({ loadSourceContext: vi.fn().mockResolvedValue({ tasks: [{ id: "task-1", estimatedMinutes: 30 }], availability: {}, sourceVersion: "a".repeat(64) }) });
    const result = await generateDailyExecutiveBrief({
      uid: "uid-1",
      date: "2026-08-07",
      repository: repo,
      nowMs: Date.parse("2026-08-07T10:00:00Z"),
      capacityLoader: vi.fn().mockResolvedValue({
        fullDayRange: { min: 30, max: 60 },
        remainingRange: { min: 15, max: 25 },
        state: "LIGHT",
        confidence: "MEDIUM",
        primarySource: "WEEKDAY_HISTORY",
        sourceSignals: ["WEEKDAY_HISTORY"],
        completedMinutesToday: 30,
        availableMinutesCeiling: 25,
        sourceVersion: "d".repeat(64),
      }),
    });
    expect(result.snapshot.plan.realisticWorkloadRange).toEqual({ minMinutes: 15, maxMinutes: 25 });
    expect(result.snapshot.plan.capacityMinutes).toBe(25);
    expect(result.snapshot.plan.planHealth).toBe("SLIGHTLY_OVERLOADED");
    expect(result.snapshot.adaptiveCapacity?.primarySource).toBe("WEEKDAY_HISTORY");
  });
});
