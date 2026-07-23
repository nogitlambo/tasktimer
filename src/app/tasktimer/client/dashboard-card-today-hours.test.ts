import { describe, expect, it } from "vitest";
import type { Task } from "../lib/types";
import {
  buildDashboardTodayHoursModel,
  classifyDashboardTodayTrendIcon,
  formatDashboardTodayHoursDeltaText,
} from "./dashboard-card-today-hours";

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

describe("dashboard today hours card module", () => {
  it("derives today's logged, live, goal, and trend values without rendering DOM", () => {
    const nowMs = new Date("2026-05-05T12:00:00Z").getTime();
    const yesterdaySameTimeMs = new Date("2026-05-04T11:00:00Z").getTime();
    const afterYesterdayCutoffMs = new Date("2026-05-04T13:00:00Z").getTime();

    const model = buildDashboardTodayHoursModel({
      tasks: [
        task({ id: "task-1", name: "Logged", timeGoalMinutes: 60 }),
        task({
          id: "task-2",
          name: "Live",
          running: true,
          timeGoalMinutes: 30,
        }),
      ],
      historyByTaskId: {
        "task-1": [
          { ts: nowMs - 1000, name: "Logged", ms: 30 * 60 * 1000 },
          { ts: yesterdaySameTimeMs, name: "Logged", ms: 20 * 60 * 1000 },
          { ts: afterYesterdayCutoffMs, name: "Logged", ms: 50 * 60 * 1000 },
        ],
      },
      nowMs,
      trendMinBaselineMs: 15 * 60 * 1000,
      getElapsedMs: (entry) => (entry.id === "task-2" ? 15 * 60 * 1000 : 0),
      isTaskRunning: (entry) => !!entry.running,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.todayLoggedMs).toBe(30 * 60 * 1000);
    expect(model.todayInProgressMs).toBe(15 * 60 * 1000);
    expect(model.todayMs).toBe(45 * 60 * 1000);
    expect(model.previousProductivityDaySameTimeMs).toBe(20 * 60 * 1000);
    expect(model.previousProductivityDaySameTimeEntryCount).toBe(1);
    expect(model.hasUsableTrendBaseline).toBe(true);
    expect(model.totalDailyGoalMs).toBe(90 * 60 * 1000);
    expect(model.dailyGoalLoggedMs).toBe(30 * 60 * 1000);
    expect(model.dailyGoalInProgressMs).toBe(15 * 60 * 1000);
    expect(model.dailyGoalElapsedMs).toBe(45 * 60 * 1000);
    expect(model.dailyGoalProjectedMs).toBe(45 * 60 * 1000);
    expect(model.dailyGoalProgressPct).toBe(50);
    expect(model.dailyGoalProjectedPct).toBe(50);
    expect(model.showDirectionalTrendArrow).toBe(true);
  });

  it("compares Monday to the previous selected productivity day", () => {
    const nowMs = new Date(2026, 4, 18, 12).getTime();
    const previousFridayBeforeCutoffMs = new Date(2026, 4, 15, 11).getTime();
    const previousFridayAfterCutoffMs = new Date(2026, 4, 15, 13).getTime();
    const previousSundayMs = new Date(2026, 4, 17, 11).getTime();

    const model = buildDashboardTodayHoursModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: nowMs - 1000, name: "Focus", ms: 45 * 60000 },
          { ts: previousFridayBeforeCutoffMs, name: "Focus", ms: 30 * 60000 },
          { ts: previousFridayAfterCutoffMs, name: "Focus", ms: 60 * 60000 },
          { ts: previousSundayMs, name: "Focus", ms: 90 * 60000 },
        ],
      },
      nowMs,
      trendMinBaselineMs: 15 * 60 * 1000,
      optimalProductivityDays: ["mon", "wed", "fri"],
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.todayMs).toBe(45 * 60000);
    expect(model.previousProductivityDaySameTimeMs).toBe(30 * 60000);
    expect(model.previousProductivityDaySameTimeEntryCount).toBe(1);
    expect(model.hasUsableTrendBaseline).toBe(true);
  });

  it("preserves yesterday comparison when all days are productivity days", () => {
    const nowMs = new Date(2026, 4, 18, 12).getTime();

    const model = buildDashboardTodayHoursModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: nowMs - 1000, name: "Focus", ms: 45 * 60000 },
          { ts: new Date(2026, 4, 17, 11).getTime(), name: "Focus", ms: 30 * 60000 },
          { ts: new Date(2026, 4, 15, 11).getTime(), name: "Focus", ms: 90 * 60000 },
        ],
      },
      nowMs,
      trendMinBaselineMs: 15 * 60 * 1000,
      optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.previousProductivityDaySameTimeMs).toBe(30 * 60000);
    expect(model.hasUsableTrendBaseline).toBe(true);
  });

  it("marks the previous productivity day baseline unavailable when it is below the minimum", () => {
    const nowMs = new Date(2026, 4, 18, 12).getTime();

    const model = buildDashboardTodayHoursModel({
      tasks: [task({ id: "focus" })],
      historyByTaskId: {
        focus: [
          { ts: nowMs - 1000, name: "Focus", ms: 45 * 60000 },
          { ts: new Date(2026, 4, 15, 11).getTime(), name: "Focus", ms: 10 * 60000 },
        ],
      },
      nowMs,
      trendMinBaselineMs: 15 * 60 * 1000,
      optimalProductivityDays: ["mon", "wed", "fri"],
      getElapsedMs: () => 0,
      isTaskRunning: () => false,
      normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    });

    expect(model.previousProductivityDaySameTimeMs).toBe(10 * 60000);
    expect(model.hasUsableTrendBaseline).toBe(false);
  });

  it("formats delta text and sentiment for the render layer", () => {
    const formatted = formatDashboardTodayHoursDeltaText(
      { todayMs: 45 * 60 * 1000, yesterdaySameTimeMs: 30 * 60 * 1000 },
      (ms) => `${Math.round(ms / 60000)}m`,
    );

    expect(formatted).toEqual({
      text: "+15m vs previous productivity day",
      sentiment: "positive",
    });
  });

  it.each([
    [100, "trendUp"],
    [99, "trendUpRight"],
    [50, "trendUpRight"],
    [49, "trendRight"],
    [0, "trendRight"],
    [-49, "trendRight"],
    [-50, "trendDownRight"],
    [-99, "trendDownRight"],
    [-100, "trendDown"],
    [-125, "trendDown"],
  ] as const)("classifies %i percent for the Today trend icon", (deltaPct, className) => {
    expect(classifyDashboardTodayTrendIcon(deltaPct).className).toBe(className);
  });
});
