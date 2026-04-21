import { describe, expect, it } from "vitest";

import { computeMomentumSnapshot } from "./momentum";
import type { HistoryByTaskId, Task } from "./types";

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Deep Work",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function createSnapshot(opts?: {
  now?: string;
  task?: Partial<Task>;
  historyByTaskId?: HistoryByTaskId;
}) {
  const nowValue = new Date(opts?.now || "2026-04-17T12:00:00.000Z").getTime();
  return computeMomentumSnapshot({
    tasks: [createTask(opts?.task)],
    historyByTaskId: opts?.historyByTaskId || {},
    weekStarting: "mon",
    nowValue,
  });
}

describe("computeMomentumSnapshot", () => {
  it("keeps consistency at zero for a 1-day trailing streak", () => {
    const snapshot = createSnapshot({
      historyByTaskId: {
        "task-1": [{ ts: new Date("2026-04-17T09:00:00.000Z").getTime(), name: "Deep Work", ms: 45 * 60 * 1000 }],
      },
    });

    expect(snapshot.activeDayCount).toBe(1);
    expect(snapshot.trailingStreak).toBe(1);
    expect(snapshot.consistencyScore).toBe(0);
  });

  it("awards consistency for a 2-day trailing streak", () => {
    const snapshot = createSnapshot({
      historyByTaskId: {
        "task-1": [
          { ts: new Date("2026-04-17T09:00:00.000Z").getTime(), name: "Deep Work", ms: 45 * 60 * 1000 },
          { ts: new Date("2026-04-16T09:00:00.000Z").getTime(), name: "Deep Work", ms: 45 * 60 * 1000 },
        ],
      },
    });

    expect(snapshot.activeDayCount).toBe(2);
    expect(snapshot.trailingStreak).toBe(2);
    expect(snapshot.consistencyScore).toBeGreaterThan(0);
  });

  it("keeps consistency at zero for non-consecutive active days", () => {
    const snapshot = createSnapshot({
      historyByTaskId: {
        "task-1": [
          { ts: new Date("2026-04-17T09:00:00.000Z").getTime(), name: "Deep Work", ms: 45 * 60 * 1000 },
          { ts: new Date("2026-04-15T09:00:00.000Z").getTime(), name: "Deep Work", ms: 45 * 60 * 1000 },
        ],
      },
    });

    expect(snapshot.activeDayCount).toBe(2);
    expect(snapshot.trailingStreak).toBe(1);
    expect(snapshot.consistencyScore).toBe(0);
  });

  it("leaves other momentum drivers unchanged while consistency is gated", () => {
    const now = "2026-04-17T12:00:00.000Z";
    const nowValue = new Date(now).getTime();
    const snapshot = createSnapshot({
      now,
      task: {
        running: true,
        startMs: nowValue - 30 * 60 * 1000,
        timeGoalEnabled: true,
        timeGoalMinutes: 180,
        timeGoalPeriod: "week",
      },
      historyByTaskId: {
        "task-1": [{ ts: new Date("2026-04-17T09:00:00.000Z").getTime(), name: "Deep Work", ms: 90 * 60 * 1000 }],
      },
    });

    expect(snapshot.trailingStreak).toBe(1);
    expect(snapshot.consistencyScore).toBe(0);
    expect(snapshot.recentActivityScore).toBeGreaterThan(0);
    expect(snapshot.weeklyProgressScore).toBeGreaterThan(0);
    expect(snapshot.activeSessionBonus).toBe(6);
  });
});
