import { describe, expect, it } from "vitest";
import { computeMomentumSnapshot } from "./momentum";
import type { HistoryByTaskId, Task } from "./types";

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 1,
    elapsed: 0,
    running: false,
    startMs: null,
    accumulatedMs: 0,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    timeGoalEnabled: false,
    timeGoalValue: 0,
    timeGoalUnit: "minute",
    timeGoalPeriod: "day",
    timeGoalMinutes: 0,
    taskType: "recurring",
    ...overrides,
  } as Task;
}

function dayStartMs(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).getTime();
}

function entry(ts: number, ms: number) {
  return { ts, ms, name: "Task" };
}

describe("computeMomentumSnapshot recent activity", () => {
  const nowValue = new Date("2026-05-05T12:00:00").getTime();
  const todayStart = dayStartMs("2026-05-05");
  const yesterdayStart = dayStartMs("2026-05-04");
  const twoDaysAgoStart = dayStartMs("2026-05-03");
  const task = buildTask();

  it("returns zero when there are no recent qualifying sessions", () => {
    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId: {},
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBe(0);
  });

  it("scores only today's qualifying session with the today weight", () => {
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [entry(todayStart + 60 * 60 * 1000, 5 * 60 * 1000)],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBeCloseTo(15);
  });

  it("scores today plus yesterday using weighted daily presence", () => {
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        entry(todayStart + 60 * 60 * 1000, 5 * 60 * 1000),
        entry(yesterdayStart + 2 * 60 * 60 * 1000, 5 * 60 * 1000),
      ],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBeCloseTo(24.75);
  });

  it("reaches the full 30 points when all three recent days qualify", () => {
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        entry(todayStart + 60 * 60 * 1000, 5 * 60 * 1000),
        entry(yesterdayStart + 2 * 60 * 60 * 1000, 5 * 60 * 1000),
        entry(twoDaysAgoStart + 3 * 60 * 60 * 1000, 5 * 60 * 1000),
      ],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBeCloseTo(30);
  });

  it("ignores sessions under 5 minutes", () => {
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [entry(todayStart + 60 * 60 * 1000, 4 * 60 * 1000 + 59 * 1000)],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBe(0);
  });

  it("does not increase recent activity for multiple qualifying sessions on the same day", () => {
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        entry(todayStart + 60 * 60 * 1000, 6 * 60 * 1000),
        entry(todayStart + 4 * 60 * 60 * 1000, 25 * 60 * 1000),
      ],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBeCloseTo(15);
  });

  it("counts a running session only when that day contributes at least 5 minutes", () => {
    const runningTask = buildTask({
      id: "task-running",
      running: true,
      startMs: nowValue - 6 * 60 * 1000,
    });

    const result = computeMomentumSnapshot({
      tasks: [runningTask],
      historyByTaskId: {},
      weekStarting: "mon",
      nowValue,
    });

    expect(result.recentActivityScore).toBeCloseTo(15);
  });

  it("uses selected productivity days as the required recent checkpoints", () => {
    const nowValue = new Date("2026-05-06T12:00:00").getTime();
    const mondayStart = dayStartMs("2026-05-04");
    const tuesdayStart = dayStartMs("2026-05-05");
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [
        entry(mondayStart + 60 * 60 * 1000, 10 * 60 * 1000),
        entry(tuesdayStart + 60 * 60 * 1000, 10 * 60 * 1000),
      ],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      optimalProductivityDays: ["mon", "tue"],
      nowValue,
    });

    expect(result.recentActivityScore).toBeGreaterThan(0);
    expect(result.recentQualifiedLabels).toEqual(["Tue", "Mon"]);
  });

  it("allows off-day activity to add recent credit without fully replacing selected-day coverage", () => {
    const nowValue = new Date("2026-05-06T12:00:00").getTime();
    const wednesdayStart = dayStartMs("2026-05-06");
    const historyByTaskId: HistoryByTaskId = {
      [task.id]: [entry(wednesdayStart + 60 * 60 * 1000, 10 * 60 * 1000)],
    };

    const result = computeMomentumSnapshot({
      tasks: [task],
      historyByTaskId,
      weekStarting: "mon",
      optimalProductivityDays: ["mon", "tue"],
      nowValue,
    });

    expect(result.recentActivityScore).toBeGreaterThan(0);
    expect(result.recentActivityScore).toBeLessThan(10);
  });
});
