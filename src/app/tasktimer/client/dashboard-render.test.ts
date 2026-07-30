import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
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
  disabled = false;
  title = "";
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

  querySelector(selector: string): ElementStub | null {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      const directMatch = this.children.find((child) => child.className.split(/\s+/).includes(className));
      if (directMatch) return directMatch;
      for (const child of this.children) {
        const nestedMatch: ElementStub | null = child.querySelector(selector);
        if (nestedMatch) return nestedMatch;
      }
    }
    return null;
  }

  querySelectorAll(selector: string): ElementStub[] {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.children.flatMap((child): ElementStub[] => {
        const matches = child.className.split(/\s+/).includes(className) ? [child] : [];
        return [...matches, ...child.querySelectorAll(selector)];
      });
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

function nonTodaySchedule() {
  const todayIndex = new Date().getDay();
  const day = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][(todayIndex + 1) % 7];
  return { [day]: "09:00" } as Task["plannedStartByDay"];
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
  register("dashboardActivityChartWrap");
  register("dashboardActivityChart");
  register("dashboardActivityChartGrid");
  register("dashboardActivityPreviousBars");
  register("dashboardActivityBars");
  register("dashboardActivityGoalLine");
  register("dashboardActivityGoalLabel");
  register("dashboardActivityPreviousGoalLabel");
  register("dashboardActivityPageOlderBtn");
  register("dashboardActivityPageNewerBtn");
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
    historyByTaskId?: Record<
      string,
      Array<{
        ts: number;
        name: string;
        ms: number;
        color?: string;
        note?: string;
        sessionId?: string;
        isLiveSession?: boolean;
        liveSessionId?: string;
      }>
    >;
    hasEntitlement?: boolean;
    rewardProgress?: object;
    includeHeaderXpCard?: boolean;
    mobileViewport?: boolean;
    weekStarting?: "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";
    optimalProductivityDays?: Array<"sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">;
    dashboardPreviousWeekVisible?: boolean;
    activityGoalSnapshotsByDay?: Record<string, number>;
  }
) {
  const { byId, documentRef, headerXpCard, topbarXp } = createDocumentHarness({ includeHeaderXpCard: options?.includeHeaderXpCard });
  const openSummaryCalls: Array<{
    taskId: string;
    entries: Array<{
      ts: number;
      name: string;
      ms: number;
      note?: string;
      color?: string;
      sessionId?: string;
      isLiveSession?: boolean;
      liveSessionId?: string;
      historyMutationAllowed?: boolean;
    }>;
  }> = [];
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
    getOptimalProductivityDays: () => options?.optimalProductivityDays || ["mon", "wed", "fri"],
    getDashboardPreviousWeekVisible: () => options?.dashboardPreviousWeekVisible !== false,
    getActivityGoalSnapshotsByDay: () => options?.activityGoalSnapshotsByDay || {},
    setActivityGoalSnapshotsByDay: (value) => {
      if (options) options.activityGoalSnapshotsByDay = value;
    },
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
      openSummaryCalls.push({
        taskId,
        entries: entries as Array<{
          ts: number;
          name: string;
          ms: number;
          note?: string;
          color?: string;
          sessionId?: string;
          isLiveSession?: boolean;
          liveSessionId?: string;
          historyMutationAllowed?: boolean;
        }>,
      });
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
    pageActivityOverview: (direction: "older" | "newer") => dashboardRender.pageDashboardActivityOverview(direction),
    renderHeaderXp: () => dashboardRender.renderDashboardHeaderProgress(),
    render: () => dashboardRender.renderDashboardTasksCompletedCard(),
    renderWeeklyGoals: () => dashboardRender.renderDashboardWeeklyGoalsCard(),
    renderHeat: () => dashboardRender.renderDashboardHeatCalendar(),
    renderHeatTaskList: (dayKey: string, dateLabel = dayKey) => dashboardRender.renderDashboardHeatTaskList(dayKey, dateLabel),
    openHeatTaskSummary: (dayKey: string, taskId: string) => dashboardRender.openDashboardHeatTaskSummary(dayKey, taskId),
    openActivityDaySummary: (dayKey: string) => dashboardRender.openDashboardActivityDaySummary(dayKey),
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

function getActivityBarGroups(container: ElementStub | undefined) {
  return (container?.children || []).filter((child) => child.getAttribute("class") === "dashboardActivityBarGroup");
}

function getActivityBarFront(group: ElementStub | undefined) {
  return (group?.children || []).find((child) => child.getAttribute("class") === "dashboardActivityBar") || null;
}

function getActivityBarPart(group: ElementStub | undefined, className: string) {
  return (group?.children || []).find((child) => child.getAttribute("class") === className) || null;
}

function getActivityGradientStopColors(container: ElementStub | undefined, gradientId: string) {
  const defs = (container?.children || []).find((child) => child.getAttribute("class") === "dashboardActivityBarDefs");
  const gradient = (defs?.children || []).find((child) => child.getAttribute("id") === gradientId);
  return (gradient?.children || []).map((child) => child.getAttribute("stop-color"));
}

function getActivityGoalPaths(container: ElementStub | undefined) {
  return (container?.children || []).filter((child) => String(child.getAttribute("class") || "").includes("dashboardActivityGoalPath"));
}

function getActivityGoalPath(container: ElementStub | undefined) {
  return getActivityGoalPaths(container)[0] || null;
}

function getActivityGoalPathByState(container: ElementStub | undefined, state: "Current" | "Previous") {
  return (
    getActivityGoalPaths(container).find((child) =>
      String(child.getAttribute("class") || "").includes(`dashboardActivityGoalPath${state}`)
    ) || null
  );
}

function getActivityGoalPathYValues(path: ElementStub | null) {
  const d = String(path?.getAttribute("d") || "");
  const matches = [...d.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)];
  return matches.map((match) => match[2]);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dashboard activity overview card", () => {
  it("renders one x-axis label for each preferred productivity day on desktop", () => {
    const harness = createRenderHarness([]);

    try {
      harness.renderActivityOverview();
      const axisHtml = harness.byId.get("dashboardActivityXAxis")?.innerHTML || "";
      const axisDayCount = axisHtml.match(/class="dashboardActivityAxisDay/g)?.length || 0;
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const firstBar = getActivityBarFront(bars[0]);
      const lastBar = getActivityBarFront(bars[2]);

      expect(axisDayCount).toBe(3);
      expect(axisHtml).toContain(">Mon<");
      expect(axisHtml).toContain(">Wed<");
      expect(axisHtml).toContain(">Fri<");
      expect(harness.byId.get("dashboardActivityXAxis")?.style["--dashboard-activity-visible-days"]).toBe("3");
      expect(bars).toHaveLength(3);
      expect(Number.parseFloat(String(firstBar?.getAttribute("width") || "0"))).toBeLessThan(60);
      expect(Number.parseFloat(String(firstBar?.getAttribute("x") || "0"))).toBeGreaterThan(90);
      expect(Number.parseFloat(String(lastBar?.getAttribute("x") || "0"))).toBeGreaterThan(500);
      expect(firstBar?.getAttribute("rx")).toBe("5");
      expect(getActivityBarPart(bars[0], "dashboardActivityBarShadow")).toBeNull();
      expect(getActivityBarPart(bars[0], "dashboardActivityBarSide")).toBeNull();
      expect(getActivityBarPart(bars[0], "dashboardActivityBarTop")).toBeNull();
      expect(getActivityBarPart(bars[0], "dashboardActivityBarHighlight")).toBeNull();
      expect(firstBar?.getAttribute("fill")).toMatch(/^url\(#dashboardActivityBarGradient-0\)$/);
    } finally {
      harness.restore();
    }
  });

  it("marks non-empty Activity Overview bars as interactive day summary targets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const dayKey = localDayKey(weekStart);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        optimalProductivityDays: ["mon", "tue"],
        historyByTaskId: {
          focus: [{ ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 30 * 60000 }],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));

      expect(bars[0]?.getAttribute("data-dashboard-activity-day")).toBe(dayKey);
      expect(bars[0]?.getAttribute("data-dashboard-activity-session-count")).toBe("1");
      expect(bars[0]?.getAttribute("role")).toBe("button");
      expect(bars[0]?.getAttribute("tabindex")).toBe("0");
      expect(bars[0]?.getAttribute("aria-label")).toContain("Open session summary for");
      expect(bars[1]?.getAttribute("data-dashboard-activity-day")).toBeNull();
      expect(bars[1]?.getAttribute("role")).toBeNull();
    } finally {
      harness.restore();
    }
  });

  it("opens a read-only Activity Overview summary for all sessions on a visible day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const dayKey = localDayKey(weekStart);
    const harness = createRenderHarness(
      [
        task({ id: "focus", name: "Focus", color: "#ff5252" }),
        task({ id: "build", name: "Build", color: "#00e5ff" }),
      ],
      {
        optimalProductivityDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        historyByTaskId: {
          focus: [{ ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 30 * 60000, note: "Deep work" }],
          build: [
            {
              ts: weekStart + 11 * 60 * 60 * 1000,
              name: "Build",
              ms: 45 * 60000,
              sessionId: "session-build",
              isLiveSession: true,
              liveSessionId: "live-build",
            },
          ],
        },
      }
    );

    try {
      expect(harness.openActivityDaySummary(dayKey)).toBe(true);
      expect(harness.openSummaryCalls).toHaveLength(1);
      expect(harness.openSummaryCalls[0]?.taskId).toBe("focus");
      expect(harness.openSummaryCalls[0]?.entries).toEqual([
        expect.objectContaining({
          taskId: "focus",
          name: "Focus",
          note: "Deep work",
          historyMutationAllowed: false,
        }),
        expect.objectContaining({
          taskId: "build",
          name: "Build",
          sessionId: "session-build",
          isLiveSession: true,
          liveSessionId: "live-build",
          historyMutationAllowed: false,
        }),
      ]);
    } finally {
      harness.restore();
    }
  });

  it("opens Activity Overview summaries for the selected older week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const olderDayMs = weekStart - 7 * 86400000 + 9 * 60 * 60 * 1000;
    const olderDayKey = localDayKey(olderDayMs);
    const currentDayKey = localDayKey(weekStart);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        optimalProductivityDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        historyByTaskId: {
          focus: [
            { ts: olderDayMs, name: "Focus", ms: 45 * 60000 },
            { ts: weekStart + 10 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      harness.pageActivityOverview("older");

      expect(harness.openActivityDaySummary(currentDayKey)).toBe(false);
      expect(harness.openActivityDaySummary(olderDayKey)).toBe(true);
      expect(harness.openSummaryCalls[0]?.entries[0]).toEqual(
        expect.objectContaining({ taskId: "focus", ms: 45 * 60000 })
      );
    } finally {
      harness.restore();
    }
  });

  it("orders preferred productivity days from the configured week start", () => {
    const harness = createRenderHarness([], {
      weekStarting: "sun",
      optimalProductivityDays: ["sat", "sun"],
    });

    try {
      harness.renderActivityOverview();
      const axisHtml = harness.byId.get("dashboardActivityXAxis")?.innerHTML || "";
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));

      expect(axisHtml.indexOf(">Sun<")).toBeGreaterThanOrEqual(0);
      expect(axisHtml.indexOf(">Sat<")).toBeGreaterThan(axisHtml.indexOf(">Sun<"));
      expect(harness.byId.get("dashboardActivityXAxis")?.style["--dashboard-activity-visible-days"]).toBe("2");
      expect(bars).toHaveLength(2);
    } finally {
      harness.restore();
    }
  });

  it("renders current week without previous-week ghost bars on desktop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
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
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");
      const currentBar = getActivityBarFront(bars[0]);

      expect(axisDayCount).toBe(7);
      expect(bars).toHaveLength(7);
      expect(previousBars?.style.display).toBe("none");
      expect(previousBars?.children).toHaveLength(0);
      expect(Number.parseFloat(String(currentBar?.getAttribute("height") || "0"))).toBeGreaterThan(0);
    } finally {
      harness.restore();
    }
  });

  it("keeps previous-week ghost bars hidden when the dashboard setting is disabled", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        historyByTaskId: {
          focus: [
            { ts: weekStart - 7 * 86400000 + 9 * 60 * 60 * 1000, name: "Focus", ms: 180 * 60000 },
            { ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
          ],
        },
        dashboardPreviousWeekVisible: false,
      }
    );

    try {
      harness.renderActivityOverview();
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");

      expect(previousBars?.style.display).toBe("none");
      expect(previousBars?.children).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("keeps previous-week ghost bars hidden when no previous-week data exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        historyByTaskId: {
          focus: [
            { ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");

      expect(previousBars?.style.display).toBe("none");
      expect(previousBars?.children).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("renders current week without previous-week ghost bars and no y-axis labels on mobile", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
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
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");
      const yAxisHtml = harness.byId.get("dashboardActivityYAxis")?.innerHTML || "";
      const currentBar = getActivityBarFront(bars[0]);

      expect(axisDayCount).toBe(7);
      expect(bars).toHaveLength(7);
      expect(previousBars?.style.display).toBe("none");
      expect(previousBars?.children).toHaveLength(0);
      expect(yAxisHtml).toBe("");
      expect(Number.parseFloat(String(currentBar?.getAttribute("height") || "0"))).toBeGreaterThan(0);
    } finally {
      harness.restore();
    }
  });

  it("uses goal-progress colors per day when a daily pace target exists", () => {
    const weekStart = startOfCurrentWeekMs(Date.now(), "mon");
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })],
      {
        optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
        historyByTaskId: {
          focus: [
            { ts: weekStart + 9 * 60 * 60 * 1000, name: "Focus", ms: 60 * 60000 },
            { ts: weekStart + 86400000 + 9 * 60 * 60 * 1000, name: "Focus", ms: 120 * 60000 },
            { ts: weekStart + 2 * 86400000 + 9 * 60 * 60 * 1000, name: "Focus", ms: 180 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderActivityOverview();
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const barsContainer = harness.byId.get("dashboardActivityBars");
      const firstBar = getActivityBarFront(bars[0]);
      const secondBar = getActivityBarFront(bars[1]);
      const thirdBar = getActivityBarFront(bars[2]);
      const goalLine = harness.byId.get("dashboardActivityGoalLine");
      const goalLabel = harness.byId.get("dashboardActivityGoalLabel");
      const previousBars = harness.byId.get("dashboardActivityPreviousBars");
      const goalPaths = getActivityGoalPaths(barsContainer);
      const currentGoalPath = getActivityGoalPathByState(barsContainer, "Current");
      const goalPathYValues = getActivityGoalPathYValues(currentGoalPath);

      expect(bars).toHaveLength(7);
      expect(firstBar?.getAttribute("data-dashboard-activity-color")).toBe("rgb(255,140,0)");
      expect(secondBar?.getAttribute("data-dashboard-activity-color")).toBe("rgb(12,245,127)");
      expect(thirdBar?.getAttribute("data-dashboard-activity-color")).toBe("rgb(12,245,127)");
      expect(firstBar?.getAttribute("fill")).not.toBe(secondBar?.getAttribute("fill"));
      expect(secondBar?.getAttribute("fill")).not.toBe(thirdBar?.getAttribute("fill"));
      expect(getActivityGradientStopColors(barsContainer, "dashboardActivityBarGradient-0")).toEqual([
        "rgb(255,184,97)",
        "rgb(255,161,46)",
        "rgb(214,118,0)",
        "rgb(148,81,0)",
      ]);
      expect(getActivityGradientStopColors(barsContainer, "dashboardActivityBarGradient-1")).toEqual([
        "rgb(104,249,176)",
        "rgb(56,247,150)",
        "rgb(10,206,107)",
        "rgb(7,142,74)",
      ]);
      expect(getActivityGradientStopColors(barsContainer, "dashboardActivityBarGradient-2")).toEqual([
        "rgb(104,249,176)",
        "rgb(56,247,150)",
        "rgb(10,206,107)",
        "rgb(7,142,74)",
      ]);
      expect(goalLine?.style.display).toBe("none");
      expect(goalLabel?.style.display).toBe("");
      expect(goalLabel?.textContent).toBe("2h");
      expect(goalLine?.getAttribute("x1")).toBe("84");
      expect(goalLine?.getAttribute("x2")).toBe("692");
      expect(Number(goalLabel?.getAttribute("x"))).toBeLessThan(Number(goalLine?.getAttribute("x1")));
      expect(goalPaths).toHaveLength(1);
      expect(currentGoalPath?.getAttribute("class")).toContain("dashboardActivityGoalPathCurrent");
      expect(currentGoalPath?.getAttribute("d")).toMatch(/^M /);
      expect(goalPathYValues.length).toBeGreaterThan(1);
      expect(new Set(goalPathYValues).size).toBe(1);
      expect(previousBars?.style.display).toBe("none");
      expect(previousBars?.children).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("renders one historical goal path at saved per-day targets", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const tasks = [task({ id: "focus", timeGoalPeriod: "week", timeGoalMinutes: 1260 })];
    const harness = createRenderHarness(tasks, {
      optimalProductivityDays: ["mon", "tue", "wed"],
      activityGoalSnapshotsByDay: {
        "2026-05-18": 60 * 60000,
        "2026-05-19": 120 * 60000,
      },
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 18, 9).getTime(), name: "Focus", ms: 60 * 60000 },
          { ts: new Date(2026, 4, 19, 9).getTime(), name: "Focus", ms: 120 * 60000 },
          { ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 180 * 60000 },
        ],
      },
    });

    try {
      harness.renderActivityOverview();
      const barsContainer = harness.byId.get("dashboardActivityBars");
      const goalPaths = getActivityGoalPaths(barsContainer);
      const previousGoalPath = getActivityGoalPathByState(barsContainer, "Previous");
      const currentGoalPath = getActivityGoalPathByState(barsContainer, "Current");
      const goalLabel = harness.byId.get("dashboardActivityGoalLabel");
      const previousGoalLabel = harness.byId.get("dashboardActivityPreviousGoalLabel");

      expect(goalPaths).toHaveLength(3);
      expect(previousGoalPath?.getAttribute("class")).toContain("dashboardActivityGoalPathPrevious");
      expect(currentGoalPath?.getAttribute("class")).toContain("dashboardActivityGoalPathCurrent");
      expect(getActivityGoalPathYValues(previousGoalPath)).toHaveLength(3);
      expect(getActivityGoalPathYValues(currentGoalPath)).toHaveLength(2);
      expect(goalLabel?.textContent).toBe("3h");
      expect(previousGoalLabel?.textContent).toBe("2h");
    } finally {
      harness.restore();
    }
  });

  it("labels the carried-back Activity Overview goal line value on older weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const tasks = [task({ id: "focus", timeGoalPeriod: "week", timeGoalMinutes: 1260 })];
    const harness = createRenderHarness(tasks, {
      optimalProductivityDays: ["mon", "tue", "wed"],
      activityGoalSnapshotsByDay: {
        "2026-05-18": 60 * 60000,
      },
      historyByTaskId: {
        focus: [{ ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 60 * 60000 }],
      },
    });

    try {
      harness.renderActivityOverview();
      expect(harness.byId.get("dashboardActivityGoalLabel")?.textContent).toBe("3h");
      expect(harness.byId.get("dashboardActivityGoalLine")?.style.display).toBe("none");

      harness.pageActivityOverview("older");
      const currentGoalPath = getActivityGoalPathByState(harness.byId.get("dashboardActivityBars"), "Current");
      const previousGoalPath = getActivityGoalPathByState(harness.byId.get("dashboardActivityBars"), "Previous");
      const goalPathYValues = getActivityGoalPathYValues(currentGoalPath);
      const previousGoalLabel = harness.byId.get("dashboardActivityPreviousGoalLabel");

      expect(harness.byId.get("dashboardActivityXAxis")?.innerHTML).toContain("11 May");
      expect(harness.byId.get("dashboardActivityGoalLabel")?.textContent).toBe("3h");
      expect(previousGoalLabel?.textContent).toBe("1h");
      expect(harness.byId.get("dashboardActivityGoalLine")?.style.display).toBe("");
      expect(previousGoalPath?.getAttribute("class")).toContain("dashboardActivityGoalPathPrevious");
      expect(currentGoalPath).toBeNull();
      expect(goalPathYValues).toHaveLength(0);
      expect(getActivityGoalPathYValues(previousGoalPath)).toHaveLength(2);
      expect(new Set(getActivityGoalPathYValues(previousGoalPath)).size).toBe(1);
    } finally {
      harness.restore();
    }
  });

  it("separates previous and current target labels when the lines are close together", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const tasks = [task({ id: "focus", timeGoalPeriod: "week", timeGoalMinutes: 1260 })];
    const harness = createRenderHarness(tasks, {
      optimalProductivityDays: ["mon", "tue", "wed"],
      activityGoalSnapshotsByDay: {
        "2026-05-18": 165 * 60000,
      },
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 60 * 60000 },
        ],
      },
    });

    try {
      harness.renderActivityOverview();
      harness.pageActivityOverview("older");
      const currentGoalLabel = harness.byId.get("dashboardActivityGoalLabel");
      const previousGoalLabel = harness.byId.get("dashboardActivityPreviousGoalLabel");
      const currentY = Number(currentGoalLabel?.getAttribute("y"));
      const previousY = Number(previousGoalLabel?.getAttribute("y"));

      expect(currentGoalLabel?.textContent).toBe("3h");
      expect(previousGoalLabel?.textContent).toBe("2h 45m");
      expect(Math.abs(currentY - previousY)).toBeGreaterThanOrEqual(16);
    } finally {
      harness.restore();
    }
  });

  it("pages Activity Overview to older and newer selected weeks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const tasks = [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })];
    const harness = createRenderHarness(tasks, {
      optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 45 * 60000 },
          { ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 90 * 60000 },
        ],
      },
    });

    try {
      harness.renderActivityOverview();
      expect(harness.byId.get("dashboardActivityXAxis")?.innerHTML).toContain("18 May");
      expect(harness.byId.get("dashboardActivityPageOlderBtn")?.disabled).toBe(false);
      expect(harness.byId.get("dashboardActivityPageNewerBtn")?.disabled).toBe(true);

      harness.pageActivityOverview("older");
      const olderBars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const olderWednesdayBar = getActivityBarFront(olderBars[2]);
      expect(harness.byId.get("dashboardActivityXAxis")?.innerHTML).toContain("11 May");
      expect(Number.parseFloat(String(olderWednesdayBar?.getAttribute("height") || "0"))).toBeGreaterThan(0);
      expect(harness.byId.get("dashboardActivityPageOlderBtn")?.disabled).toBe(true);
      expect(harness.byId.get("dashboardActivityPageNewerBtn")?.disabled).toBe(false);
      expect(harness.byId.get("dashboardActivityChart")?.getAttribute("aria-label")).toContain("11 May through 17 May");
      expect(harness.byId.get("dashboardActivityChartWrap")?.classList.contains("isPagingOlder")).toBe(true);

      harness.pageActivityOverview("newer");
      expect(harness.byId.get("dashboardActivityXAxis")?.innerHTML).toContain("18 May");
      expect(harness.byId.get("dashboardActivityPageNewerBtn")?.disabled).toBe(true);
      expect(harness.byId.get("dashboardActivityChartWrap")?.classList.contains("isPagingNewer")).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it("disables older Activity Overview paging when no older activity week exists", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const harness = createRenderHarness([task({ id: "focus", name: "Focus" })], {
      optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      historyByTaskId: {
        focus: [{ ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 60 * 60000 }],
      },
    });

    try {
      harness.renderActivityOverview();
      expect(harness.byId.get("dashboardActivityPageOlderBtn")?.disabled).toBe(true);
      expect(harness.byId.get("dashboardActivityPageOlderBtn")?.getAttribute("aria-disabled")).toBe("true");
      expect(harness.byId.get("dashboardActivityPageNewerBtn")?.disabled).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it("keeps Activity Overview summary cards current while chart weeks are paged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 10));
    const tasks = [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 840 })];
    const harness = createRenderHarness(tasks, {
      optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
      historyByTaskId: {
        focus: [
          { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 45 * 60000 },
          { ts: new Date(2026, 4, 20, 9).getTime(), name: "Focus", ms: 90 * 60000 },
        ],
      },
    });

    try {
      harness.renderAll();
      const todayValue = harness.byId.get("dashboardActivityTodayHoursValue")?.textContent;
      const weekValue = harness.byId.get("dashboardActivityWeeklyGoalsValue")?.textContent;

      harness.pageActivityOverview("older");

      expect(harness.byId.get("dashboardActivityXAxis")?.innerHTML).toContain("11 May");
      expect(harness.byId.get("dashboardActivityTodayHoursValue")?.textContent).toBe(todayValue);
      expect(harness.byId.get("dashboardActivityWeeklyGoalsValue")?.textContent).toBe(weekValue);
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
      const bars = getActivityBarGroups(harness.byId.get("dashboardActivityBars"));
      const firstBar = getActivityBarFront(bars[0]);
      const goalLine = harness.byId.get("dashboardActivityGoalLine");
      const goalPath = getActivityGoalPath(harness.byId.get("dashboardActivityBars"));

      expect(firstBar?.getAttribute("data-dashboard-activity-color")).toBe("#00e5ff");
      expect(goalLine?.style.display).toBe("none");
      expect(goalPath).toBeNull();
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
      expect(gridHtml).toContain('data-heatmap-flip="open"');
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
      expect(harness.byId.get("dashboardWeeklyGoalsProgressText")?.textContent).toBe("63% of weekly goal");
      expect(harness.byId.get("dashboardActivityWeeklyGoalsProgressText")?.textContent).toBe("63% of weekly goal");
      expect(harness.byId.get("dashboardWeeklyGoalsProgressText")?.classList.contains("negative")).toBe(true);
      expect(harness.byId.get("dashboardActivityWeeklyGoalsProgressText")?.classList.contains("negative")).toBe(true);
      expect(harness.byId.get("dashboardActivityTodayTrendIndicator")?.style.display).toBe("none");
      expect(harness.byId.get("dashboardActivityTodayTrendIndicator")?.textContent).toBe("");
    } finally {
      harness.restore();
    }
  });

  it("does not render a top percentage stat in the Activity weekly summary", () => {
    useFixedNow();
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus", timeGoalPeriod: "week", timeGoalMinutes: 300 })],
      {
        weekStarting: "mon",
        optimalProductivityDays: ["mon", "wed", "fri"],
        historyByTaskId: {
          focus: [
            { ts: new Date(2026, 4, 1, 9).getTime(), name: "Focus", ms: 15 * 60000 },
            { ts: new Date(2026, 4, 4, 9).getTime(), name: "Focus", ms: 60 * 60000 },
            { ts: new Date(2026, 4, 5, 9).getTime(), name: "Focus", ms: 300 * 60000 },
            { ts: new Date(2026, 4, 6, 9).getTime(), name: "Focus", ms: 40 * 60000 },
            { ts: new Date(2026, 4, 11, 9).getTime(), name: "Focus", ms: 60 * 60000 },
            { ts: new Date(2026, 4, 12, 9).getTime(), name: "Focus", ms: 300 * 60000 },
            { ts: new Date(2026, 4, 13, 9).getTime(), name: "Focus", ms: 60 * 60000 },
          ],
        },
      }
    );

    try {
      harness.renderAll();

      expect(harness.byId.has("dashboardActivityWeeklyTrendIndicator")).toBe(false);
      expect(harness.byId.get("dashboardActivityWeeklyGoalsValue")?.textContent).toBe("7h 0m");
      expect(harness.byId.get("dashboardActivityWeeklyGoalsProgressText")?.textContent).toBe("100% of weekly goal");
      expect(harness.byId.get("dashboardActivityWeeklyGoalsProgressText")?.classList.contains("positive")).toBe(true);
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
      expect(harness.byId.get("dashboardTodayHoursDelta")?.textContent).toBe("+30m vs previous productivity day");
      expect(harness.byId.get("dashboardActivityTodayHoursDelta")?.textContent).toBe("+30m vs prev productivity day");
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

  it("preserves canonical session identity and the raw name for summary capability enrichment", () => {
    const ts = middayToday();
    const dayKey = localDayKey(ts);
    const harness = createRenderHarness(
      [task({ id: "focus", name: "Focus" })],
      {
        historyByTaskId: {
          focus: [{ ts, name: " Focus ", ms: 30 * 60 * 1000, sessionId: "session-1" }],
        },
      }
    );

    try {
      expect(harness.openHeatTaskSummary(dayKey, "focus")).toBe(true);

      expect(harness.openSummaryCalls[0]?.entries).toEqual([
        {
          ts,
          ms: 30 * 60 * 1000,
          name: " Focus ",
          note: undefined,
          sessionId: "session-1",
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
  it("keeps desktop Activity Overview to one integrated grid column", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const desktopOrderCss = css.slice(css.indexOf("/* Desktop dashboard panel order: Activity Overview, Momentum, Task Overview, Focus Heatmap. */"));
    const activityOverviewRule =
      desktopOrderCss.match(
        /@media \(min-width: 981px\)\{[\s\S]*?\.dashboardIntegratedPanel > \.dashboardActivityOverviewCard\{[\s\S]*?\n  \}/
      )?.[0] || "";

    expect(activityOverviewRule).toContain("grid-column:1 !important;");
    expect(activityOverviewRule).not.toContain("grid-column:1 / 3 !important;");
  });

  it("keeps mobile activity summaries side by side with state-colored progress fills", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const narrowSummaryRule =
      css.match(
        /@media \(max-width: 420px\)\{\n\s+body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel \.dashboardActivitySummaryStack\{[\s\S]*?\n  \}/
      )?.[0] || "";

    expect(narrowSummaryRule).toContain("grid-template-columns:repeat(2, minmax(0, 1fr)) !important;");
    expect(narrowSummaryRule).not.toContain("grid-template-columns:minmax(0, 1fr) !important;");
    expect(css).toContain(
      ".dashboardActivitySummaryMini:has(.dashboardSummaryFoot.positive) .dashboardGoalProgressFill{\n  background:linear-gradient(90deg, #47ffb5, #9dff5f) !important;"
    );
    expect(css).toContain(
      ".dashboardActivitySummaryMini:has(.dashboardSummaryFoot.negative) .dashboardGoalProgressFill{\n  background:linear-gradient(90deg, #ff6b6b, #ff8a5f) !important;"
    );
  });

  it("keeps the current activity day label aligned while highlighting the day and date", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).not.toContain(".dashboardActivityAxisDay.isCurrentDay small{\n  padding-bottom:8px;");
    expect(css).not.toContain(".dashboardActivityAxisDay.isCurrentDay small{\n    padding-bottom:6px !important;");
    expect(css).toContain(
      ".dashboardActivityAxisDay.isCurrentDay span,\n.dashboardActivityAxisDay.isCurrentDay small{\n  color:#35e8ff;\n  padding-bottom:0;\n  text-decoration:none;"
    );
    expect(css).toContain(
      ".dashboardActivityAxisDay.isCurrentDay span,\nbody[data-app-page=\"dashboard\"] #app[aria-label=\"TaskLaunch App\"] #appPageDashboard .dashboardActivityAxisDay.isCurrentDay small{\n  color:var(--dashboard-reference-cyan) !important;"
    );
  });

  it("keeps Activity Overview pagination controls inside the chart wrapper", () => {
    const component = readFileSync("src/app/tasktimer/components/DashboardPageContent.tsx", "utf8").replace(/\r\n/g, "\n");
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const chartWrap = component.slice(
      component.indexOf('id="dashboardActivityChartWrap"'),
      component.indexOf('id="dashboardActivityYAxis"')
    );

    expect(chartWrap).toContain('id="dashboardActivityPageOlderBtn"');
    expect(chartWrap).toContain('className="iconBtn dashboardActivityPageBtn dashboardActivityPageBtnOlder"');
    expect(chartWrap).toContain('{"<"}');
    expect(chartWrap).toContain('data-dashboard-activity-page="older"');
    expect(chartWrap).toContain('id="dashboardActivityPageNewerBtn"');
    expect(chartWrap).toContain('className="iconBtn dashboardActivityPageBtn dashboardActivityPageBtnNewer"');
    expect(chartWrap).toContain('{">"}');
    expect(chartWrap).toContain('data-dashboard-activity-page="newer"');
    expect(css).toContain(".dashboardActivityPageBtn{\n  position:absolute;");
    expect(css).not.toContain(".dashboardActivityPageBtn{\n  position:absolute;\n  top:calc(50% - 22px);\n  z-index:3;\n  width:");
    expect(css).not.toContain("body[data-app-page=\"dashboard\"] #app[aria-label=\"TaskLaunch App\"] #appPageDashboard .dashboardActivityPageBtn{\n  border-color:");
    expect(css).not.toContain("body[data-app-page=\"dashboard\"] #app[aria-label=\"TaskLaunch App\"] #appPageDashboard .dashboardActivityPageBtn{\n  box-shadow:");
    expect(css).not.toContain(".dashboardActivityPageBtn:disabled,");
    expect(css).toContain("  border-color:transparent;\n  background:transparent;\n  color:var(--text);");
    expect(css).toContain(".dashboardActivityPageBtn:hover,\n.dashboardActivityPageBtn:focus-visible{\n  border-color:transparent;\n  background:transparent;\n  color:var(--text);");
    expect(css).toContain("body[data-theme=\"lime\"] #app[aria-label=\"TaskLaunch App\"] #appPageDashboard .dashboardActivityPageBtn:hover,");
    expect(css).toContain("body[data-theme=\"lime\"] #app[aria-label=\"TaskLaunch App\"] #appPageDashboard .dashboardActivityPageBtn:focus-visible{\n  border-color:transparent;");
    expect(css).toContain(".dashboardActivityPageBtnOlder{\n  left:0;");
    expect(css).toContain(".dashboardActivityPageBtnNewer{\n  right:0;");
    expect(css).toContain(".dashboardActivityChartWrap.isPagingOlder .dashboardActivityChart,");
    expect(css).toContain("animation:dashboardActivityWeekSlideFromLeft 320ms cubic-bezier(.2,.8,.2,1) both;");
    expect(css).toContain("animation:dashboardActivityWeekSlideFromRight 320ms cubic-bezier(.2,.8,.2,1) both;");
    expect(css).toContain("@media (prefers-reduced-motion: reduce){");
  });

  it("keeps the mobile Task Overview panel on the shared dashboard panel chrome", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const referenceCss = css.slice(css.indexOf("/* Activity Overview and Momentum reference redesign. */"));
    const sharedPanelRule =
      referenceCss.match(
        /body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardActivityOverviewCard,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard\{[\s\S]*?\n\}/
      )?.[0] || "";
    const sharedPanelTopLineRule =
      referenceCss.match(
        /body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardActivityOverviewCard::before,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard::before\{[\s\S]*?\n\}/
      )?.[0] || "";
    const mobileSharedPanelRule =
      referenceCss.match(
        /@media \(max-width: 640px\)\{\n\s+body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardActivityOverviewCard,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard\{[\s\S]*?\n  \}/
      )?.[0] || "";

    expect(sharedPanelRule).toContain(".dashboardSupportGrid > .dashboardTasksCompletedCard,");
    expect(sharedPanelRule).toContain(".dashboardSupportGrid > .dashboardHeatCard{");
    expect(sharedPanelRule).toContain("border-radius:18px !important;");
    expect(referenceCss).toContain("--dashboard-reference-panel-bg-top:#0d0f13;");
    expect(referenceCss).toContain("--dashboard-reference-panel-bg-bottom:#0d0f13;");
    expect(sharedPanelRule).toContain("background:linear-gradient(180deg, var(--dashboard-reference-panel-bg-top), var(--dashboard-reference-panel-bg-bottom)) !important;");
    expect(sharedPanelTopLineRule).toContain(".dashboardSupportGrid > .dashboardHeatCard::before{");
    expect(sharedPanelTopLineRule).toContain("background:linear-gradient(90deg, transparent, var(--dashboard-reference-border-strong), transparent) !important;");
    expect(referenceCss).toContain("background:linear-gradient(180deg, #0d0f13 0%, #0d0f13 100%) !important;");
    expect(mobileSharedPanelRule).toContain(".dashboardSupportGrid > .dashboardTasksCompletedCard,");
    expect(mobileSharedPanelRule).toContain(".dashboardSupportGrid > .dashboardHeatCard{");
    expect(mobileSharedPanelRule).toContain("border-radius:16px !important;");
  });

  it("uses panel-background strokes for rendered donut cut lines and non-empty base ring", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain(".dashboardTasksCompletedTicks:not(.isEmpty) .dashboardTasksCompletedTrack{\n  stroke: #0d0f13;\n  opacity: 1;\n}");
    expect(css).toContain(".dashboardTasksCompletedSegmentSeparator{\n  fill: none;\n  stroke: #0d0f13;");
    expect(css).toContain(".dashboardTasksCompletedRingEdge{\n  fill: none;\n  stroke: #0d0f13;\n  stroke-width: 5;");
  });

  it("uses larger status text for outer donut task labels", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");

    expect(css).toContain(".dashboardTasksCompletedLabelStatus{\n  color: rgba(188,214,230,.7);\n  font-family: var(--font-orbitron), \"Segoe UI Variable\", \"Segoe UI\", Arial, sans-serif !important;\n  font-size: 12px;");
    expect(css).toContain(".dashboardTasksCompletedLabel.isCompact .dashboardTasksCompletedLabelStatus{\n  font-size: 11px;");
    expect(css).toContain(".dashboardTasksCompletedLabel.isMicro .dashboardTasksCompletedLabelStatus{\n  font-size: 10px;");
  });

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
      const separatorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedSegmentSeparator") || [];
      const ringEdgeEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedRingEdge") || [];

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Goal Task");
      expect(labelsEl?.children[1]?.innerHTML).toContain("New Task");
      expect(connectorEls).toHaveLength(0);
      expect(separatorEls).toHaveLength(2);
      expect(ringEdgeEls).toHaveLength(4);
      expect(ringEdgeEls.map((edge) => edge.getAttribute("r"))).toEqual(["70", "76", "100", "106"]);
      expect(ringEdgeEls.every((edge) => edge.getAttribute("stroke") === "#0d0f13")).toBe(true);
      expect(ringEdgeEls.every((edge) => edge.getAttribute("stroke-width") === "5")).toBe(true);
      expect(separatorEls[0]?.getAttribute("stroke")).toBe("#0d0f13");
      expect(separatorEls[0]?.getAttribute("stroke-dasharray")).toBe("1.2 98.8");
      expect(separatorEls[0]?.getAttribute("aria-hidden")).toBe("true");
      expect(centerEl?.innerHTML).toContain("0%");
      expect(centerEl?.innerHTML).toContain("completed today");
    } finally {
      harness.restore();
    }
  });

  it("does not add segment edge separators for a single scheduled slice", () => {
    const tasks = [
      task({ id: "solo-task", name: "Solo Task", plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const separatorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedSegmentSeparator") || [];

      expect(separatorEls).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("does not add an internal separator at a partial progress stop", () => {
    const nowValue = Date.now();
    const tasks = [
      task({ id: "partial-task", name: "Partial Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "partial-task": [{ ts: nowValue, name: "Partial Task", ms: 30 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const separatorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedSegmentSeparator") || [];

      expect(separatorEls).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("shows completed and incomplete tasks scheduled today from legacy schedule fields", () => {
    const nowValue = Date.now();
    const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()] as NonNullable<Task["plannedStartDay"]>;
    const tasks = [
      task({
        id: "done-task",
        name: "Done Task",
        order: 1,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartDay: today,
        plannedStartTime: "09:00",
        plannedStartByDay: null,
      }),
      task({
        id: "open-task",
        name: "Open Task",
        order: 2,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartDay: today,
        plannedStartTime: "10:00",
        plannedStartByDay: null,
      }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "done-task": [{ ts: nowValue, name: "Done Task", ms: 60 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Done Task");
      expect(labelsEl?.children[0]?.innerHTML).toContain("Completed");
      expect(labelsEl?.children[1]?.innerHTML).toContain("Open Task");
      expect(labelsEl?.children[1]?.innerHTML).toContain("Not complete");
      expect(centerEl?.innerHTML).toContain("50%");
    } finally {
      harness.restore();
    }
  });

  it("fills progress slice visuals across the radial ring band while preserving slice gaps", () => {
    const nowValue = Date.now();
    const today = todaySchedule();
    const tasks = [
      task({
        id: "done-task",
        name: "Done Task",
        order: 1,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartByDay: today,
      }),
      task({
        id: "partial-task",
        name: "Partial Task",
        order: 2,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartByDay: today,
      }),
      task({
        id: "open-task",
        name: "Open Task",
        order: 3,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartByDay: today,
      }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "done-task": [{ ts: nowValue, name: "Done Task", ms: 60 * 60 * 1000 }],
        "partial-task": [{ ts: nowValue, name: "Partial Task", ms: 30 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const overlayEls = svgEl?.children.filter((child) => String(child.getAttribute("class") || "").includes("dashboardTasksCompletedSegmentProgressOverlay")) || [];
      const separatorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedSegmentSeparator") || [];
      const completedOverlay = overlayEls.find((child) => String(child.getAttribute("class") || "").includes("isComplete"));
      const partialOverlay = overlayEls.find((child) => !String(child.getAttribute("class") || "").includes("isComplete"));

      expect(centerEl?.innerHTML).toContain("50%");
      expect(separatorEls).toHaveLength(3);
      expect(separatorEls[0]?.getAttribute("stroke-dasharray")).toBe("1.2 98.8");
      expect(overlayEls).toHaveLength(2);
      expect(completedOverlay?.getAttribute("stroke-dasharray")).toBe("32.133 67.867");
      expect(completedOverlay?.getAttribute("stroke-dashoffset")).toBe("-0.6");
      expect(completedOverlay?.getAttribute("aria-hidden")).toBe("true");
      expect(partialOverlay?.getAttribute("stroke-dasharray")).toBe("16.067 83.933");
      expect(partialOverlay?.getAttribute("stroke-dashoffset")).toBe("-33.933");
      expect(partialOverlay?.getAttribute("aria-hidden")).toBe("true");
    } finally {
      harness.restore();
    }
  });

  it("bridges valid scheduled task completion metadata while history is delayed", () => {
    const today = todaySchedule();
    const todayKey = localDayKey(Date.now());
    const tasks = [
      task({
        id: "done-task",
        name: "Done Task",
        order: 1,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        timeGoalCompletedDayKey: todayKey,
        timeGoalCompletedAtMs: Date.now(),
        timeGoalCompletedReason: "goal",
        timeGoalCompletedElapsedMs: 60 * 60 * 1000,
        plannedStartByDay: today,
      }),
      task({
        id: "open-task",
        name: "Open Task",
        order: 2,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartByDay: today,
      }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Done Task");
      expect(labelsEl?.children[0]?.innerHTML).toContain("Completed");
      expect(labelsEl?.children[1]?.innerHTML).toContain("Open Task");
      expect(labelsEl?.children[1]?.innerHTML).toContain("Not complete");
      expect(centerEl?.innerHTML).toContain("50%");
    } finally {
      harness.restore();
    }
  });

  it("keeps completed-today tasks in the donut even when schedule fields are not renderable", () => {
    const today = todaySchedule();
    const todayKey = localDayKey(Date.now());
    const tasks = [
      task({
        id: "done-task",
        name: "Done Task",
        order: 1,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        timeGoalCompletedDayKey: todayKey,
        timeGoalCompletedAtMs: Date.now(),
        timeGoalCompletedReason: "goal",
        plannedStartDay: null,
        plannedStartTime: null,
        plannedStartByDay: null,
      }),
      task({
        id: "open-task",
        name: "Open Task",
        order: 2,
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartByDay: today,
      }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "done-task": [{ ts: Date.now(), name: "Done Task", ms: 60 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const doneLabel = labelsEl?.children.find((child) => child.innerHTML.includes("Done Task"));
      const openLabel = labelsEl?.children.find((child) => child.innerHTML.includes("Open Task"));

      expect(labelsEl?.children).toHaveLength(2);
      expect(doneLabel?.innerHTML).toContain("Completed");
      expect(openLabel?.innerHTML).toContain("Open Task");
      expect(centerEl?.innerHTML).toContain("50%");
    } finally {
      harness.restore();
    }
  });

  it("shows recurring daily scheduled tasks when their scheduled day is not today", () => {
    const tasks = [
      task({ id: "scheduled-task", name: "Scheduled Task", plannedStartByDay: nonTodaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(labelsEl?.children).toHaveLength(1);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Scheduled Task");
      expect(centerEl?.innerHTML).toContain("0%");
      expect(centerEl?.innerHTML).toContain("completed today");
    } finally {
      harness.restore();
    }
  });

  it("excludes once-off scheduled tasks when their scheduled day is not today", () => {
    const tasks = [
      task({
        id: "once-off-task",
        name: "Once Off Task",
        taskType: "once-off",
        plannedStartByDay: nonTodaySchedule(),
      }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(labelsEl?.children).toHaveLength(0);
      expect(centerEl?.innerHTML).toContain("No scheduled tasks");
    } finally {
      harness.restore();
    }
  });

  it("shows once-off tasks with a current scheduled slot even when their target date is stale", () => {
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
      expect(connectorEls).toHaveLength(0);
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
      const needleEl = harness.byId.get("dashboardTasksCompletedNeedle");
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const runningLabel = labelsEl?.children.find((child) => child.innerHTML.includes("Deep Work"));

      expect(centerEl?.innerHTML).toContain("Deep Work");
      expect(centerEl?.innerHTML).toContain("In Progress");
      expect(needleEl?.classList.contains("isRunning")).toBe(true);
      expect(runningLabel?.className).toContain("isRunning");
    } finally {
      harness.restore();
    }
  });

  it("marks the needle as running at the running task slice start before live progress is logged", () => {
    const tasks = [
      task({ id: "queued-task", name: "Queued Task", order: 1, plannedStartByDay: todaySchedule() }),
      task({ id: "running-task", name: "Deep Work", order: 2, running: true, startMs: Date.now() - 1000, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const needleEl = harness.byId.get("dashboardTasksCompletedNeedle");

      expect(needleEl?.classList.contains("isRunning")).toBe(true);
      expect(needleEl?.getAttribute("x1")).not.toBe("190.00");
      expect(needleEl?.getAttribute("y1")).not.toBe("136.00");
    } finally {
      harness.restore();
    }
  });

  it("does not mark the needle as running for stopped partial progress", () => {
    const nowValue = Date.now();
    const tasks = [
      task({ id: "partial-task", name: "Partial Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "partial-task": [{ ts: nowValue, name: "Partial Task", ms: 30 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const needleEl = harness.byId.get("dashboardTasksCompletedNeedle");
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");

      expect(needleEl?.classList.contains("isRunning")).toBe(false);
      expect(labelsEl?.children[0]?.className).not.toContain("isRunning");
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

      expect(centerEl?.innerHTML).toContain("50%");
      expect(centerEl?.innerHTML).toContain("completed today");
    } finally {
      harness.restore();
    }
  });

  it("shows partial task progress in the donut center percentage", () => {
    const nowValue = Date.now();
    const tasks = [
      task({ id: "partial-task", name: "Partial Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "partial-task": [{ ts: nowValue, name: "Partial Task", ms: 30 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(centerEl?.innerHTML).toContain("50%");
      expect(centerEl?.innerHTML).toContain("completed today");
    } finally {
      harness.restore();
    }
  });

  it("weights the donut center percentage by today's task duration", () => {
    const nowValue = Date.now();
    const tasks = [
      task({ id: "daily-task", name: "Daily Task", timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 20, plannedStartByDay: todaySchedule() }),
      task({ id: "weekly-task", name: "Weekly Task", timeGoalEnabled: true, timeGoalPeriod: "week", timeGoalMinutes: 360, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "daily-task": [{ ts: nowValue, name: "Daily Task", ms: 20 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(centerEl?.innerHTML).toContain("5%");
      expect(centerEl?.innerHTML).toContain("completed today");
    } finally {
      harness.restore();
    }
  });

  it("uses today's split target for a scheduled weekly task", () => {
    const nowValue = Date.now();
    const dayOrder = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const todayIndex = new Date().getDay();
    const today = dayOrder[todayIndex];
    const secondDay = dayOrder[(todayIndex + 2) % 7];
    const thirdDay = dayOrder[(todayIndex + 4) % 7];
    const tasks = [
      task({
        id: "weekly-task",
        name: "Weekly Task",
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 360,
        plannedStartByDay: { [today]: "09:00", [secondDay]: "09:00", [thirdDay]: "09:00" },
      }),
    ];
    const harness = createRenderHarness(tasks, {
      historyByTaskId: {
        "weekly-task": [{ ts: nowValue, name: "Weekly Task", ms: 60 * 60 * 1000 }],
      },
    });

    try {
      harness.render();
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");

      expect(labelsEl?.children).toHaveLength(1);
      expect(labelsEl?.children[0]?.innerHTML).toContain("50% complete");
      expect(centerEl?.innerHTML).toContain("50%");
    } finally {
      harness.restore();
    }
  });

  it("excludes weekly tasks that are not scheduled today", () => {
    const tasks = [
      task({
        id: "weekly-task",
        name: "Weekly Task",
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 360,
        plannedStartByDay: nonTodaySchedule(),
      }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");

      expect(labelsEl?.children).toHaveLength(0);
      expect(centerEl?.innerHTML).toContain("No scheduled tasks");
    } finally {
      harness.restore();
    }
  });

  it("keeps labels visible when short time-goal labels are bunched", () => {
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
      expect(connectorEls).toHaveLength(0);
    } finally {
      harness.restore();
    }
  });

  it("keeps shortened task labels when full labels would overlap the donut area", () => {
    const tasks = [
      task({ id: "long-1", name: "Extremely Long Deep Work Task", order: 1, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
      task({ id: "long-2", name: "Extremely Long Admin Task", order: 2, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      ElementStub.labelRectOverride = (element) => element.className.split(/\s+/).includes("dashboardTasksCompletedLabel")
        ? element.className.split(/\s+/).includes("isMicro")
          ? { left: 250, top: 128, right: 304, bottom: 152, width: 54, height: 24 }
          : { left: 170, top: 170, right: 230, bottom: 200, width: 60, height: 30 }
        : null;

      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const centerEl = harness.byId.get("dashboardTasksCompletedCenter");
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.classList.contains("isHiddenForLayout")).toBe(false);
      expect(labelsEl?.children.every((child) => child.className.includes("isMicro"))).toBe(true);
      expect(labelsEl?.children[0]?.innerHTML).toContain("Extre...");
      expect(labelsEl?.children[0]?.getAttribute("title")).toBe("Extremely Long Deep Work Task: Not complete");
      expect(labelsEl?.children[0]?.getAttribute("aria-label")).toBe("Extremely Long Deep Work Task: Not complete");
      expect(connectorEls).toHaveLength(0);
      expect(centerEl?.innerHTML).toContain("0%");
    } finally {
      harness.restore();
    }
  });

  it("keeps shortened task labels close to their connector lines", () => {
    const tasks = [
      task({ id: "long-1", name: "Extremely Long Deep Work Task", order: 1, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
      task({ id: "long-2", name: "Extremely Long Admin Task", order: 2, timeGoalMinutes: 60, plannedStartByDay: todaySchedule() }),
    ];
    const harness = createRenderHarness(tasks);

    try {
      ElementStub.labelRectOverride = (element) => element.className.split(/\s+/).includes("dashboardTasksCompletedLabel")
        ? element.className.split(/\s+/).includes("isMicro")
          ? { left: 250, top: 128, right: 304, bottom: 152, width: 54, height: 24 }
          : { left: 170, top: 170, right: 230, bottom: 200, width: 60, height: 30 }
        : null;

      harness.render();
      const labelsEl = harness.byId.get("dashboardTasksCompletedLabels");
      const label = labelsEl?.children[0];
      const labelX = Number.parseFloat(String(label?.style.left || "0"));
      const labelY = Number.parseFloat(String(label?.style.top || "0"));
      const labelDistance = Math.hypot(labelX - 190, labelY - 190);

      expect(label?.className).toContain("isMicro");
      expect(labelDistance).toBeCloseTo(126, 0);
    } finally {
      harness.restore();
    }
  });

  it("keeps shortened task labels when the rendered chart viewport would clip full labels", () => {
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
        ? element.className.split(/\s+/).includes("isMicro")
          ? { left: 220, top: 128, right: 274, bottom: 152, width: 54, height: 24 }
          : { left: 280, top: 120, right: 340, bottom: 150, width: 60, height: 30 }
        : null;

      harness.render();
      const svgEl = harness.byId.get("dashboardTasksCompletedSvg");
      const connectorEls = svgEl?.children.filter((child) => child.getAttribute("class") === "dashboardTasksCompletedConnector") || [];

      expect(labelsEl?.children).toHaveLength(2);
      expect(labelsEl?.classList.contains("isHiddenForLayout")).toBe(false);
      expect(labelsEl?.children.every((child) => child.className.includes("isMicro"))).toBe(true);
      expect(labelsEl?.children[0]?.getAttribute("title")).toBe("Goal Task: Not complete");
      expect(labelsEl?.children[1]?.getAttribute("title")).toBe("New Task: Not complete");
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
