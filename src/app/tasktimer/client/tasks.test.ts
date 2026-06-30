import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import { createTaskTimerTasks } from "./tasks";

type TestEvent = {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  target?: {
    closest?: (selector: string) => { dataset?: Record<string, string>; getAttribute?: (name: string) => string | null } | null;
  };
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
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

function elementStub(tagName = "div") {
  const node = {
    tagName,
    className: "",
    innerHTML: "",
    dataset: {} as Record<string, string>,
    children: [] as unknown[],
    style: {} as Record<string, string>,
    classList: { add: vi.fn(), remove: vi.fn() },
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    appendChild: vi.fn((child: unknown) => {
      node.children.push(child);
      return child;
    }),
    contains: vi.fn(() => true),
  };
  return node;
}

function createHarness(overrides: { tasks?: Task[] } = {}) {
  const calls: string[] = [];
  const handlers = new Map<object, Map<string, (event: TestEvent) => void>>();
  let tasks = overrides.tasks || [task()];
  let confirmOk: (() => void) | null = null;
  const taskList = elementStub("section");

  vi.stubGlobal("document", {
    createElement: (tagName: string) => elementStub(tagName),
    getElementById: () => null,
  });
  vi.stubGlobal("window", {
    location: { protocol: "https:" },
    matchMedia: () => ({ matches: false }),
    clearTimeout: vi.fn(),
    dispatchEvent: vi.fn(),
    requestAnimationFrame: (handler: () => void) => {
      handler();
      return 1;
    },
    setTimeout: (handler: () => void) => {
      handler();
      return 1;
    },
  });

  const ctx = {
    els: {
      taskList,
      resetAllBtn: null,
      confirmOverlay: { classList: { add: vi.fn(), remove: vi.fn() } },
      confirmDeleteAll: { checked: false },
      taskManualEntryOverlay: null,
      taskManualEntryTitle: null,
      taskManualEntryMeta: null,
      taskManualDateTimeInput: null,
      taskManualDateTimeBtn: null,
      taskManualHoursInput: null,
      taskManualMinutesInput: null,
      taskManualNoteInput: null,
      taskManualEntryError: null,
      taskManualEntryCancelBtn: null,
      taskManualEntrySaveBtn: null,
      openAddTaskBtn: null,
    },
    sharedTasks: {
      milestoneUnitSec: () => 3600,
      milestoneUnitSuffix: () => "h",
    },
    on: vi.fn((target: object | null | undefined, type: string, handler: (event: TestEvent) => void) => {
      if (!target) return;
      const targetHandlers = handlers.get(target) || new Map<string, (event: TestEvent) => void>();
      targetHandlers.set(type, handler);
      handlers.set(target, targetHandlers);
    }),
    getTasks: () => tasks,
    setTasks: vi.fn((value: Task[]) => {
      calls.push(`setTasks:${value.length}`);
      tasks = value;
    }),
    getTaskView: () => "list",
    getTaskOrderBy: () => "custom",
    setCurrentTileColumnCount: vi.fn(),
    getOpenHistoryTaskIds: () => new Set<string>(),
    getPinnedHistoryTaskIds: () => new Set<string>(),
    getHistoryViewByTaskId: () => ({}),
    syncTaskFlipStatesForVisibleTasks: vi.fn(),
    applyTaskFlipDomState: vi.fn(),
    renderHistory: vi.fn(),
    getCurrentAppPage: () => "tasks",
    renderDashboardWidgets: vi.fn(),
    syncTimeGoalModalWithTaskState: vi.fn(),
    maybeRestorePendingTimeGoalFlow: vi.fn(),
    getElapsedMs: (task: Task) => Number(task.accumulatedMs || 0),
    getTaskElapsedMs: (task: Task) => Number(task.accumulatedMs || 0),
    sortMilestones: (value: Task["milestones"]) => value,
    checkpointRepeatActiveTaskId: () => null,
    activeCheckpointToastTaskId: () => null,
    hasEntitlement: () => true,
    isTaskSharedByOwner: () => false,
    getDynamicColorsEnabled: () => false,
    getModeColor: () => "#00ffff",
    fillBackgroundForPct: () => "",
    escapeHtmlUI: (value: unknown) => String(value ?? ""),
    formatMainTaskElapsedHtml: () => "0",
    confirm: vi.fn((_title: string, _text: string, options: { onOk: () => void }) => {
      calls.push("confirm");
      confirmOk = options.onOk;
    }),
    closeConfirm: vi.fn(() => calls.push("closeConfirm")),
    getDeletedTaskMeta: () => ({}),
    setDeletedTaskMeta: vi.fn(() => calls.push("setDeletedTaskMeta")),
    saveDeletedMeta: vi.fn(() => calls.push("saveDeletedMeta")),
    save: vi.fn(() => calls.push("save")),
    deleteSharedTaskSummariesForTask: vi.fn(async () => {}),
    refreshOwnSharedSummaries: vi.fn(async () => {}),
    getCurrentUid: () => "user-1",
    getGroupsFriendships: () => [],
    getFocusModeTaskId: () => null,
    closeFocusMode: vi.fn(),
    render: vi.fn(() => calls.push("render")),
    openHistoryInline: vi.fn(),
    openEdit: vi.fn(),
    openFocusMode: vi.fn(),
    deleteTask: vi.fn(),
    showActionConfirmation: vi.fn(),
    showUpgradePrompt: vi.fn(),
    openTaskExportModal: vi.fn(),
    openShareTaskModal: vi.fn(),
    setTaskFlipped: vi.fn(),
    refreshGroupsData: vi.fn(async () => {}),
    broadcastCheckpointAlertMute: vi.fn(),
    stopCheckpointRepeatAlert: vi.fn(),
    clearTaskTimeGoalFlow: vi.fn(),
    flushPendingFocusSessionNoteSave: vi.fn(),
    openRewardSessionSegment: vi.fn(),
    closeRewardSessionSegment: vi.fn(),
    clearRewardSessionTracker: vi.fn(),
    upsertLiveSession: vi.fn(),
    clearLiveSession: vi.fn(),
    finalizeLiveSession: vi.fn(),
    applyPendingTimeGoalXpForTask: vi.fn(),
    clearCheckpointBaseline: vi.fn(),
    resetCheckpointAlertTracking: vi.fn(),
    setCheckpointAutoResetDirty: vi.fn(),
    clearFocusSessionDraft: vi.fn(),
    syncFocusSessionNotesInput: vi.fn(),
    syncFocusSessionNotesAccordion: vi.fn(),
    getAutoFocusOnTaskLaunchEnabled: () => false,
    saveHistory: vi.fn(),
    setHistoryByTaskId: vi.fn(),
    getHistoryByTaskId: () => ({}),
    getRewardProgress: () => ({ totalXp: 0, weekly: {}, byTask: {}, lastAwardAt: null }),
    getWeekStarting: () => "2026-05-11",
    currentUid: () => "user-1",
    setResetTaskConfirmBusy: vi.fn(),
    captureResetActionSessionNote: () => "",
    setFocusSessionDraft: vi.fn(),
    syncSharedTaskSummariesForTask: vi.fn(async () => {}),
    syncSharedTaskSummariesForTasks: vi.fn(async () => {}),
  } as unknown as Parameters<typeof createTaskTimerTasks>[0];

  const api = createTaskTimerTasks(ctx);
  api.registerTaskEvents();

  return {
    calls,
    confirm: () => confirmOk?.(),
    clickTaskTopRow: () => {
      const taskEl = {
        dataset: { index: "0", taskId: "task-1" } as Record<string, string>,
      };
      const rowEl = {};
      handlers.get(taskList)?.get("click")?.({
        target: {
          closest: (selector: string) => {
            if (selector === ".task") return taskEl;
            if (selector === "[data-task-flip]") return null;
            if (selector === "[data-action]") return null;
            if (selector === ".row") return rowEl;
            if (selector === ".actions") return null;
            return null;
          },
        },
      });
      return taskEl;
    },
    clickArchive: () =>
      handlers.get(taskList)?.get("click")?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: {
          closest: (selector: string) => {
            if (selector === ".task") return { dataset: { index: "0", taskId: "task-1" } as Record<string, string> };
            if (selector === "[data-task-flip]") return null;
            if (selector === "[data-action]") return { getAttribute: () => "archive", dataset: { action: "archive" } as Record<string, string> };
            return null;
          },
        },
      }),
    clickReset: () =>
      handlers.get(taskList)?.get("click")?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: {
          closest: (selector: string) => {
            if (selector === ".task") return { dataset: { index: "0", taskId: "task-1" } as Record<string, string> };
            if (selector === "[data-task-flip]") return null;
            if (selector === "[data-action]") return { getAttribute: () => "reset", dataset: { action: "reset" } as Record<string, string> };
            return null;
          },
        },
      }),
    clickStart: () =>
      handlers.get(taskList)?.get("click")?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: {
          closest: (selector: string) => {
            if (selector === ".task") return { dataset: { index: "0", taskId: "task-1" } as Record<string, string> };
            if (selector === "[data-task-flip]") return null;
            if (selector === "[data-action]") return { getAttribute: () => "start", dataset: { action: "start" } as Record<string, string> };
            return null;
          },
        },
      }),
    clickTaskFlip: (direction: "open" | "close") => {
      const taskEl = { dataset: { index: "0", taskId: "task-1" } as Record<string, string> };
      const flipBtn = { getAttribute: (name: string) => (name === "data-task-flip" ? direction : null) };
      handlers.get(taskList)?.get("click")?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        target: {
          closest: (selector: string) => {
            if (selector === ".task") return taskEl;
            if (selector === "[data-task-flip]") return flipBtn;
            if (selector === "[data-action]") return null;
            return null;
          },
        },
      });
      return taskEl;
    },
    ctx,
    getTasks: () => tasks,
  };
}

describe("createTaskTimerTasks", () => {
  it("refreshes the task list after archiving the last task", () => {
    const harness = createHarness();

    harness.clickArchive();
    harness.confirm();

    expect(harness.getTasks()).toEqual([]);
    expect(harness.calls).toEqual([
      "confirm",
      "setTasks:0",
      "setDeletedTaskMeta",
      "saveDeletedMeta",
      "save",
      "render",
      "closeConfirm",
    ]);
  });

  it("opens focus mode with the clicked task card as transition source for direct card clicks", () => {
    const harness = createHarness();

    const taskEl = harness.clickTaskTopRow();

    expect(harness.ctx.openFocusMode).toHaveBeenCalledWith(0, { sourceElement: taskEl });
  });

  it("leaves a flipped task card open after delegated menu actions", () => {
    const harness = createHarness();

    harness.clickStart();

    expect(harness.ctx.setTaskFlipped).not.toHaveBeenCalled();
    expect(harness.getTasks()[0]?.running).toBe(true);
  });

  it("updates task card flip state only from explicit flip controls", () => {
    const harness = createHarness();

    const openedTaskEl = harness.clickTaskFlip("open");
    const closedTaskEl = harness.clickTaskFlip("close");

    expect(harness.ctx.setTaskFlipped).toHaveBeenNthCalledWith(1, "task-1", true, openedTaskEl);
    expect(harness.ctx.setTaskFlipped).toHaveBeenNthCalledWith(2, "task-1", false, closedTaskEl);
  });

  it("resumes a stopped task from the delegated task-card start action without clearing elapsed time", () => {
    const harness = createHarness({
      tasks: [task({ accumulatedMs: 60_000, hasStarted: true, resumePendingSinceDayKey: "2026-05-03" })],
    });

    harness.clickStart();

    expect(harness.getTasks()[0]).toMatchObject({
      accumulatedMs: 60_000,
      running: true,
      hasStarted: true,
      resumePendingSinceDayKey: null,
    });
    expect(harness.ctx.upsertLiveSession).toHaveBeenCalledWith(
      harness.getTasks()[0],
      expect.objectContaining({ elapsedMs: 60_000, resumedFromMs: 60_000, forceCloudFlush: true, reason: "start" })
    );
    expect(harness.calls).toContain("save");
    expect(harness.calls).toContain("render");
  });

  it("resets a stopped task from the delegated task-card reset action", async () => {
    const harness = createHarness({ tasks: [task({ accumulatedMs: 60_000, hasStarted: true })] });

    harness.clickReset();
    await harness.confirm();

    expect(harness.getTasks()[0]).toMatchObject({
      accumulatedMs: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
    });
    expect(harness.calls).toContain("confirm");
    expect(harness.calls).toContain("save");
    expect(harness.calls).toContain("render");
    expect(harness.calls).toContain("closeConfirm");
  });

  it("resets a stopped completed task from the delegated task-card reset action", async () => {
    const completedAtMs = Date.now();
    const harness = createHarness({
      tasks: [
        task({
          accumulatedMs: 60 * 60 * 1000,
          hasStarted: true,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(completedAtMs),
          timeGoalCompletedAtMs: completedAtMs,
          timeGoalCompletedReason: "goal",
          timeGoalCompletedElapsedMs: 60 * 60 * 1000,
        }),
      ],
    });

    harness.clickReset();
    await harness.confirm();

    expect(harness.getTasks()[0]).toMatchObject({
      accumulatedMs: 0,
      running: false,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
      timeGoalCompletedDayKey: null,
      timeGoalCompletedWeekKey: null,
      timeGoalCompletedAtMs: null,
      timeGoalCompletedReason: null,
      timeGoalCompletedElapsedMs: null,
    });
    expect(harness.calls).toContain("confirm");
    expect(harness.calls).toContain("save");
    expect(harness.calls).toContain("render");
    expect(harness.calls).toContain("closeConfirm");
  });
});
