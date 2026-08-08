import { describe, expect, it } from "vitest";

import { summarizeRecoveryEligibilitySource } from "./recoveryRepository";

describe("Recovery eligibility source", () => {
  it("counts active carried-over work, overdue tasks, and known backlog duration", () => {
    const result = summarizeRecoveryEligibilitySource({
      localDate: "2026-08-08",
      timezone: "UTC",
      nowMs: Date.parse("2026-08-08T12:00:00.000Z"),
      tasks: [
        { id: "overdue", active: true, completed: false, actionable: true, onceOffTargetDate: "2026-08-01", timeGoalMinutes: 30 },
        { id: "carried", active: true, completed: false, actionable: true, resumePendingSinceDayKey: "2026-08-06", timeGoalMinutes: 15 },
        { id: "future", active: true, completed: false, actionable: true, onceOffTargetDate: "2026-08-10", timeGoalMinutes: 60 },
        { id: "done", active: true, completed: true, actionable: true, onceOffTargetDate: "2026-08-01", timeGoalMinutes: 45 },
      ],
      historyEntries: [],
      scheduleRepairs: [],
    });

    expect(result).toMatchObject({
      actionableBacklogCount: 2,
      overdueCount: 1,
      backlogEstimatedMinutes: 45,
      inactiveLocalDays: 0,
    });
  });

  it("derives inactivity and missed scheduled days from meaningful history", () => {
    const result = summarizeRecoveryEligibilitySource({
      localDate: "2026-08-08",
      timezone: "UTC",
      nowMs: Date.parse("2026-08-08T12:00:00.000Z"),
      tasks: [
        { id: "routine", active: true, completed: false, actionable: true, taskType: "recurring", plannedStartDay: "mon", createdAtMs: Date.parse("2026-07-01T12:00:00.000Z") },
      ],
      historyEntries: [
        { ts: Date.parse("2026-08-01T12:00:00.000Z"), ms: 5 * 60 * 1000 },
        { ts: Date.parse("2026-08-07T12:00:00.000Z"), ms: 2 * 60 * 1000 },
      ],
      scheduleRepairs: [],
    });

    expect(result.inactiveLocalDays).toBe(7);
    expect(result.missedScheduledDays).toBeGreaterThanOrEqual(3);
  });
});
