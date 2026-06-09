import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMomentumSummaryMessage, createTaskTimerDashboardRender, getPrimaryMomentumDriverKey } from "./dashboard-render";
import { startOfCurrentWeekMs } from "../lib/historyChart";
import { localDayKey } from "../lib/history";
import type { MomentumSnapshot } from "../lib/momentum";
import type { Task } from "../lib/types";

class ElementStub {
  static labelRectOverride: ((element: ElementStub) => { left: number; top: number; right: number; bottom: number; width: number; height: number } | null) | null = null;

  id = "";
  className = "";
  textContent = "";
  children: ElementStub[] = [];
  style: Record<string, string | ((name: string, value: string) => void)> = {
    setProperty: (name: string, value: string) => {
      this.style[name] = value;
    },
    removeProperty: (name: string) => {
      delete this.style[name];
    },
  };
  private html = "";
  private classes = new Set<string>();
  private attrs = new Map<string, string>();

  get innerHTML() {
    return this.html;
  }

  set innerHTML(value: string) {
    this.html = value;
    this.children = [];
  }

  get classList() {
    return {
      add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
      remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name: string, force?: boolean) => {
        if (force === undefined) {
          if (this.classes.has(name)) {
            this.classes.delete(name);
            return false;
          }
          this.classes.add(name);
          return true;
        }
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      },
      contains: (name: string) => this.classes.has(name),
    };
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  removeAttribute(name: string) {
    this.attrs.delete(name);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  appendChild(child: ElementStub) {
    this.children.push(child);
    return child;
  }

  querySelector(selector: string) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.children.find((child) => child.className.split(/\s+/).includes(className)) ?? null;
    }
    return null;
  }

  querySelectorAll(selector: string) {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.children.filter((child) => child.className.split(/\s+/).includes(className));
    }
    return [];
  }

  closest(selector: string) {
    void selector;
    return null;
  }

  getBoundingClientRect() {
    const override = ElementStub.labelRectOverride?.(this);
    if (override) return override;
    if (this.id === "dashboardTasksCompletedLabels" || this.id === "dashboardTasksCompletedTicks") {
      return { left: 0, top: 0, right: 380, bottom: 380, width: 380, height: 380 };
    }
    if (this.className.split(/\s+/).includes("dashboardTasksCompletedLabel")) {
      const leftValue = typeof this.style.left === "string" ? Number.parseFloat(this.style.left) : 190;
      const topValue = typeof this.style.top === "string" ? Number.parseFloat(this.style.top) : 190;
      const width = 54;
      const height = 30;
      const left = leftValue - width / 2;
      const top = topValue - height / 2;
      return { left, top, right: left + width, bottom: top + height, width, height };
    }
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
}

function task(overrides: Partial<Task>): Task {
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
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    taskType: "recurring",
    ...overrides,
  } as Task;
}

function todaySchedule() {
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  return { [today]: "09:00" } as Task["plannedStartByDay"];
}

function createDocumentHarness(options?: { includeHeaderXpCard?: boolean }) {
  const byId = new Map<string, ElementStub>();
  const register = (id: string) => {
    const el = new ElementStub();
    el.id = id;
    byId.set(id, el);
    return el;
  };

  register("dashboardTasksCompletedTicks");
  register("dashboardTasksCompletedSvg");
  register("dashboardTasksCompletedNeedle");
  register("dashboardTasksCompletedCenter");
  register("dashboardTasksCompletedLabels");
  register("dashboardTasksCompletedMeta");
  register("dashboardWeeklyTrendIndicator");
  register("dashboardWeeklyGoalsValue");
  register("dashboardWeeklyGoalsMeta");
  register("dashboardWeeklyGoalsProgressBar");
  register("dashboardWeeklyGoalsProjectionMarker");
  register("dashboardWeeklyGoalsProjectionFill");
  register("dashboardWeeklyGoalsProgressFill");
  register("dashboardWeeklyGoalsProgressText");
  register("dashboardHeatMonthLabel");
  register("dashboardHeatWeekdays");
  register("dashboardHeatCalendarGrid");
  register("dashboardHeatSummaryBody");
  register("dashboardActivityChart");
  register("dashboardActivityChartGrid");
  register("dashboardActivityPreviousBars");
  register("dashboardActivityBars");
  register("dashboardActivityGoalLine");
  register("dashboardActivityYAxis");
  register("dashboardActivityXAxis");
  register("dashboardActivityEmpty");
  register("dashboardActivityTodayTrendIndicator");
  register("dashboardActivityTodayHoursValue");
  register("dashboardActivityTodayHoursMeta");
  register("dashboardActivityTodayHoursProgressBar");
  register("dashboardActivityTodayHoursProjectionMarker");
  register("dashboardActivityTodayHoursProjectionFill");
  register("dashboardActivityTodayHoursProgressFill");
  register("dashboardActivityTodayHoursDelta");
  register("dashboardActivityWeeklyTrendIndicator");
  register("dashboardActivityWeeklyGoalsValue");
  register("dashboardActivityWeeklyGoalsMeta");
  register("dashboardActivityWeeklyGoalsProgressBar");
  register("dashboardActivityWeeklyGoalsProjectionMarker");
  register("dashboardActivityWeeklyGoalsProjectionFill");
  register("dashboardActivityWeeklyGoalsProgressFill");
  register("dashboardActivityWeeklyGoalsProgressText");
  register("dashboardTodayTrendIndicator");
  register("dashboardTodayHoursValue");
  register("dashboardTodayHoursMeta");
  register("dashboardTodayHoursProgressBar");
  register("dashboardTodayHoursProjectionMarker");
  register("dashboardTodayHoursProjectionFill");
  register("dashboardTodayHoursProgressFill");
  register("dashboardTodayHoursDelta");

  const headerXpCard = options?.includeHeaderXpCard ? new ElementStub() : null;
  const topbarXp = options?.includeHeaderXpCard ? new ElementStub() : null;
  if (headerXpCard) {
    headerXpCard.className = "appShellHeaderXp";
    const valueEl = new ElementStub();
    valueEl.className = "appShellHeaderXpValue";
    const progressBarEl = new ElementStub();
    progressBarEl.className = "appShellHeaderXpTrack";
    const progressFillEl = new ElementStub();
    progressFillEl.className = "appShellHeaderXpFill";
    headerXpCard.appendChild(valueEl);
    headerXpCard.appendChild(progressBarEl);
    headerXpCard.appendChild(progressFillEl);
  }
  if (topbarXp) {
    topbarXp.className = "taskLaunchTopbarXp";
    const valueEl = new ElementStub();
    valueEl.className = "taskLaunchTopbarXpValue";
    const progressBarEl = new ElementStub();
    progressBarEl.className = "taskLaunchTopbarXpTrack";
    const progressFillEl = new ElementStub();
    progressFillEl.className = "taskLaunchTopbarXpFill";
    topbarXp.appendChild(valueEl);
    topbarXp.appendChild(progressBarEl);
    topbarXp.appendChild(progressFillEl);
  }

  const documentRef = {
    getElementById: (id: string) => byId.get(id) ?? null,
    createElementNS: (ns: string, tag: string) => {
      void ns;
      void tag;
      return new ElementStub();
    },
    createElement: (tag: string) => {
      void tag;
      return new ElementStub();
    },
    querySelector: (selector: string) => {
      if (selector === "#app .appShellHeaderXp") return headerXpCard;
      if (selector === "#app .taskLaunchTopbarXp") return topbarXp;
      return null;
    },
  };

  return { byId, documentRef, headerXpCard, topbarXp };
}

function createRenderHarness(
  tasks: Task[],
  options?: {
    historyByTaskId?: Record<string, Array<{ ts: number; name: string; ms: number; color?: string; note?: string }>>;
    hasEntitlement?: boolean;
    rewardProgress?: object;
    includeHeaderXpCard?: boolean;
    mobileViewport?: boolean;
    weekStarting?: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
  }
) {
  const { byId, documentRef, headerXpCard, topbarXp } = createDocumentHarness({ includeHeaderXpCard: options?.includeHeaderXpCard });
  const openSummaryCalls: Array<{ taskId: string; entries: Array<{ ts: number; name: string; ms: number; note?: string }> }> = [];
  const originalDocument = globalThis.document;
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentRef,
  });
  if (options?.mobileViewport != null) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        matchMedia: (query: string) => ({
          matches: query === "(max-width: 640px)" ? !!options.mobileViewport : false,
        }),
      },
    });
  }

  const dashboardRender = createTaskTimerDashboardRender({
    els: {
      dashboardActivityOverviewCard: new ElementStub(),
      dashboardActivityChart: byId.get("dashboardActivityChart"),
      dashboardActivityChartGrid: byId.get("dashboardActivityChartGrid"),
      dashboardActivityPreviousBars: byId.get("dashboardActivityPreviousBars"),
      dashboardActivityBars: byId.get("dashboardActivityBars"),
      dashboardActivityGoalLine: byId.get("dashboardActivityGoalLine"),
      dashboardActivityYAxis: byId.get("dashboardActivityYAxis"),
      dashboardActivityXAxis: byId.get("dashboardActivityXAxis"),
      dashboardActivityEmpty: byId.get("dashboardActivityEmpty"),
      dashboardActivityTodayTrendIndicator: byId.get("dashboardActivityTodayTrendIndicator"),
      dashboardActivityTodayHoursValue: byId.get("dashboardActivityTodayHoursValue"),
      dashboardActivityTodayHoursMeta: byId.get("dashboardActivityTodayHoursMeta"),
      dashboardActivityTodayHoursProgressBar: byId.get("dashboardActivityTodayHoursProgressBar"),
      dashboardActivityTodayHoursProjectionMarker: byId.get("dashboardActivityTodayHoursProjectionMarker"),
      dashboardActivityTodayHoursProjectionFill: byId.get("dashboardActivityTodayHoursProjectionFill"),
      dashboardActivityTodayHoursProgressFill: byId.get("dashboardActivityTodayHoursProgressFill"),
      dashboardActivityTodayHoursDelta: byId.get("dashboardActivityTodayHoursDelta"),
      dashboardActivityWeeklyTrendIndicator: byId.get("dashboardActivityWeeklyTrendIndicator"),
      dashboardActivityWeeklyGoalsValue: byId.get("dashboardActivityWeeklyGoalsValue"),
      dashboardActivityWeeklyGoalsMeta: byId.get("dashboardActivityWeeklyGoalsMeta"),
      dashboardActivityWeeklyGoalsProgressBar: byId.get("dashboardActivityWeeklyGoalsProgressBar"),
      dashboardActivityWeeklyGoalsProjectionMarker: byId.get("dashboardActivityWeeklyGoalsProjectionMarker"),
      dashboardActivityWeeklyGoalsProjectionFill: byId.get("dashboardActivityWeeklyGoalsProjectionFill"),
      dashboardActivityWeeklyGoalsProgressFill: byId.get("dashboardActivityWeeklyGoalsProgressFill"),
      dashboardActivityWeeklyGoalsProgressText: byId.get("dashboardActivityWeeklyGoalsProgressText"),
      dashboardWeeklyGoalsValue: byId.get("dashboardWeeklyGoalsValue"),
      dashboardWeeklyGoalsMeta: byId.get("dashboardWeeklyGoalsMeta"),
      dashboardWeeklyGoalsProgressBar: byId.get("dashboardWeeklyGoalsProgressBar"),
      dashboardWeeklyGoalsProjectionMarker: byId.get("dashboardWeeklyGoalsProjectionMarker"),
      dashboardWeeklyGoalsProjectionFill: byId.get("dashboardWeeklyGoalsProjectionFill"),
      dashboardWeeklyGoalsProgressFill: byId.get("dashboardWeeklyGoalsProgressFill"),
      dashboardWeeklyGoalsProgressText: byId.get("dashboardWeeklyGoalsProgressText"),
      dashboardHeatMonthLabel: byId.get("dashboardHeatMonthLabel"),
      dashboardHeatWeekdays: byId.get("dashboardHeatWeekdays"),
      dashboardHeatCalendarGrid: byId.get("dashboardHeatCalendarGrid"),
      dashboardHeatSummaryBody: byId.get("dashboardHeatSummaryBody"),
    } as never,
    getRewardProgress: () => (options?.rewardProgress || {}) as never,
    getTasks: () => tasks,
    getHistoryByTaskId: () => options?.historyByTaskId || {},
    getDeletedTaskMeta: () => ({}),
    getWeekStarting: () => options?.weekStarting || "mon",
    getOptimalProductivityDays: () => ["mon", "wed", "fri"],
    getDashboardTimelineDensity: () => "medium",
    setDashboardTimelineDensity: () => {},
    getDashboardWidgetHasRenderedData: () => ({
      tasksCompleted: false,
      momentum: false,
      focusTrend: false,
      heatCalendar: false,
      modeDistribution: false,
      timeline: false,
    }),
    getDashboardRefreshHoldActive: () => false,
    getCloudRefreshInFlight: () => null,
    getDynamicColorsEnabled: () => false,
    getElapsedMs: () => 0,
    escapeHtmlUI: (value) => String(value),
    normalizeHistoryTimestampMs: (value) => Number(value) || 0,
    getModeColor: () => "#00ffff",
    addRangeMsToLocalDayMap: () => {},
    openHistoryEntryNoteOverlay: (taskId, entries) => {
      openSummaryCalls.push({ taskId, entries: entries as Array<{ ts: number; name: string; ms: number; note?: string }> });
    },
    hasEntitlement: () => options?.hasEntitlement ?? true,
    getCurrentPlan: () => "pro",
  });

  return {
    byId,
    headerXpCard,
    topbarXp,
    renderAll: () => dashboardRender.renderDashboardWidgets(),
    renderActivityOverview: () => dashboardRender.renderDashboardActivityOverviewCard(),
    renderHeaderXp: () => dashboardRender.renderDashboardHeaderProgress(),
    render: () => dashboardRender.renderDashboardTasksCompletedCard(),
    renderWeeklyGoals: () => dashboardRender.renderDashboardWeeklyGoalsCard(),
    renderHeat: () => dashboardRender.renderDashboardHeatCalendar(),
    renderHeatTaskList: (dayKey: string, dateLabel = dayKey) => dashboardRender.renderDashboardHeatTaskList(dayKey, dateLabel),
    openHeatTaskSummary: (dayKey: string, taskId: string) => dashboardRender.openDashboardHeatTaskSummary(dayKey, taskId),
    openSummaryCalls,
    restore: () => {
      ElementStub.labelRectOverride = null;
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
      if (originalWindowDescriptor) {
        Object.defineProperty(globalThis, "window", originalWindowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard activity overview card", () => {
  it("renders one x-axis label for each fortnight day", () => {
    const harness = createRenderHarness([]);

    try {
      harness.renderActivityOverview();
      const axisHtml = harness.byId.get("dashboardActivityXAxis")?.innerHTML || "";
      const axisDayCount = axisHtml.match(/class="dashboardActivityAxisDay/g)?.length || 0;
      const bars = harness.byId.get("dashboardActivityBars")?.children || [];

      expect(axisDayCount).toBe(14);
      expect(bars).toHaveLength(14);
    } finally {
      harness.restore();
    }
  });

  it("renders current week with previous-week ghost bars on mobile", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        mobileViewport: true,
        historyByTaskId: {
          focus: [
            { ts: weekStart - 7 * 86400000 + 9 * 60 * 60 * 1000, name: "Focus", ms: 180 * 60000 },
            { ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const axisHtml = harness.byId.get("dashboardActivityXAxis")?.innerHTML || "";
      const axisDayCount = axisHtml.match(/class="dashboardActivityAxisDay/g)?.length || 0;
      const bars = harness.byId.get("dashboardActivityBars")?.children || [];
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");
      const yAxisHtml = harness.byId.get("dashboardActivityYAxis")?.innerHTML || "";
      const currentBar = bars[0]?.children[0];
      const ghostBar = previousBars?.children[0];

      expect(axisDayCount).toBe(7);
      expect(bars).toHaveLength(7);
      expect(previousBars?.style.display).toBe("");
      expect(previousBars?.children).toHaveLength(7);
      expect(yAxisHtml).toContain("3h");
      expect(Number.parseFloat(String(currentBar?.getAttribute("height") || "0"))).toBeCloseTo(74.7, 1);
      expect(Number.parseFloat(String(ghostBar?.getAttribute("height") || "0"))).toBeCloseTo(224, 1);
    } finally {
      harness.restore();
    }
  });

  it("uses goal-progress colors per day when a daily pace target exists", () => {
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        historyByTaskId: {
          focus: [
            { ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
            { ts: weekStart + 86400000 + 9 * 60 * 60 * 1000, name: "Focus", ms: 120 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const bars = harness.byId.get("dashboardActivityBars")?.children || [];
      const firstBar = bars[7]?.children[0];
      const secondBar = bars[8]?.children[0];
      const goalLine = harness.byId.get("dashboardActivityGoalLine");
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");

      expect(bars).toHaveLength(14);
      expect(firstBar?.getAttribute("fill")).toBe("rgb(255,140,0)");
      expect(secondBar?.getAttribute("fill")).toBe("rgb(12,245,127)");
      expect(firstBar?.getAttribute("fill")).not.toBe(secondBar?.getAttribute("fill"));
      expect(goalLine?.style.display).toBe("");
      expect(previousBars?.children).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("uses the dominant task color when no weekly goal exists", () => {
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [
        task({ id: "focus", name: "Focus", timeGoalEnabled: false, color: "#ff5252" }),
        task({ id: "build", name: "Build", timeGoalEnabled: false, color: "#00e5ff" }),
      ],
      {
        historyByTaskId: {
          focus: [{ ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 45 * 60000, color: "#ff5252" }],
          build: [{ ts: weekStart + 10 * 60 * 60 * 1000, name: "Build", ms: 90 * 60000, color: "#00e5ff" }],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const bars = harness.byId.get("dashboardActivityBars")?.children || [];
      const firstBar = bars[7]?.children[0];
      const goalLine = harness.byId.get("dashboardActivityGoalLine");

      expect(firstBar?.getAttribute("fill")).toBe("#00e5ff");
      expect(goalLine?.style.display).toBe("none");
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard week-start alignment", () => {
  const fixedNow = new Date(2026, 4, 13, 10).getTime();

  function useFixedNow() {
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
  }

  it("renders the heatmap range and weekday labels from a Sunday week start", () => {
    useFixedNow();
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        weekStarting: "sun",
        historyByTaskId: {
          focus: [{ ts: new Date(2026, 4, 10, 9).getTime(), name: "Focus", ms: 30 * 60000 }],
        },
      }
    );

    try {
      harness.renderHeat();
      const weekdayHtml = harness.byId.get("dashboardHeatWeekdays")?.innerHTML || "";
      const gridHtml = harness.byId.get("dashboardHeatCalendarGrid")?.innerHTML || "";

      expect(weekdayHtml).toBe("<span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>");
      expect(gridHtml.indexOf('dashboardHeatDayNum">19</span>')).toBeGreaterThan(-1);
      expect(gridHtml.indexOf('dashboardHeatDayNum">19</span>')).toBeLessThan(gridHtml.indexOf('dashboardHeatDayNum">20</span>'));
      expect(gridHtml).toContain('data-heat-date="2026-05-10"');
      expect(gridHtml).toContain("10 May 2026");
    } finally {
      harness.restore();
    }
  });

  it("uses the configured week start for both weekly summary panels", () => {
    useFixedNow();
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 240 })],
      {
        weekStarting: "sun",
        historyByTaskId: {
          focus: [
            { ts: new Date(2026, 4, 9, 9).getTime(), name: "Focus", ms: 60 * 60000 },
            { ts: new Date(2026, 4, 10, 9).getTime(), name: "Focus", ms: 120 * 60000 },
            { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 30 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderAll();

      expect(harness.byId.get("dashboardWeeklyGoalsValue")?.textContent).toBe("2h 30m");
      expect(harness.byId.get("dashboardActivityWeeklyGoalsValue")?.textContent).toBe("2h 30m");
      expect(harness.byId.get("dashboardWeeklyGoalsProgressText")?.textContent).toBe("63% of weekly goal logged");
      expect(harness.byId.get("dashboardActivityWeeklyGoalsProgressText")?.textContent).toBe("63% of weekly goal logged");
    } finally {
      harness.restore();
    }
  });

  it("keeps Today summaries scoped to the local calendar day", () => {
    useFixedNow();
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "day", timeGoalMinutes: 60 })],
      {
        weekStarting: "sun",
        historyByTaskId: {
          focus: [
            { ts: new Date(2026, 4, 12, 9).getTime(), name: "Focus", ms: 60 * 60000 },
            { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 30 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderAll();

      expect(harness.byId.get("dashboardTodayHoursValue")?.textContent).toBe("30m");
      expect(harness.byId.get("dashboardActivityTodayHoursValue")?.textContent).toBe("30m");
      expect(harness.byId.get("dashboardTodayHoursDelta")?.textContent).toBe("-30m vs this time yesterday");
      expect(harness.byId.get("dashboardActivityTodayHoursDelta")?.textContent).toBe("-30m vs this time yesterday");
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard header XP progress", () => {
  it("updates the desktop header progress bar without requiring a meta line", () => {
    const harness = createRenderHarness([], {
      includeHeaderXpCard: true,
      rewardProgress: { totalXp: 60, totalXpPrecise: 60, currentRankId: "operator", completedSessions: 0, lastAwardedAt: null, awardLedger: [] },
    });

    try {
      harness.renderHeaderXp();
      const progressBarEl = harness.headerXpCard?.querySelector(".appShellHeaderXpTrack");
      expect(harness.headerXpCard?.querySelector(".appShellHeaderXpMeta")).toBeNull();
      expect(progressBarEl?.getAttribute("aria-valuenow")).toBe("0");
    } finally {
      harness.restore();
    }
  });

  it("keeps max-rank summary available on the desktop header card", () => {
    const harness = createRenderHarness([], {
      includeHeaderXpCard: true,
      rewardProgress: { totalXp: 50000, totalXpPrecise: 50000, currentRankId: "mythic", completedSessions: 0, lastAwardedAt: null, awardLedger: [] },
    });

    try {
      harness.renderHeaderXp();
      expect(harness.headerXpCard?.querySelector(".appShellHeaderXpMeta")).toBeNull();
      expect(harness.headerXpCard?.getAttribute("aria-label")).toBe("XP progress. 50000 XP total and max rank reached.");
    } finally {
      harness.restore();
    }
  });

  it("does not overwrite the animated xp header while the count-up is active", () => {
    const harness = createRenderHarness([], {
      includeHeaderXpCard: true,
      rewardProgress: { totalXp: 60, totalXpPrecise: 60, currentRankId: "operator", completedSessions: 0, lastAwardedAt: null, awardLedger: [] },
    });

    try {
      const desktopValueEl = harness.headerXpCard?.querySelector(".appShellHeaderXpValue");
      const mobileValueEl = harness.topbarXp?.querySelector(".taskLaunchTopbarXpValue");

      desktopValueEl?.classList.add("isAnimatingXpCount");
      if (desktopValueEl) desktopValueEl.textContent = "42 XP";
      if (mobileValueEl) mobileValueEl.textContent = "42 XP";

      harness.renderHeaderXp();

      expect(desktopValueEl?.textContent).toBe("42 XP");
      expect(mobileValueEl?.textContent).toBe("42 XP");
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard availability", () => {
  it("renders the heatmap for free users instead of a locked mock", () => {
    const now = Date.now();
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        hasEntitlement: false,
        historyByTaskId: {
          focus: [{ ts: now, name: "Focus", ms: 30 * 60 * 1000 }],
        },
      }
    );

    try {
      harness.renderHeat();
      const gridHtml = harness.byId.get("dashboardHeatCalendarGrid")?.innerHTML || "";

      expect(gridHtml).toContain("data-heat-date");
      expect(gridHtml).not.toContain('aria-hidden="true"><span class="dashboardHeatDayNum">1</span>');
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard heatmap summaries", () => {
  function middayToday(offsetHours = 0) {
    const date = new Date();
    date.setHours(12 + offsetHours, 0, 0, 0);
    return date.getTime();
  }

  it("opens a combined session summary for all same-day task entries", () => {
    const firstTs = middayToday(-1);
    const secondTs = middayToday(1);
    const otherDayTs = firstTs - 24 * 60 * 60 * 1000;
    const dayKey = localDayKey(firstTs);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" }), task({ id: "admin", name: "Admin" })],
      {
        historyByTaskId: {
          focus: [
            { ts: firstTs, name: "Focus", ms: 30 * 60 * 1000, note: "First" },
            { ts: secondTs, name: "Focus", ms: 45 * 60 * 1000, note: "Second" },
            { ts: otherDayTs, name: "Focus", ms: 15 * 60 * 1000, note: "Yesterday" },
          ],
          admin: [{ ts: firstTs, name: "Admin", ms: 10 * 60 * 1000 }],
        },
      }
    );

    try {
      expect(harness.openHeatTaskSummary(dayKey, "focus")).toBe(true);

      expect(harness.openSummaryCalls).toHaveLength(1);
      expect(harness.openSummaryCalls[0]?.taskId).toBe("focus");
      expect(harness.openSummaryCalls[0]?.entries).toEqual([
        { ts: secondTs, ms: 45 * 60 * 1000, name: "Focus", note: "Second" },
        { ts: firstTs, ms: 30 * 60 * 1000, name: "Focus", note: "First" },
      ]);
    } finally {
      harness.restore();
    }
  });

  it("opens a single-session summary for one same-day task entry", () => {
    const ts = middayToday();
    const dayKey = localDayKey(ts);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        historyByTaskId: {
          focus: [{ ts, name: "Focus", ms: 30 * 60 * 1000 }],
        },
      }
    );

    try {
      expect(harness.openHeatTaskSummary(dayKey, "focus")).toBe(true);

      expect(harness.openSummaryCalls).toEqual([
        {
          taskId: "focus",
          entries: [{ ts, ms: 30 * 60 * 1000, name: "Focus", note: undefined }],
        },
      ]);
    } finally {
      harness.restore();
    }
  });

  it("renders task rows without heatmap session drilldown hooks", () => {
    const firstTs = middayToday(-1);
    const secondTs = middayToday(1);
    const dayKey = localDayKey(firstTs);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        historyByTaskId: {
          focus: [
            { ts: firstTs, name: "Focus", ms: 30 * 60 * 1000 },
            { ts: secondTs, name: "Focus", ms: 45 * 60 * 1000 },
          ],
        },
      }
    );

    try {
      expect(harness.renderHeatTaskList(dayKey, "Today")).toBe(true);
      const html = harness.byId.get("dashboardHeatSummaryBody")?.innerHTML || "";

      expect(html).toContain('data-heat-summary-mode="task"');
      expect(html).toContain("Open combined session summary for Focus");
      expect(html).not.toContain('data-heat-summary-mode="session"');
      expect(html).not.toContain("data-heat-summary-back");
      expect(html).not.toContain("dashboardHeatSummarySessionRow");
    } finally {
      harness.restore();
    }
  });
});

describe("weekly goals dashboard card", () => {
  function expectWeeklyTrendHidden(trendEl: ElementStub | undefined) {
    expect(trendEl?.style.display).toBe("none");
    expect(trendEl?.textContent).toBe("");
    expect(trendEl?.classList.contains("positive")).toBe(false);
    expect(trendEl?.classList.contains("negative")).toBe(false);
    expect(trendEl?.classList.contains("neutral")).toBe(false);
  }

  it("hides the percent comparison when only current-week history exists", () => {
    const weekStartMs = startOfCurrentWeekMs(Date.now(), "mon");
    const tasks = [task({ id: "focus", name: "Focus" })];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        focus: [{ ts: weekStartMs + 60 * 60 * 1000, name: "Focus", ms: 30 * 60 * 1000 }],
      },
    });

    try {
      harness.renderWeeklyGoals();
      const trendEl = harness.byId.get("dashboardWeeklyTrendIndicator");

      expectWeeklyTrendHidden(trendEl);
    } finally {
      harness.restore();
    }
  });

  it("hides the percent comparison when previous-week history exists without a full prior week", () => {
    const weekStartMs = startOfCurrentWeekMs(Date.now(), "mon");
    const tasks = [task({ id: "focus", name: "Focus" })];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        focus: [
          { ts: weekStartMs + 60 * 60 * 1000, name: "Focus", ms: 30 * 60 * 1000 },
          { ts: weekStartMs - 2 * 60 * 60 * 1000, name: "Focus", ms: 15 * 60 * 1000 },
        ],
      },
    });

    try {
      harness.renderWeeklyGoals();
      const trendEl = harness.byId.get("dashboardWeeklyTrendIndicator");

      expectWeeklyTrendHidden(trendEl);
    } finally {
      harness.restore();
    }
  });

  it("shows the percent comparison when previous-week history has a full prior week", () => {
    const weekStartMs = startOfCurrentWeekMs(Date.now(), "mon");
    const tasks = [task({ id: "focus", name: "Focus" })];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        focus: [
          { ts: weekStartMs + 60 * 60 * 1000, name: "Focus", ms: 30 * 60 * 1000 },
          { ts: weekStartMs - 2 * 60 * 60 * 1000, name: "Focus", ms: 15 * 60 * 1000 },
          { ts: weekStartMs - 8 * 24 * 60 * 60 * 1000, name: "Focus", ms: 10 * 60 * 1000 },
        ],
      },
    });

    try {
      harness.renderWeeklyGoals();
      const trendEl = harness.byId.get("dashboardWeeklyTrendIndicator");

      expect(trendEl?.style.display).toBe("");
      expect(trendEl?.textContent).toBe("+100%");
      expect(trendEl?.classList.contains("positive")).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it("hides the percent comparison when a full prior week exists but previous-week logged time is zero", () => {
    const weekStartMs = startOfCurrentWeekMs(Date.now(), "mon");
    const tasks = [task({ id: "focus", name: "Focus" })];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        focus: [
          { ts: weekStartMs + 60 * 60 * 1000, name: "Focus", ms: 30 * 60 * 1000 },
          { ts: weekStartMs - 8 * 24 * 60 * 60 * 1000, name: "Focus", ms: 10 * 60 * 1000 },
        ],
      },
    });

    try {
      harness.renderWeeklyGoals();
      const trendEl = harness.byId.get("dashboardWeeklyTrendIndicator");

      expectWeeklyTrendHidden(trendEl);
    } finally {
      harness.restore();
    }
  });
});

describe("dashboard completed card", () => {
  it("shows scheduled due tasks without daily goals in the donut", () => {
    const today = todaySchedule();
    const tasks = [
      task({ id: "goal-task", name: "Goal Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: today }),
      task({ id: "new-task", name: "New Task", timeGoalEnabled: false, timeGoalMinutes: 0, plannedStartByDay: today }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Goal Task");
      expect(labelsEl?.children[1]?.innerHTML).toContain("New Task");
      expect(connectorEls).toHaveLength(2);
      expect(centerEl?.innerHTML).toContain("Task Focus");
      expect(centerEl?.innerHTML).toContain("0% completed today");
    } finally {
      harness.restore();
    }
  });

  it("shows once-off tasks that have a current scheduled slot even when their target date is stale", () => {
    const staleTargetDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tasks = [
      task({
        id: "once-off-task",
        name: "Once Off Task",
        taskType: "once-off",
        onceOffTargetDate: staleTargetDate,
        plannedStartByDay: todaySchedule(),
      }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");

      expect(labelsEl?.children).toHaveLength(1);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Once Off Task");
    } finally {
      harness.restore();
    }
  });

  it("excludes unscheduled tasks from the donut", () => {
    const tasks = [
      task({ id: "scheduled-task", name: "Scheduled Task", plannedStartByDay: todaySchedule() }),
      task({ id: "unscheduled-task", name: "Unscheduled Task", timeGoalEnabled: false, timeGoalMinutes: 0 }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(1);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Scheduled Task");
      expect(labelsEl?.innerHTML).not.toContain("Unscheduled Task");
      expect(connectorEls).toHaveLength(1);
    } finally {
      harness.restore();
    }
  });

  it("shows the running task name and in-progress subtext in the donut center", () => {
    const tasks = [
      task({ id: "running-task", name: "Deep Work", running: true, startMs: Date.now() - 1000, plannedStartByDay: todaySchedule() }),
      task({ id: "queued-task", name: "Queued Task", plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(centerEl?.innerHTML).toContain("Deep Work");
      expect(centerEl?.innerHTML).toContain("In Progress");
    } finally {
      harness.restore();
    }
  });

  it("shows today's completed task percentage when no task is running", () => {
    const nowValue = Date.now();
    const tasks = [
      task({ id: "done-task", name: "Done Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
      task({ id: "open-task", name: "Open Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "done-task": [{ ts: nowValue, name: "Done Task", ms: 60 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(centerEl?.innerHTML).toContain("Task Focus");
      expect(centerEl?.innerHTML).toContain("50% completed today");
    } finally {
      harness.restore();
    }
  });

  it("renders connector paths when short time-goal labels are bunched", () => {
    const tasks = [
      task({ id: "quick-1", name: "Quick 1", order: 1, timeGoalMinutes: 1, plannedStartByDay: todaySchedule() }),
      task({ id: "quick-2", name: "Quick 2", order: 2, timeGoalMinutes: 1, plannedStartByDay: todaySchedule() }),
      task({ id: "quick-3", name: "Quick 3", order: 3, timeGoalMinutes: 1, plannedStartByDay: todaySchedule() }),
      task({ id: "quick-4", name: "Quick 4", order: 4, timeGoalMinutes: 1, plannedStartByDay: todaySchedule() }),
      task({ id: "deep-work", name: "Deep Work", order: 5, timeGoalMinutes: 180, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(5);
      expect(labelsEl?.children.some((child) => child.innerHTML.includes("Quick 1"))).toBe(true);
      expect(connectorEls).toHaveLength(5);
      expect(connectorEls.every((child) => child.getAttribute("d")?.includes(" L "))).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it("hides all task labels and connector paths when any label would overlap the donut area", () => {
    const tasks = [
      task({ id: "long-1", name: "Extremely Long Deep Work Task", order: 1, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
      task({ id: "long-2", name: "Extremely Long Admin Task", order: 2, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      ElementStub.labelRectOverride = (element) => element.className.split(/\s+/).includes("dashboardTasksCompletedLabel")
        ? { left: 170, top: 170, right: 230, bottom: 200, width: 60, height: 30 }
        : null;

      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(0);
      expect(labelsEl?.classList.contains("isHiddenForLayout")).toBe(true);
      expect(connectorEls).toHaveLength(0);
      expect(centerEl?.innerHTML).toContain("Task Focus");
    } finally {
      harness.restore();
    }
  });

  it("hides all task labels and connector paths when the rendered chart viewport would clip a label", () => {
    const tasks = [
      task({ id: "goal-task", name: "Goal Task", order: 1, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
      task({ id: "new-task", name: "New Task", order: 2, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      Object.assign(labelsEl as object, {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 300, bottom: 380, width: 300, height: 380 }),
      });
      ElementStub.labelRectOverride = (element) => element.className.split(/\s+/).includes("dashboardTasksCompletedLabel")
        ? { left: 280, top: 120, right: 340, bottom: 150, width: 60, height: 30 }
        : null;

      harness.render();
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(0);
      expect(labelsEl?.classList.contains("isHiddenForLayout")).toBe(true);
      expect(connectorEls).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });
});

describe("momentum summary copy", () => {
  it("uses the highest scoring driver as the default summary basis", () => {
    const momentum: MomentumSnapshot = {
      score: 61,
      bandLabel: "Strong",
      multiplier: 1.5,
      hasSignal: true,
      recentActivityScore: 9,
      consistencyScore: 14,
      weeklyProgressScore: 20,
      activeSessionBonus: 0,
      currentWeekLoggedMs: 6 * 60 * 60 * 1000,
      currentWeekGoalMs: 6 * 60 * 60 * 1000,
      runningTaskCount: 0,
      activeDayCount: 3,
      trailingStreak: 2,
      recentDaysMs: [2 * 60 * 60 * 1000, 60 * 60 * 1000, 0],
      recentQualifiedLabels: ["Mon", "Tue"],
      selectedDaysSummary: "All days",
    };

    expect(getPrimaryMomentumDriverKey(momentum)).toBe("weeklyProgress");
    expect(buildMomentumSummaryMessage(momentum)).toContain("Weekly Progress contributed 20 of 35 momentum points");
    expect(buildMomentumSummaryMessage(momentum)).not.toContain("driven by 3 active days this week");
  });

  it("describes recent activity using qualifying days instead of duration", () => {
    const momentum: MomentumSnapshot = {
      score: 25,
      bandLabel: "Building",
      multiplier: 1.2,
      hasSignal: true,
      recentActivityScore: 13,
      consistencyScore: 0,
      weeklyProgressScore: 0,
      activeSessionBonus: 0,
      currentWeekLoggedMs: 5 * 60 * 1000,
      currentWeekGoalMs: 0,
      runningTaskCount: 0,
      activeDayCount: 1,
      trailingStreak: 1,
      recentDaysMs: [5 * 60 * 1000, 0, 0],
      recentQualifiedLabels: ["Mon"],
      selectedDaysSummary: "All days",
    };

    const message = buildMomentumSummaryMessage(momentum);
    expect(message).toContain("Recent Activity contributed 13 of 30 momentum points from Mon");
    expect(message).toContain("selected optimal days (all days)");
    expect(message).toContain("5-minute minimum session threshold");
    expect(message).not.toContain("5m today, 0m yesterday");
  });
});
