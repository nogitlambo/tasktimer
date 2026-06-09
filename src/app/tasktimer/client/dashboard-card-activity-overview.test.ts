import { describe, expect, it } from "vitest";
import { fillBackgroundForPct } from "../lib/colors";
import type { Task } from "../lib/types";
import { buildDashboardActivityOverviewModel } from "./dashboard-card-activity-overview";

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    taskType: "recurring",
    timeGoalEnabled: true,
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    ...overrides,
  } as Task;
}

describe("dashboard activity overview model", () => {
  it("combines daily and weekly task goals into a weekly total and daily pace target", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [
        task({ id: "daily", timeGoalPeriod: "day", timeGoalMinutes: 30 }),
        task({ id: "weekly", timeGoalPeriod: "week", timeGoalMinutes: 120 }),
      ],
      historyByTaskId: {},
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.totalGoalMs).toBe((30 * 7 + 120) * 60000);
    expect(model.dailyPaceTargetMs).toBe(((30 * 7 + 120) * 60000) / 7);
    expect(model.hasGoal).toBe(true);
  });

  it("buckets two week-aligned days from the configured week start", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 20 * 60000 },
          { ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 40 * 60000 },
        ],
      },
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.days.map((day) => day.key)).toEqual([
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-17",
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
    ]);
    expect(model.days).toHaveLength(14);
    expect(model.days[7]?.totalMs).toBe(20 * 60000);
    expect(model.days[9]?.totalMs).toBe(40 * 60000);
    expect(model.days[9]?.cumulativeMs).toBe(60 * 60000);
    expect(model.weekTotalMs).toBe(60 * 60000);
    expect(model.visibleTotalMs).toBe(60 * 60000);
  });

  it("aligns the fortnight and current-week total to a non-Monday week start", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 9, 9).getTime(), name: "Focus", ms: 15 * 60000 },
          { ts: new Date(2026, 4, 10, 9).getTime(), name: "Focus", ms: 20 * 60000 },
          { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 40 * 60000 },
        ],
      },
      deletedTaskMeta: {},
      weekStarting: "sun",
      nowMs: new Date(2026, 4, 13, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.days.map((day) => day.key)).toEqual([
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
      "2026-05-11",
      "2026-05-12",
      "2026-05-13",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
    ]);
    expect(model.days[6]?.totalMs).toBe(15 * 60000);
    expect(model.days[7]?.totalMs).toBe(20 * 60000);
    expect(model.days[10]?.totalMs).toBe(40 * 60000);
    expect(model.previousWeekTotalMs).toBe(15 * 60000);
    expect(model.weekTotalMs).toBe(60 * 60000);
  });

  it("adds running task elapsed to today's bucket when no projected live session exists", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "live", running: true })],
      historyByTaskId: {},
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 25 * 60000,
      isTaskRunning: (entry) => !!entry.running,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.days[9]?.totalMs).toBe(25 * 60000);
    expect(model.days[9]?.sessions[0]?.isLive).toBe(true);
  });

  it("shows previous-week entries as visible chart days while keeping week total current-week only", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 11, 9).getTime(), name: "Focus", ms: 15 * 60000 },
          { ts: new Date(2026, 4, 12, 9).getTime(), name: "Focus", ms: 30 * 60000 },
          { ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 60 * 60000 },
        ],
      },
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.previousWeekTotalMs).toBe(45 * 60000);
    expect(model.hasPreviousWeekActivity).toBe(true);
    expect(model.days[0]?.totalMs).toBe(15 * 60000);
    expect(model.days[1]?.totalMs).toBe(30 * 60000);
    expect(model.days[7]?.totalMs).toBe(60 * 60000);
    expect(model.weekTotalMs).toBe(60 * 60000);
    expect(model.visibleTotalMs).toBe(105 * 60000);
    expect(model.days[0]?.previousWeekTotalMs).toBe(0);
    expect(model.days[1]?.previousWeekCumulativeMs).toBe(0);
  });

  it("scales the chart by visible daily activity and daily pace", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 90 * 60000 },
          { ts: new Date(2026, 4, 12, 9).getTime(), name: "Focus", ms: 150 * 60000 },
        ],
      },
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.dailyPaceTargetMs).toBe(120 * 60000);
    expect(model.maxChartMs).toBe(150 * 60000);
  });

  it("derives goal-based bar colors from the daily pace target", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 60 * 60000 },
          { ts: new Date(2026, 4, 19, 9).getTime(), name: "Focus", ms: 120 * 60000 },
          { ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 180 * 60000 },
        ],
      },
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.dailyPaceTargetMs).toBe(120 * 60000);
    expect(model.days[7]?.activityProgressPct).toBe(50);
    expect(model.days[8]?.activityProgressPct).toBe(100);
    expect(model.days[9]?.activityProgressPct).toBe(150);
    expect(model.days[7]?.activityBarColor).toBe(fillBackgroundForPct(50));
    expect(model.days[8]?.activityBarColor).toBe(fillBackgroundForPct(100));
    expect(model.days[9]?.activityBarColor).toBe(fillBackgroundForPct(150));
  });

  it("falls back to the dominant task color when no weekly goal exists", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [
        task({ id: "focus", name: "Focus", timeGoalEnabled: false, color: "#ff5252" }),
        task({ id: "build", name: "Build", timeGoalEnabled: false, color: "#00e5ff" }),
      ],
      historyByTaskId: {
        focus: [{ ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 45 * 60000, color: "#ff5252" }],
        build: [{ ts: new Date(2026, 4, 18, 10).getTime(), name: "Build", ms: 90 * 60000, color: "#00e5ff" }],
      },
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.dailyPaceTargetMs).toBe(0);
    expect(model.days[7]?.activityProgressPct).toBeNull();
    expect(model.days[7]?.activityBarColor).toBe("#00e5ff");
  });

  it("keeps the fallback lime color for empty no-goal days", () => {
    const model = buildDashboardActivityOverviewModel({
      tasks: [task({ id: "focus", timeGoalEnabled: false, color: "#ff5252" })],
      historyByTaskId: {},
      deletedTaskMeta: {},
      weekStarting: "mon",
      nowMs: new Date(2026, 4, 20, 10).getTime(),
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.dailyPaceTargetMs).toBe(0);
    expect(model.days[0]?.activityProgressPct).toBeNull();
    expect(model.days[0]?.activityBarColor).toBe("#d9ff59");
  });
});
