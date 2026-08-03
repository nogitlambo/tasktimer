import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import { buildDisplayedTasks, createTaskListRenderer } from "./task-list-renderer";
import { clearXpAwardButtonLabelOverride, setXpAwardButtonLabelOverride } from "./xp-award-button-label-override";

type StubElement = {
  tagName: string;
  className: string;
  innerHTML: string;
  dataset: Record<string, string>;
  children: StubElement[];
  attributes: Map<string, string>;
  classList: {
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    toggle: ReturnType<typeof vi.fn>;
    contains: ReturnType<typeof vi.fn>;
  };
  setAttribute: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  appendChild: ReturnType<typeof vi.fn>;
};

function elementStub(tagName = "div"): StubElement {
  const node = {
    tagName,
    className: "",
    innerHTML: "",
    dataset: {} as Record<string, string>,
    children: [] as StubElement[],
    attributes: new Map<string, string>(),
    classList: {
      add: vi.fn((...tokens: string[]) => {
        const classNames = new Set(node.className.split(/\s+/).filter(Boolean));
        tokens.forEach((token) => classNames.add(token));
        node.className = Array.from(classNames).join(" ");
      }),
      remove: vi.fn((...tokens: string[]) => {
        const removals = new Set(tokens);
        node.className = node.className
          .split(/\s+/)
          .filter((token) => token && !removals.has(token))
          .join(" ");
      }),
      toggle: vi.fn((token: string, force?: boolean) => {
        const classNames = new Set(node.className.split(/\s+/).filter(Boolean));
        const nextState = force === undefined ? !classNames.has(token) : !!force;
        if (nextState) classNames.add(token);
        else classNames.delete(token);
        node.className = Array.from(classNames).join(" ");
        return nextState;
      }),
      contains: vi.fn((token: string) => node.className.split(/\s+/).filter(Boolean).includes(token)),
    },
    setAttribute: vi.fn((name: string, value: string) => {
      node.attributes.set(name, value);
    }),
    removeAttribute: vi.fn((name: string) => {
      node.attributes.delete(name);
    }),
    appendChild: vi.fn((child: StubElement) => {
      node.children.push(child);
      return child;
    }),
  };
  return node;
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "task-1",
    name: "Task",
    order: 1,
    elapsed: 0,
    running: false,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    timeGoalEnabled: false,
    timeGoalMinutes: 0,
    ...overrides,
  } as Task;
}

function createHarness(
  overrides: Partial<{
    tasks: Task[];
    taskView: "list" | "tile";
    taskOrderBy: "custom" | "alpha" | "schedule" | "dateAddedAsc" | "dateAddedDesc";
    appPage: string;
    tileColumnCount: number;
    historyByTaskId: Record<string, Array<{ ts: number; ms: number; name: string }>>;
    pruneInactiveHistoryTasks: (activeTaskIds: Set<string>) => boolean;
  }> = {}
) {
  const taskListEl = elementStub("section");
  const openHistoryTaskIds = new Set<string>();
  const pinnedHistoryTaskIds = new Set<string>();
  const historyViewByTaskId: Record<string, { revealPhase?: "openingSpace" | "opening" | "closing" | "closingSpace" | "open" | null; revealTimer?: number | null }> = {};
  const calls: string[] = [];
  const rafQueue: Array<() => void> = [];
  const tasks = overrides.tasks ?? [task({ id: "b", name: "Bravo", order: 2 }), task({ id: "a", name: "Alpha", order: 1 })];
  const renderer = createTaskListRenderer({
    taskListEl: taskListEl as unknown as HTMLElement,
    documentRef: {
      createElement: (tagName: string) => elementStub(tagName) as unknown as HTMLElement,
    },
    getTasks: () => tasks,
    getHistoryByTaskId: () => overrides.historyByTaskId || {},
    getTaskView: () => overrides.taskView ?? "list",
    getTaskOrderBy: () => overrides.taskOrderBy ?? "custom",
    getTileColumnCount: () => overrides.tileColumnCount ?? 2,
    setCurrentTileColumnCount: (value) => calls.push(`tile-count:${value}`),
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    getPinnedHistoryTaskIds: () => pinnedHistoryTaskIds,
    getHistoryViewByTaskId: () => historyViewByTaskId,
    pruneInactiveHistoryTasks: overrides.pruneInactiveHistoryTasks,
    syncTaskFlipStatesForVisibleTasks: (ids) => calls.push(`sync-flips:${Array.from(ids).join(",")}`),
    applyTaskFlipDomState: (taskId) => calls.push(`apply-flip:${taskId}`),
    renderHistory: (taskId) => calls.push(`render-history:${taskId}`),
    getCurrentAppPage: () => overrides.appPage ?? "tasks",
    renderDashboardWidgets: () => calls.push("dashboard"),
    syncTimeGoalModalWithTaskState: () => calls.push("sync-goal"),
    maybeRestorePendingTimeGoalFlow: () => calls.push("restore-goal-flow"),
    clearTimeoutRef: (timer) => calls.push(`clear-timeout:${timer}`),
    requestAnimationFrameRef: (handler) => {
      calls.push("raf");
      rafQueue.push(handler);
    },
    getElapsedMs: () => 0,
    sortMilestones: (milestones) => milestones,
    milestoneUnitSec: () => 3600,
    milestoneUnitSuffix: () => "h",
    checkpointRepeatActiveTaskId: () => null,
    isCheckpointFlashActive: () => false,
    canUseAdvancedHistory: () => true,
    canUseSocialFeatures: () => true,
    hasFriends: () => true,
    isTaskSharedByOwner: () => false,
    getDynamicColorsEnabled: () => false,
    getFullColorTaskCardsEnabled: () => false,
    getModeColor: () => "#00ffff",
    fillBackgroundForPct: (pct) => `pct-${pct}`,
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    formatMainTaskElapsedHtml: (elapsedMs) => `${elapsedMs}ms`,
  });
  return { renderer, taskListEl, openHistoryTaskIds, pinnedHistoryTaskIds, historyViewByTaskId, calls, rafQueue };
}

describe("task list renderer", () => {
  it("reapplies active XP countdown labels after task card rerenders", () => {
    const source = readFileSync(resolve(__dirname, "task-list-renderer.ts"), "utf8");

    expect(source).toContain('import { applyXpAwardButtonLabelOverride, getXpAwardButtonLabelOverride } from "./xp-award-button-label-override";');
    expect(source).toContain('const isHeldResetPrimaryAction = getXpAwardButtonLabelOverride(taskId) === "Reset";');
    expect(source).toContain("const isRecordedGoalCompleted = hasRecordedTaskGoalCompletion(task);");
    expect(source).toContain("const isCompletedForCurrentPeriod = isTaskTimeGoalStartLockedForPeriod(task, Date.now(), options.getWeekStarting?.() || \"mon\");");
    expect(source).toContain("isStaleRecordedGoalCompleted: isRecordedGoalCompleted && !isCompletedForCurrentPeriod,");
    expect(source).toContain("applyXpAwardButtonLabelOverride(taskEl, taskId);");
  });

  it("sorts displayed tasks by custom, alpha, schedule, and date added order", () => {
    const tasks = [
      task({ id: "late", name: "Zulu", order: 3, createdAtMs: 30, plannedStartByDay: { mon: "14:00" } }),
      task({ id: "early", name: "Bravo", order: 2, createdAtMs: 10, plannedStartByDay: { mon: "08:00" } }),
      task({ id: "unscheduled", name: "Alpha", order: 1, createdAtMs: 20 }),
    ];

    expect(buildDisplayedTasks(tasks, "custom").map((entry) => entry.id)).toEqual(["unscheduled", "early", "late"]);
    expect(buildDisplayedTasks(tasks, "alpha").map((entry) => entry.id)).toEqual(["unscheduled", "early", "late"]);
    expect(buildDisplayedTasks(tasks, "schedule").map((entry) => entry.id)).toEqual(["early", "late", "unscheduled"]);
    expect(buildDisplayedTasks(tasks, "dateAddedAsc").map((entry) => entry.id)).toEqual(["early", "unscheduled", "late"]);
    expect(buildDisplayedTasks(tasks, "dateAddedDesc").map((entry) => entry.id)).toEqual(["late", "unscheduled", "early"]);
  });

  it("falls back to custom order for date added sorting when legacy tasks have no created timestamp", () => {
    const tasks = [
      task({ id: "late", name: "Zulu", order: 3 }),
      task({ id: "early", name: "Bravo", order: 2 }),
      task({ id: "first", name: "Alpha", order: 1 }),
    ];

    expect(buildDisplayedTasks(tasks, "dateAddedAsc").map((entry) => entry.id)).toEqual(["first", "early", "late"]);
    expect(buildDisplayedTasks(tasks, "dateAddedDesc").map((entry) => entry.id)).toEqual(["late", "early", "first"]);
  });

  it("leaves the task list empty and runs post-render syncs when no tasks exist", () => {
    const harness = createHarness({ tasks: [], appPage: "dashboard" });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.innerHTML).toBe("");
    expect(harness.calls).toEqual(["tile-count:1", "sync-flips:", "dashboard", "sync-goal", "restore-goal-flow"]);
  });

  it("renders task cards into tile columns and preserves source indexes", () => {
    const harness = createHarness({ taskView: "tile", taskOrderBy: "alpha" });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.attributes.get("data-tile-columns")).toBe("2");
    expect(harness.taskListEl.children).toHaveLength(2);
    expect(harness.taskListEl.children[0]?.className).toBe("taskTileColumn");
    expect(harness.taskListEl.children[1]?.className).toBe("taskTileColumn");
    const firstColumnTask = harness.taskListEl.children[0]?.children[0];
    const secondColumnTask = harness.taskListEl.children[1]?.children[0];
    expect(firstColumnTask?.dataset.taskId).toBe("a");
    expect(firstColumnTask?.dataset.index).toBe("1");
    expect(firstColumnTask?.attributes.get("draggable")).toBe("false");
    expect(secondColumnTask?.dataset.taskId).toBe("b");
    expect(harness.calls).toContain("apply-flip:a");
    expect(harness.calls).toContain("apply-flip:b");
  });

  it("marks the task list as having a running task when any task is active", () => {
    const harness = createHarness({
      tasks: [task({ id: "running", running: true }), task({ id: "idle", running: false, order: 2 })],
    });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.classList.toggle).toHaveBeenCalledWith("hasRunningTask", true);
    expect(harness.taskListEl.className.split(/\s+/)).toContain("hasRunningTask");
  });

  it("clears the running-task list class when no tasks are active", () => {
    const harness = createHarness({
      tasks: [task({ id: "idle-1", running: false }), task({ id: "idle-2", running: false, order: 2 })],
    });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.classList.toggle).toHaveBeenCalledWith("hasRunningTask", false);
    expect(harness.taskListEl.className.split(/\s+/)).not.toContain("hasRunningTask");
  });

  it("preserves source indexes when task ids are duplicated", () => {
    const harness = createHarness({
      taskOrderBy: "custom",
      tasks: [
        task({ id: "duplicate", name: "First", order: 1 }),
        task({ id: "duplicate", name: "Second", order: 2 }),
      ],
    });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.children[0]?.dataset.taskId).toBe("duplicate");
    expect(harness.taskListEl.children[0]?.dataset.index).toBe("0");
    expect(harness.taskListEl.children[1]?.dataset.taskId).toBe("duplicate");
    expect(harness.taskListEl.children[1]?.dataset.index).toBe("1");
  });

  it("renders four tile columns when the responsive helper selects four", () => {
    const harness = createHarness({
      taskView: "tile",
      taskOrderBy: "custom",
      tileColumnCount: 4,
      tasks: [
        task({ id: "a", name: "Alpha", order: 1 }),
        task({ id: "b", name: "Bravo", order: 2 }),
        task({ id: "c", name: "Charlie", order: 3 }),
        task({ id: "d", name: "Delta", order: 4 }),
        task({ id: "e", name: "Echo", order: 5 }),
      ],
    });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.attributes.get("data-tile-columns")).toBe("4");
    expect(harness.taskListEl.children).toHaveLength(4);
    expect(harness.taskListEl.children.map((column) => column.className)).toEqual([
      "taskTileColumn",
      "taskTileColumn",
      "taskTileColumn",
      "taskTileColumn",
    ]);
    expect(harness.taskListEl.children.map((column) => column.children.map((child) => child.dataset.taskId))).toEqual([
      ["a", "e"],
      ["b"],
      ["c"],
      ["d"],
    ]);
    expect(harness.calls).toContain("tile-count:4");
  });

  it("promotes pinned history, clears stale history state, and schedules history rerender", () => {
    const harness = createHarness();
    harness.pinnedHistoryTaskIds.add("a");
    harness.openHistoryTaskIds.add("missing");
    harness.historyViewByTaskId.missing = { revealTimer: 42 };

    harness.renderer.renderTasksPage();
    while (harness.rafQueue.length) harness.rafQueue.shift()?.();

    expect(harness.openHistoryTaskIds.has("a")).toBe(true);
    expect(harness.openHistoryTaskIds.has("missing")).toBe(false);
    expect(harness.historyViewByTaskId.missing).toBeUndefined();
    expect(harness.calls).toContain("clear-timeout:42");
    expect(harness.calls.filter((call) => call === "render-history:a")).toHaveLength(2);
  });

  it("delegates inactive history capability cleanup with the active task ids", () => {
    const snapshots: string[][] = [];
    const harness = createHarness({
      pruneInactiveHistoryTasks: (activeTaskIds) => {
        snapshots.push(Array.from(activeTaskIds).sort());
        return true;
      },
    });

    harness.renderer.renderTasksPage();

    expect(snapshots).toEqual([["a", "b"]]);
  });

  it("reserves opening history drawer space before chart rendering", () => {
    const harness = createHarness();
    harness.openHistoryTaskIds.add("a");
    harness.openHistoryTaskIds.add("b");
    harness.historyViewByTaskId.a = { revealPhase: "openingSpace", revealTimer: 10 };
    harness.historyViewByTaskId.b = { revealPhase: "open", revealTimer: null };

    harness.renderer.renderTasksPage();
    while (harness.rafQueue.length) harness.rafQueue.shift()?.();

    const openingTask = harness.taskListEl.children[0];
    expect(openingTask?.dataset.taskId).toBe("a");
    expect(openingTask?.className).toContain("taskHistoryOpeningSpace");
    expect(openingTask?.innerHTML).toContain("historyInline historyInlineMotion isOpeningSpace");
    expect(openingTask?.innerHTML).toContain("historyCanvasWrap");
    expect(harness.calls.filter((call) => call === "render-history:a")).toHaveLength(0);
    expect(harness.calls.filter((call) => call === "render-history:b")).toHaveLength(2);
  });

  it("keeps inline history outside the flipping task faces", () => {
    const harness = createHarness();
    harness.openHistoryTaskIds.add("a");
    harness.historyViewByTaskId.a = { revealPhase: "open", revealTimer: null };

    harness.renderer.renderTasksPage();

    const renderedTask = harness.taskListEl.children[0];
    const historyIndex = renderedTask?.innerHTML.indexOf("historyInline historyInlineMotion");
    const backFaceIndex = renderedTask?.innerHTML.indexOf('class="taskFace taskFaceBack"');

    expect(historyIndex).toBeGreaterThan(0);
    expect(backFaceIndex).toBeGreaterThan(0);
    expect(historyIndex).toBeGreaterThan(backFaceIndex || 0);
  });

  it("waits to rerender opening history until the chart reveal phase is complete", () => {
    const harness = createHarness();
    harness.openHistoryTaskIds.add("a");
    harness.openHistoryTaskIds.add("b");
    harness.historyViewByTaskId.a = { revealPhase: "opening", revealTimer: 10 };
    harness.historyViewByTaskId.b = { revealPhase: "open", revealTimer: null };

    harness.renderer.renderTasksPage();
    while (harness.rafQueue.length) harness.rafQueue.shift()?.();

    const openingTask = harness.taskListEl.children[0];
    expect(openingTask?.dataset.taskId).toBe("a");
    expect(openingTask?.className).toContain("taskHistoryOpening");
    expect(openingTask?.innerHTML).toContain("historyInline historyInlineMotion isOpening");
    expect(harness.calls.filter((call) => call === "render-history:a")).toHaveLength(0);
    expect(harness.calls.filter((call) => call === "render-history:b")).toHaveLength(2);
  });

  it("renders current-period goal completion metadata without history as resettable", () => {
    const nowValue = Date.now();
    const harness = createHarness({
      tasks: [
        task({
          id: "task-1",
          name: "Focus",
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
          timeGoalCompletedAtMs: nowValue,
          timeGoalCompletedReason: "goal",
        }),
      ],
    });

    harness.renderer.renderTasksPage();

    const renderedTask = harness.taskListEl.children[0];
    expect(renderedTask?.className).toContain("taskCompleted");
    expect(renderedTask?.innerHTML).toContain('data-action="reset" title="Reset"');
    expect(renderedTask?.innerHTML).toContain("taskPrimaryAction taskPrimaryActionReset");
    expect(renderedTask?.innerHTML).not.toContain("Done until tomorrow");
  });

  it("renders current-period reset completion metadata as launchable", () => {
    const nowValue = Date.now();
    const harness = createHarness({
      tasks: [
        task({
          id: "task-1",
          name: "Focus",
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
          timeGoalCompletedAtMs: nowValue,
          timeGoalCompletedReason: "reset",
        }),
      ],
    });

    harness.renderer.renderTasksPage();

    const renderedTask = harness.taskListEl.children[0];
    expect(renderedTask?.className).not.toContain("taskCompleted");
    expect(renderedTask?.innerHTML).not.toContain("Done until tomorrow");
    expect(renderedTask?.innerHTML).toContain('data-action="start" title="Launch"');
    expect(renderedTask?.innerHTML).toContain("taskPrimaryAction taskPrimaryActionLaunch");
  });

  it("renders a held reset override as reset without first producing launch markup", () => {
    const harness = createHarness({
      tasks: [
        task({
          id: "task-1",
          name: "Focus",
          accumulatedMs: 0,
          running: false,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
        }),
      ],
    });

    try {
      setXpAwardButtonLabelOverride("task-1", "Reset");

      harness.renderer.renderTasksPage();

      const renderedTask = harness.taskListEl.children[0];
      expect(renderedTask?.className).toContain("taskCompleted");
      expect(renderedTask?.innerHTML).toContain('data-action="reset" title="Reset"');
      expect(renderedTask?.innerHTML).toContain("taskPrimaryAction taskPrimaryActionReset");
      expect(renderedTask?.innerHTML).not.toContain("taskPrimaryAction taskPrimaryActionLaunch");
      expect(renderedTask?.innerHTML).not.toContain('data-action="start" title="Launch"');
    } finally {
      clearXpAwardButtonLabelOverride("task-1");
    }
  });

  it("renders goal completion metadata with qualifying history as resettable", () => {
    const nowValue = Date.now();
    const harness = createHarness({
      tasks: [
        task({
          id: "task-1",
          name: "Focus",
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(nowValue),
          timeGoalCompletedAtMs: nowValue,
          timeGoalCompletedReason: "goal",
        }),
      ],
      historyByTaskId: {
        "task-1": [{ ts: nowValue, ms: 60 * 60 * 1000, name: "Focus" }],
      },
    });

    harness.renderer.renderTasksPage();

    const renderedTask = harness.taskListEl.children[0];
    expect(renderedTask?.className).toContain("taskCompleted");
    expect(renderedTask?.innerHTML).toContain('data-action="reset" title="Reset"');
    expect(renderedTask?.innerHTML).toContain("taskPrimaryAction taskPrimaryActionReset");
    expect(renderedTask?.innerHTML).not.toContain("Done until tomorrow");
  });

  it("renders an August 1, 2026 completed goal task as Completed on Sunday, August 2, 2026", () => {
    const completedAtMs = new Date(2026, 7, 1, 21, 0, 0).getTime();
    const originalDateNow = Date.now;
    Date.now = () => new Date(2026, 7, 2, 8, 0, 0).getTime();

    try {
      const harness = createHarness({
        tasks: [
          task({
            id: "task-1",
            name: "Focus",
            accumulatedMs: 60 * 60 * 1000,
            hasStarted: true,
            timeGoalEnabled: true,
            timeGoalPeriod: "day",
            timeGoalMinutes: 60,
            timeGoalCompletedDayKey: "2026-08-01",
            timeGoalCompletedAtMs: completedAtMs,
            timeGoalCompletedReason: "goal",
            timeGoalCompletedElapsedMs: 60 * 60 * 1000,
          }),
        ],
      });

      harness.renderer.renderTasksPage();

      const renderedTask = harness.taskListEl.children[0];
      expect(renderedTask?.className).toContain("taskCompleted");
      expect(renderedTask?.innerHTML).toContain('data-action="reset" title="Completed" aria-label="Completed" type="button" disabled');
      expect(renderedTask?.innerHTML).toContain("taskPrimaryAction taskPrimaryActionDone");
      expect(renderedTask?.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Completed</span>');
      expect(renderedTask?.innerHTML).not.toContain('data-action="start" title="Resume"');
    } finally {
      Date.now = originalDateNow;
    }
  });
});
