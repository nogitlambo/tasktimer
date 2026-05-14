import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
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

function createHarness() {
  const calls: string[] = [];
  const handlers = new Map<object, Map<string, (event: TestEvent) => void>>();
  let tasks = [task()];
  let confirmOk: (() => void) | null = null;
  const taskList = elementStub("section");

  vi.stubGlobal("document", {
    createElement: (tagName: string) => elementStub(tagName),
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({ matches: false }),
    clearTimeout: vi.fn(),
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
      taskManualEntryDifficultyGroup: null,
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
    getElapsedMs: () => 0,
    getTaskElapsedMs: () => 0,
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
    getFocusModeTaskId: () => null,
    closeFocusMode: vi.fn(),
    render: vi.fn(() => calls.push("render")),
    openHistoryInline: vi.fn(),
    openEdit: vi.fn(),
    openFocusMode: vi.fn(),
    deleteTask: vi.fn(),
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
    finalizeLiveSession: vi.fn(),
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
    syncSharedTaskSummariesForTask: vi.fn(),
    syncSharedTaskSummariesForTasks: vi.fn(async () => {}),
  } as unknown as Parameters<typeof createTaskTimerTasks>[0];

  const api = createTaskTimerTasks(ctx);
  api.registerTaskEvents();

  return {
    calls,
    confirm: () => confirmOk?.(),
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
    expect((harness.ctx.els.taskList as HTMLElement).innerHTML).toContain("No Tasks found");
  });
});
