import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { buildDisplayedTasks, createTaskListRenderer } from "./task-list-renderer";

type StubElement = {
  tagName: string;
  className: string;
  innerHTML: string;
  dataset: Record<string, string>;
  children: StubElement[];
  attributes: Map<string, string>;
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

function createHarness(overrides: Partial<{ tasks: Task[]; taskView: "list" | "tile"; taskOrderBy: "custom" | "alpha" | "schedule"; appPage: string; tileColumnCount: number }> = {}) {
  const taskListEl = elementStub("section");
  const openHistoryTaskIds = new Set<string>();
  const pinnedHistoryTaskIds = new Set<string>();
  const historyViewByTaskId: Record<string, { revealPhase?: "opening" | "closing" | "open" | null; revealTimer?: number | null }> = {};
  const calls: string[] = [];
  const rafQueue: Array<() => void> = [];
  const tasks = overrides.tasks ?? [task({ id: "b", name: "Bravo", order: 2 }), task({ id: "a", name: "Alpha", order: 1 })];
  const renderer = createTaskListRenderer({
    taskListEl: taskListEl as unknown as HTMLElement,
    documentRef: {
      createElement: (tagName: string) => elementStub(tagName) as unknown as HTMLElement,
    },
    getTasks: () => tasks,
    getTaskView: () => overrides.taskView ?? "list",
    getTaskOrderBy: () => overrides.taskOrderBy ?? "custom",
    getTileColumnCount: () => overrides.tileColumnCount ?? 2,
    setCurrentTileColumnCount: (value) => calls.push(`tile-count:${value}`),
    getOpenHistoryTaskIds: () => openHistoryTaskIds,
    getPinnedHistoryTaskIds: () => pinnedHistoryTaskIds,
    getHistoryViewByTaskId: () => historyViewByTaskId,
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
    activeCheckpointToastTaskId: () => null,
    canUseAdvancedHistory: () => true,
    canUseSocialFeatures: () => true,
    isTaskSharedByOwner: () => false,
    getDynamicColorsEnabled: () => false,
    getModeColor: () => "#00ffff",
    fillBackgroundForPct: (pct) => `pct-${pct}`,
    escapeHtml: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    formatMainTaskElapsedHtml: (elapsedMs) => `${elapsedMs}ms`,
  });
  return { renderer, taskListEl, openHistoryTaskIds, pinnedHistoryTaskIds, historyViewByTaskId, calls, rafQueue };
}

describe("task list renderer", () => {
  it("sorts displayed tasks by custom, alpha, and schedule order", () => {
    const tasks = [
      task({ id: "late", name: "Zulu", order: 3, plannedStartByDay: { mon: "14:00" } }),
      task({ id: "early", name: "Bravo", order: 2, plannedStartByDay: { mon: "08:00" } }),
      task({ id: "unscheduled", name: "Alpha", order: 1 }),
    ];

    expect(buildDisplayedTasks(tasks, "custom").map((entry) => entry.id)).toEqual(["unscheduled", "early", "late"]);
    expect(buildDisplayedTasks(tasks, "alpha").map((entry) => entry.id)).toEqual(["unscheduled", "early", "late"]);
    expect(buildDisplayedTasks(tasks, "schedule").map((entry) => entry.id)).toEqual(["early", "late", "unscheduled"]);
  });

  it("renders the empty state and runs post-render syncs", () => {
    const harness = createHarness({ tasks: [], appPage: "dashboard" });

    harness.renderer.renderTasksPage();

    expect(harness.taskListEl.innerHTML).toContain("No Tasks found");
    expect(harness.taskListEl.innerHTML).toContain('data-action="openAddTask"');
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
});
