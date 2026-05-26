import { describe, expect, it } from "vitest";
import { buildMomentumSummaryMessage, createTaskTimerDashboardRender, getPrimaryMomentumDriverKey } from "./dashboard-render";
import { startOfCurrentWeekMs } from "../lib/historyChart";
import type { MomentumSnapshot } from "../lib/momentum";
import type { Task } from "../lib/types";

class ElementStub {
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

  closest(selector: string) {
    void selector;
    return null;
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
  register("dashboardAvgSessionTitle");
  register("dashboardLastRanList");
  register("dashboardAvgSessionEmpty");
  register("dashboardHeatMonthLabel");
  register("dashboardHeatWeekdays");
  register("dashboardHeatCalendarGrid");

  const headerXpCard = options?.includeHeaderXpCard ? new ElementStub() : null;
  const topbarXp = options?.includeHeaderXpCard ? new ElementStub() : null;
  if (headerXpCard) {
    headerXpCard.className = "appShellHeaderXp";
    const valueEl = new ElementStub();
    valueEl.className = "appShellHeaderXpValue";
    const promotionLabelEl = new ElementStub();
    promotionLabelEl.className = "appShellHeaderXpPromotionLabel";
    const progressBarEl = new ElementStub();
    progressBarEl.className = "appShellHeaderXpTrack";
    const progressFillEl = new ElementStub();
    progressFillEl.className = "appShellHeaderXpFill";
    headerXpCard.appendChild(valueEl);
    headerXpCard.appendChild(promotionLabelEl);
    headerXpCard.appendChild(progressBarEl);
    headerXpCard.appendChild(progressFillEl);
  }
  if (topbarXp) {
    topbarXp.className = "taskLaunchTopbarXp";
    const valueEl = new ElementStub();
    valueEl.className = "taskLaunchTopbarXpValue";
    const metaLineEl = new ElementStub();
    metaLineEl.className = "taskLaunchTopbarXpMetaLine";
    const progressBarEl = new ElementStub();
    progressBarEl.className = "taskLaunchTopbarXpTrack";
    const progressFillEl = new ElementStub();
    progressFillEl.className = "taskLaunchTopbarXpFill";
    topbarXp.appendChild(valueEl);
    topbarXp.appendChild(metaLineEl);
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
    historyByTaskId?: Record<string, Array<{ ts: number; name: string; ms: number }>>;
    hasEntitlement?: boolean;
    rewardProgress?: object;
    includeHeaderXpCard?: boolean;
  }
) {
  const { byId, documentRef, headerXpCard, topbarXp } = createDocumentHarness({ includeHeaderXpCard: options?.includeHeaderXpCard });
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentRef,
  });

  const dashboardRender = createTaskTimerDashboardRender({
    els: {
      dashboardWeeklyGoalsValue: byId.get("dashboardWeeklyGoalsValue"),
      dashboardWeeklyGoalsMeta: byId.get("dashboardWeeklyGoalsMeta"),
      dashboardWeeklyGoalsProgressBar: byId.get("dashboardWeeklyGoalsProgressBar"),
      dashboardWeeklyGoalsProjectionMarker: byId.get("dashboardWeeklyGoalsProjectionMarker"),
      dashboardWeeklyGoalsProjectionFill: byId.get("dashboardWeeklyGoalsProjectionFill"),
      dashboardWeeklyGoalsProgressFill: byId.get("dashboardWeeklyGoalsProgressFill"),
      dashboardWeeklyGoalsProgressText: byId.get("dashboardWeeklyGoalsProgressText"),
      dashboardAvgSessionTitle: byId.get("dashboardAvgSessionTitle"),
      dashboardLastRanList: byId.get("dashboardLastRanList"),
      dashboardAvgSessionEmpty: byId.get("dashboardAvgSessionEmpty"),
      dashboardHeatMonthLabel: byId.get("dashboardHeatMonthLabel"),
      dashboardHeatWeekdays: byId.get("dashboardHeatWeekdays"),
      dashboardHeatCalendarGrid: byId.get("dashboardHeatCalendarGrid"),
    } as never,
    getRewardProgress: () => (options?.rewardProgress || {}) as never,
    getTasks: () => tasks,
    getHistoryByTaskId: () => options?.historyByTaskId || {},
    getDeletedTaskMeta: () => ({}),
    getWeekStarting: () => "mon",
    getOptimalProductivityDays: () => ["mon", "wed", "fri"],
    getDashboardAvgRange: () => "past7",
    setDashboardAvgRange: () => {},
    getDashboardTimelineDensity: () => "medium",
    setDashboardTimelineDensity: () => {},
    getDashboardWidgetHasRenderedData: () => ({
      tasksCompleted: false,
      momentum: false,
      focusTrend: false,
      heatCalendar: false,
      modeDistribution: false,
      avgSession: false,
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
    openHistoryEntryNoteOverlay: () => {},
    hasEntitlement: () => options?.hasEntitlement ?? true,
    getCurrentPlan: () => "pro",
  });

  return {
    byId,
    headerXpCard,
    topbarXp,
    renderAll: () => dashboardRender.renderDashboardWidgets(),
    renderHeaderXp: () => dashboardRender.renderDashboardHeaderProgress(),
    render: () => dashboardRender.renderDashboardTasksCompletedCard(),
    renderWeeklyGoals: () => dashboardRender.renderDashboardWeeklyGoalsCard(),
    renderLastRan: () => dashboardRender.renderDashboardAvgSessionChart(),
    renderHeat: () => dashboardRender.renderDashboardHeatCalendar(),
    restore: () => {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    },
  };
}

describe("last ran dashboard card", () => {
  it("keeps full dashboard rendering safe when standalone Today and This Week cards are absent", () => {
    const harness = createRenderHarness([task({ id: "focus", name: "Focus" })]);

    try {
      expect(() => harness.renderAll()).not.toThrow();
    } finally {
      harness.restore();
    }
  });

  it("orders current tasks by newest completed history and places never-run tasks last", () => {
    const now = Date.now();
    const harness = createRenderHarness(
      [
        task({ id: "never", name: "Never Task", order: 1 }),
        task({ id: "older", name: "Older Task", order: 2 }),
        task({ id: "newer", name: "Newer Task", order: 3 }),
      ],
      {
        historyByTaskId: {
          older: [{ ts: now - 3 * 60 * 60 * 1000, name: "Older Task", ms: 25 * 60 * 1000 }],
          newer: [{ ts: now - 60 * 60 * 1000, name: "Newer Task", ms: 10 * 60 * 1000 }],
        },
      }
    );

    try {
      harness.renderLastRan();
      const html = harness.byId.get("dashboardLastRanList")?.innerHTML || "";

      expect(html.indexOf("Newer Task")).toBeLessThan(html.indexOf("Older Task"));
      expect(html.indexOf("Older Task")).toBeLessThan(html.indexOf("Never Task"));
      expect(html).toContain("Time since last ran");
      expect(html).toContain("Never");
    } finally {
      harness.restore();
    }
  });

  it("ignores invalid and zero-duration history when calculating last ran", () => {
    const now = Date.now();
    const harness = createRenderHarness(
      [
        task({ id: "invalid", name: "Invalid Task", order: 1 }),
        task({ id: "valid", name: "Valid Task", order: 2 }),
      ],
      {
        historyByTaskId: {
          invalid: [
            { ts: now - 30 * 60 * 1000, name: "Invalid Task", ms: 0 },
            { ts: 0, name: "Invalid Task", ms: 20 * 60 * 1000 },
          ],
          valid: [{ ts: now - 90 * 60 * 1000, name: "Valid Task", ms: 20 * 60 * 1000 }],
        },
      }
    );

    try {
      harness.renderLastRan();
      const html = harness.byId.get("dashboardLastRanList")?.innerHTML || "";

      expect(html.indexOf("Valid Task")).toBeLessThan(html.indexOf("Invalid Task"));
      expect(html).toContain("Invalid Task");
      expect(html).toContain("Never");
    } finally {
      harness.restore();
    }
  });

  it("does not treat a currently running task as last ran without logged history", () => {
    const now = Date.now();
    const harness = createRenderHarness(
      [
        task({ id: "running", name: "Running Task", order: 1, running: true, startMs: now - 5 * 60 * 1000 }),
        task({ id: "logged", name: "Logged Task", order: 2 }),
      ],
      {
        historyByTaskId: {
          logged: [{ ts: now - 4 * 60 * 60 * 1000, name: "Logged Task", ms: 15 * 60 * 1000 }],
        },
      }
    );

    try {
      harness.renderLastRan();
      const html = harness.byId.get("dashboardLastRanList")?.innerHTML || "";

      expect(html.indexOf("Logged Task")).toBeLessThan(html.indexOf("Running Task"));
      expect(html).toContain("Running Task");
      expect(html).toContain("Never");
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
      const desktopLabelEl = harness.headerXpCard?.querySelector(".appShellHeaderXpPromotionLabel");
      const mobileValueEl = harness.topbarXp?.querySelector(".taskLaunchTopbarXpValue");
      const mobileLabelEl = harness.topbarXp?.querySelector(".taskLaunchTopbarXpMetaLine");

      desktopValueEl?.classList.add("isAnimatingXpCount");
      if (desktopValueEl) desktopValueEl.textContent = "42 XP";
      if (desktopLabelEl) desktopLabelEl.textContent = "198 XP to Technician";
      if (mobileValueEl) mobileValueEl.textContent = "42 XP";
      if (mobileLabelEl) mobileLabelEl.textContent = "198 XP to Technician";

      harness.renderHeaderXp();

      expect(desktopValueEl?.textContent).toBe("42 XP");
      expect(desktopLabelEl?.textContent).toBe("198 XP to Technician");
      expect(mobileValueEl?.textContent).toBe("42 XP");
      expect(mobileLabelEl?.textContent).toBe("198 XP to Technician");
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
    expect(buildMomentumSummaryMessage(momentum)).toContain("Weekly Progress contributed 20 of 30 momentum points");
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
