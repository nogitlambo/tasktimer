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
});
