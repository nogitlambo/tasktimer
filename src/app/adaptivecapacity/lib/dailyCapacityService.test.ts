import { describe, expect, it, vi } from "vitest";

import { getDailyCapacity } from "./dailyCapacityService";

const baseSource = {
  completedMinutesToday: 15,
  availableMinutesCeiling: null,
  sourceVersion: "b".repeat(64),
};

describe("getDailyCapacity", () => {
  it("persists a user-owned snapshot with completed work subtracted", async () => {
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue(baseSource),
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await getDailyCapacity({
      uid: "uid-1",
      localDate: "2026-08-07",
      timezone: "UTC",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      repository,
    });

    expect(result.reused).toBe(false);
    expect(result.snapshot.userId).toBe("uid-1");
    expect(result.snapshot.fullDayRange).toEqual({ min: 30, max: 60 });
    expect(result.snapshot.remainingRange).toEqual({ min: 15, max: 45 });
    expect(repository.saveSnapshot).toHaveBeenCalledWith(result.snapshot);
  });

  it("reuses a fresh snapshot when the source version is unchanged", async () => {
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue({ ...baseSource, completedMinutesToday: 0 }),
      loadSnapshot: vi.fn(),
      saveSnapshot: vi.fn(),
    };
    const first = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: 1_000, repository });
    repository.loadSnapshot.mockResolvedValue(first.snapshot);

    const second = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: 2_000, repository });

    expect(second).toEqual({ snapshot: first.snapshot, reused: true });
    expect(repository.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it("uses a reliable weekday aggregate instead of the product default", async () => {
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue({
        completedMinutesToday: 10,
        availableMinutesCeiling: null,
        sourceVersion: "c".repeat(64),
        historyFeatures: {
          weekdayStats: {
            "1": { sampleSize: 4, p25Minutes: 40, medianMinutes: 55, p75Minutes: 70 },
          },
          rolling28DayP25Minutes: 35,
          rolling28DayP75Minutes: 65,
          rolling28DayMedianMinutes: 50,
          validDayCount: 8,
          varianceBand: "MEDIUM",
        },
      }),
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-31", timezone: "UTC", nowMs: Date.parse("2026-08-31T09:00:00.000Z"), repository });

    expect(result.snapshot.primarySource).toBe("WEEKDAY_HISTORY");
    expect(result.snapshot.fullDayRange).toEqual({ min: 40, max: 70 });
    expect(result.snapshot.remainingRange).toEqual({ min: 30, max: 60 });
    expect(result.snapshot.sourceSignals).toContain("WEEKDAY_HISTORY");
  });

  it("persists and clears a manual override without changing the history source", async () => {
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue(baseSource),
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    const override = { type: "MINUTES" as const, minutes: 45, createdAt: "2026-08-07T09:00:00.000Z" };
    const adjusted = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:00:00.000Z"), manualOverride: override, forceRefresh: true, repository });
    expect(adjusted.snapshot.manualOverride).toEqual(override);
    expect(adjusted.snapshot.primarySource).toBe("USER_CUSTOM");

    repository.loadSnapshot.mockResolvedValue(adjusted.snapshot);
    const cleared = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), manualOverride: null, forceRefresh: true, repository });
    expect(cleared.snapshot.manualOverride).toBeNull();
    expect(cleared.snapshot.primarySource).toBe("DEFAULT");
    expect(cleared.snapshot.sourceVersion).not.toBe(adjusted.snapshot.sourceVersion);
  });

  it("uses a trusted focus-window ceiling when no explicit ceiling is supplied", async () => {
    const repository = {
      loadSourceContext: vi.fn().mockResolvedValue({ ...baseSource, availableMinutesCeiling: 20 }),
      loadSnapshot: vi.fn().mockResolvedValue(null),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
    };

    const result = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:00:00.000Z"), repository });

    expect(result.snapshot.fullDayRange).toEqual({ min: 20, max: 20 });
    expect(result.snapshot.sourceSignals).toContain("FOCUS_WINDOW_REMAINING");
  });

  it("preserves a valid snapshot when source loading fails during a normal refresh", async () => {
    const existing = await getDailyCapacity({
      uid: "uid-1",
      localDate: "2026-08-07",
      timezone: "UTC",
      nowMs: Date.parse("2026-08-07T09:00:00.000Z"),
      repository: {
        loadSourceContext: vi.fn().mockResolvedValue(baseSource),
        loadSnapshot: vi.fn().mockResolvedValue(null),
        saveSnapshot: vi.fn().mockResolvedValue(undefined),
      },
    });
    const repository = {
      loadSourceContext: vi.fn().mockRejectedValue(new Error("history unavailable")),
      loadSnapshot: vi.fn().mockResolvedValue(existing.snapshot),
      saveSnapshot: vi.fn(),
    };

    const result = await getDailyCapacity({ uid: "uid-1", localDate: "2026-08-07", timezone: "UTC", nowMs: Date.parse("2026-08-07T09:05:00.000Z"), repository });

    expect(result).toEqual({ snapshot: existing.snapshot, reused: true });
    expect(repository.saveSnapshot).not.toHaveBeenCalled();
  });
});
