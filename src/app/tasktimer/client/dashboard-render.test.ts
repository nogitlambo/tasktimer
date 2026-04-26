import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerDashboardRender } from "./dashboard-render";
import type { TaskTimerDashboardRenderContext } from "./context";

describe("dashboard render zero states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function installCompletedCardDom() {
    const cardEl = { setAttribute: vi.fn() };
    const valueEl = {
      innerHTML: "",
      closest: vi.fn(() => cardEl),
    };
    const ticksEl = { innerHTML: "" };
    const metaEl = { textContent: "", style: { display: "block" } };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: vi.fn((id: string) => {
          if (id === "dashboardTasksCompletedValue") return valueEl;
          if (id === "dashboardTasksCompletedTicks") return ticksEl;
          if (id === "dashboardTasksCompletedMeta") return metaEl;
          return null;
        }),
      },
    });

    return { cardEl, valueEl, ticksEl, metaEl };
  }

  it("renders Tasks Completed as 0/0 instead of holding stale data after history is cleared", () => {
    const { cardEl, valueEl, ticksEl, metaEl } = installCompletedCardDom();
    valueEl.innerHTML = '<span class="dashboardTasksCompletedDone">4</span>';
    ticksEl.innerHTML = '<span class="dashboardTasksCompletedTick isComplete"></span>';
    metaEl.textContent = "stale";
    const renderedData = {
      tasksCompleted: true,
      momentum: false,
      focusTrend: false,
      heatCalendar: false,
      modeDistribution: false,
      avgSession: false,
      timeline: false,
    };

    const ctx = {
      getTasks: vi.fn(() => []),
      getHistoryByTaskId: vi.fn(() => ({})),
      getWeekStarting: vi.fn(() => "monday"),
      getDashboardWidgetHasRenderedData: vi.fn(() => renderedData),
      getDashboardRefreshHoldActive: vi.fn(() => true),
      getCloudRefreshInFlight: vi.fn(() => null),
      getIsOnboardingDashboardPreview: vi.fn(() => false),
      normalizeHistoryTimestampMs: vi.fn((value) => Number(value)),
    } as unknown as TaskTimerDashboardRenderContext;

    createTaskTimerDashboardRender(ctx).renderDashboardTasksCompletedCard();

    expect(valueEl.innerHTML).toContain("dashboardTasksCompletedDone\">0</span>");
    expect(valueEl.innerHTML).toContain("dashboardTasksCompletedTotal\">0</span>");
    expect(ticksEl.innerHTML).toBe("");
    expect(metaEl.textContent).toBe("");
    expect(metaEl.style.display).toBe("none");
    expect(renderedData.tasksCompleted).toBe(false);
    expect(cardEl.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      "Today's task completion. 0 of 0 daily completion opportunities complete."
    );
  });

  it("counts only today's daily goal opportunities in the Completed dashboard panel", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));
    const { cardEl, valueEl, ticksEl } = installCompletedCardDom();
    const renderedData = {
      tasksCompleted: false,
      momentum: false,
      focusTrend: false,
      heatCalendar: false,
      modeDistribution: false,
      avgSession: false,
      timeline: false,
    };
    const dayMs = 24 * 60 * 60 * 1000;
    const monday = new Date("2026-04-20T09:00:00").getTime();
    const today = new Date("2026-04-22T09:00:00").getTime();

    const ctx = {
      getTasks: vi.fn(() => [
        { id: "daily", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 30 },
        { id: "daily2", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 20 },
        { id: "weekly", timeGoalEnabled: true, timeGoalPeriod: "week", timeGoalMinutes: 60 },
      ]),
      getHistoryByTaskId: vi.fn(() => ({
        daily: [
          { ts: monday, ms: 30 * 60 * 1000 },
          { ts: monday + dayMs, ms: 15 * 60 * 1000 },
          { ts: today, ms: 30 * 60 * 1000 },
        ],
        daily2: [{ ts: today, ms: 10 * 60 * 1000 }],
        weekly: [{ ts: monday, ms: 60 * 60 * 1000 }],
      })),
      getWeekStarting: vi.fn(() => "monday"),
      getDashboardWidgetHasRenderedData: vi.fn(() => renderedData),
      getDashboardRefreshHoldActive: vi.fn(() => false),
      getCloudRefreshInFlight: vi.fn(() => null),
      getIsOnboardingDashboardPreview: vi.fn(() => false),
      normalizeHistoryTimestampMs: vi.fn((value) => Number(value)),
    } as unknown as TaskTimerDashboardRenderContext;

    createTaskTimerDashboardRender(ctx).renderDashboardTasksCompletedCard();

    expect(valueEl.innerHTML).toContain("dashboardTasksCompletedDone\">1</span>");
    expect(valueEl.innerHTML).toContain("dashboardTasksCompletedTotal\">2</span>");
    expect((ticksEl.innerHTML.match(/dashboardTasksCompletedTick(?:\s|")/g) || [])).toHaveLength(2);
    expect((ticksEl.innerHTML.match(/dashboardTasksCompletedTickSeparator/g) || [])).toHaveLength(1);
    expect((ticksEl.innerHTML.match(/isComplete/g) || [])).toHaveLength(1);
    expect(cardEl.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      "Today's task completion. 1 of 2 daily completion opportunities complete."
    );
  });

  it("suppresses the Today trend percentage when yesterday's baseline is effectively zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));

    const cardEl = { setAttribute: vi.fn() };
    const titleEl = { textContent: "" };
    const valueEl = { textContent: "" };
    const metaEl = { textContent: "", style: { display: "block" } };
    const deltaEl = {
      textContent: "",
      classList: { add: vi.fn(), remove: vi.fn() },
    };
    const trendIndicatorEl = {
      textContent: "",
      classList: { add: vi.fn(), remove: vi.fn() },
      closest: vi.fn(() => cardEl),
    };
    const progressBarEl = { setAttribute: vi.fn() };
    const projectionMarkerEl = {
      style: { display: "none", left: "" },
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    };
    const projectionFillEl = { style: { display: "none", left: "0%", width: "0%" } };
    const progressFillEl = { style: { width: "0%" } };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: vi.fn((id: string) => {
          if (id === "dashboardTodayHoursTitle") return titleEl;
          if (id === "dashboardTodayHoursValue") return valueEl;
          if (id === "dashboardTodayHoursMeta") return metaEl;
          if (id === "dashboardTodayHoursDelta") return deltaEl;
          if (id === "dashboardTodayTrendIndicator") return trendIndicatorEl;
          if (id === "dashboardTodayHoursProgressBar") return progressBarEl;
          if (id === "dashboardTodayHoursProjectionMarker") return projectionMarkerEl;
          if (id === "dashboardTodayHoursProjectionFill") return projectionFillEl;
          if (id === "dashboardTodayHoursProgressFill") return progressFillEl;
          return null;
        }),
      },
    });

    const today = new Date("2026-04-22T10:00:00").getTime();
    const yesterdayTinyBaseline = new Date("2026-04-21T09:30:00").getTime();

    const ctx = {
      getHistoryByTaskId: vi.fn(() => ({
        task1: [
          { ts: today, ms: 20 * 60 * 1000 },
          { ts: yesterdayTinyBaseline, ms: 60 * 1000 },
        ],
      })),
      getTasks: vi.fn(() => [{ id: "task1", running: false, timeGoalEnabled: false }]),
      getIsOnboardingDashboardPreview: vi.fn(() => false),
      normalizeHistoryTimestampMs: vi.fn((value) => Number(value)),
      getElapsedMs: vi.fn(() => 0),
    } as unknown as TaskTimerDashboardRenderContext;

    createTaskTimerDashboardRender(ctx).renderDashboardTodayHoursCard();

    expect(valueEl.textContent).toBe("20m");
    expect(trendIndicatorEl.textContent).toBe("--");
    expect(trendIndicatorEl.classList.add).toHaveBeenCalledWith("neutral");
    expect(deltaEl.textContent).toBe("+19m vs this time yesterday");
    expect(deltaEl.classList.add).toHaveBeenCalledWith("positive");
    expect(cardEl.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      "Today's logged time. Trend unavailable versus this time yesterday."
    );
  });

  it("suppresses the Today trend percentage when there are no yesterday entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00"));

    const cardEl = { setAttribute: vi.fn() };
    const titleEl = { textContent: "" };
    const valueEl = { textContent: "" };
    const metaEl = { textContent: "", style: { display: "block" } };
    const deltaEl = {
      textContent: "",
      classList: { add: vi.fn(), remove: vi.fn() },
    };
    const trendIndicatorEl = {
      textContent: "",
      classList: { add: vi.fn(), remove: vi.fn() },
      closest: vi.fn(() => cardEl),
    };
    const progressBarEl = { setAttribute: vi.fn() };
    const projectionMarkerEl = {
      style: { display: "none", left: "" },
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    };
    const projectionFillEl = { style: { display: "none", left: "0%", width: "0%" } };
    const progressFillEl = { style: { width: "0%" } };

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: vi.fn((id: string) => {
          if (id === "dashboardTodayHoursTitle") return titleEl;
          if (id === "dashboardTodayHoursValue") return valueEl;
          if (id === "dashboardTodayHoursMeta") return metaEl;
          if (id === "dashboardTodayHoursDelta") return deltaEl;
          if (id === "dashboardTodayTrendIndicator") return trendIndicatorEl;
          if (id === "dashboardTodayHoursProgressBar") return progressBarEl;
          if (id === "dashboardTodayHoursProjectionMarker") return projectionMarkerEl;
          if (id === "dashboardTodayHoursProjectionFill") return projectionFillEl;
          if (id === "dashboardTodayHoursProgressFill") return progressFillEl;
          return null;
        }),
      },
    });

    const today = new Date("2026-04-22T10:00:00").getTime();

    const ctx = {
      getHistoryByTaskId: vi.fn(() => ({
        task1: [{ ts: today, ms: 20 * 60 * 1000 }],
      })),
      getTasks: vi.fn(() => [{ id: "task1", running: false, timeGoalEnabled: false }]),
      getIsOnboardingDashboardPreview: vi.fn(() => false),
      normalizeHistoryTimestampMs: vi.fn((value) => Number(value)),
      getElapsedMs: vi.fn(() => 0),
    } as unknown as TaskTimerDashboardRenderContext;

    createTaskTimerDashboardRender(ctx).renderDashboardTodayHoursCard();

    expect(valueEl.textContent).toBe("20m");
    expect(trendIndicatorEl.textContent).toBe("--");
    expect(deltaEl.textContent).toBe("+20m vs this time yesterday");
    expect(cardEl.setAttribute).toHaveBeenCalledWith(
      "aria-label",
      "Today's logged time. Trend unavailable versus this time yesterday."
    );
  });
});
