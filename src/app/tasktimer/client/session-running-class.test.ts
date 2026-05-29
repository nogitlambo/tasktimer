import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import type { TaskTimerSessionContext } from "./context";
import type { TaskTimerRuntime } from "./runtime";
import type { TaskTimerSharedTaskApi } from "./task-shared";
import { createTaskTimerSession } from "./session";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function createClassList(initial: string[] = []) {
  const values = new Set(initial);
  return {
    add: (...names: string[]) => names.forEach((name) => values.add(name)),
    remove: (...names: string[]) => names.forEach((name) => values.delete(name)),
    toggle(name: string, force?: boolean) {
      const shouldHave = force == null ? !values.has(name) : !!force;
      if (shouldHave) values.add(name);
      else values.delete(name);
      return shouldHave;
    },
    contains(name: string) {
      return values.has(name);
    },
  };
}

function createStyleStub() {
  const values = new Map<string, string>();
  return {
    values,
    setProperty: (name: string, value: string) => {
      values.set(name, value);
    },
  };
}

function createFocusElementStub(options: { clientWidth?: number; clientHeight?: number } = {}) {
  return {
    classList: createClassList(),
    style: createStyleStub(),
    dataset: {},
    textContent: "",
    innerHTML: "",
    offsetWidth: 0,
    clientWidth: options.clientWidth ?? 0,
    clientHeight: options.clientHeight ?? 0,
    setAttribute: vi.fn(),
    closest: vi.fn(() => null),
    querySelector: vi.fn(() => null),
  };
}

function createCompletionHarness(options?: {
  activeToastTaskId?: string | null;
  queuedToastTaskIds?: string[];
  withCheckpoint?: boolean;
  focusModeTaskId?: string | null;
  timeGoalModalTaskId?: string | null;
}) {
  const completedTask = task({
    id: "task-1",
    name: "Focus",
    accumulatedMs: 120_000,
    running: true,
    milestonesEnabled: !!options?.withCheckpoint,
    milestoneTimeUnit: "minute",
    milestones: options?.withCheckpoint ? [{ hours: 0.5, description: "Halfway" }] : [],
    checkpointToastEnabled: true,
    timeGoalEnabled: true,
    timeGoalMinutes: 1,
    timeGoalPeriod: "day",
  });
  const checkpointToastQueue = (options?.queuedToastTaskIds || []).map((taskId, index) => ({
    id: `queued-${index}`,
    title: "Queued",
    text: "Queued",
    autoCloseMs: 5000,
    autoCloseAtMs: null,
    taskId,
  }));
  let activeCheckpointToast = options?.activeToastTaskId
    ? {
        id: "active-toast",
        title: "Active",
        text: "Active",
        autoCloseMs: 5000,
        autoCloseAtMs: Date.now() + 5000,
        taskId: options.activeToastTaskId,
      }
    : null;
  let checkpointToastAutoCloseTimer: number | null = options?.activeToastTaskId ? 7 : null;
  let timeGoalModalTaskId: string | null = options?.timeGoalModalTaskId ?? null;
  let timeGoalModalFrozenElapsedMs = timeGoalModalTaskId ? 60_000 : 0;
  let focusModeTaskId: string | null = options?.focusModeTaskId ?? null;
  let focusModeTaskName = focusModeTaskId ? "Focus" : "";
  let focusShowCheckpoints = true;
  const checkpointBaselineSecByTaskId: Record<string, number> = { "task-1": 0 };
  const checkpointFiredKeysByTaskId: Record<string, Set<string>> = {};
  const clearTimeout = vi.fn();
  const openOverlay = vi.fn();
  const closeOverlay = vi.fn();
  const render = vi.fn();
  const toastHost = createFocusElementStub();
  const focusModeScreen = createFocusElementStub();
  focusModeScreen.style = { ...focusModeScreen.style, display: "block" };
  const timeGoalCompleteOverlay = {
    dataset: {},
    style: { display: "none" },
    getAttribute: () => null,
  };
  const timeGoalCompleteCloseBtn = createFocusElementStub();
  const handlers = new Map<string, (event?: Event) => unknown>();
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  const windowStub = {
    requestAnimationFrame: vi.fn(() => 1),
    setTimeout: vi.fn(() => 1),
    clearTimeout,
    localStorage: {
      setItem: vi.fn(),
      getItem: vi.fn(() => null),
      removeItem: vi.fn(),
    },
    matchMedia: vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    dispatchEvent: vi.fn(),
  };
  const documentStub = {
    activeElement: null,
    documentElement: { clientWidth: 390, clientHeight: 844 },
    querySelectorAll: vi.fn(() => []),
    body: {
      classList: createClassList(focusModeTaskId ? ["isFocusModeOpen"] : []),
    },
  };
  (globalThis as { window?: unknown }).window = windowStub;
  (globalThis as { document?: unknown }).document = documentStub;

  const session = createTaskTimerSession({
    els: {
      taskList: null,
      focusTaskName: null,
      focusModeScreen: focusModeScreen as unknown as HTMLElement,
      checkpointToastHost: toastHost as unknown as HTMLElement,
      timeGoalCompleteOverlay: timeGoalCompleteOverlay as unknown as HTMLElement,
      timeGoalCompleteTitle: createFocusElementStub() as unknown as HTMLElement,
      timeGoalCompleteText: createFocusElementStub() as unknown as HTMLElement,
      timeGoalCompleteMeta: createFocusElementStub() as unknown as HTMLElement,
      timeGoalCompleteCloseBtn: timeGoalCompleteCloseBtn as unknown as HTMLButtonElement,
      timeGoalCompleteLaunchNextBtn: null,
      timeGoalCompleteNextTasks: null,
      timeGoalCompleteNextTaskGrid: null,
      timeGoalCompleteConfettiStage: null,
      timeGoalCompleteNoteInput: null,
    },
    runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
    storageKeys: {
      FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      TIME_GOAL_PENDING_FLOW_KEY: "tasktimer:time-goal",
    },
    sharedTasks: { milestoneUnitSec: () => 60 } as unknown as TaskTimerSharedTaskApi,
    getTasks: () => [completedTask],
    getHistoryByTaskId: () => ({}),
    getCheckpointToastQueue: () => checkpointToastQueue,
    getActiveCheckpointToast: () => activeCheckpointToast,
    setActiveCheckpointToast: (value: typeof activeCheckpointToast) => {
      activeCheckpointToast = value;
    },
    getCheckpointToastAutoCloseTimer: () => checkpointToastAutoCloseTimer,
    setCheckpointToastAutoCloseTimer: (value: number | null) => {
      checkpointToastAutoCloseTimer = value;
    },
    getCheckpointBaselineSecByTaskId: () => checkpointBaselineSecByTaskId,
    getCheckpointFiredKeysByTaskId: () => checkpointFiredKeysByTaskId,
    getCheckpointAutoResetDirty: () => false,
    setCheckpointAutoResetDirty: () => {},
    getFocusModeTaskId: () => focusModeTaskId,
    setFocusModeTaskId: (value: string | null) => {
      focusModeTaskId = value;
    },
    getFocusModeTaskName: () => focusModeTaskName,
    setFocusModeTaskName: (value: string) => {
      focusModeTaskName = value;
    },
    getCurrentAppPage: () => "tasks",
    renderDashboardLiveWidgets: () => {},
    render,
    save: () => {},
    syncRewardSessionTrackerForTask: () => {},
    syncLiveSessionForTask: () => {},
    formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
    getDynamicColorsEnabled: () => false,
    fillBackgroundForPct: () => "#00ffff",
    getModeColor: () => "#00ffff",
    sortMilestones: (milestones: Task["milestones"]) => milestones,
    getCheckpointAlertSoundEnabled: () => false,
    getCheckpointAlertToastEnabled: () => true,
    getCheckpointAlertSoundMode: () => "once",
    getCheckpointAlertToastMode: () => "auto5s",
    getCheckpointRepeatStopAtMs: () => 0,
    setCheckpointRepeatStopAtMs: () => {},
    getCheckpointRepeatCycleTimer: () => null,
    setCheckpointRepeatCycleTimer: () => {},
    setCheckpointRepeatActiveTaskId: () => {},
    getCheckpointRepeatActiveTaskId: () => null,
    getCheckpointToastCountdownRefreshTimer: () => null,
    setCheckpointToastCountdownRefreshTimer: () => {},
    getCheckpointBeepAudio: () => null,
    setCheckpointBeepAudio: () => {},
    getCheckpointBeepQueueCount: () => 0,
    setCheckpointBeepQueueCount: () => {},
    getCheckpointBeepQueueTimer: () => null,
    setCheckpointBeepQueueTimer: () => {},
    broadcastCheckpointAlertMute: () => {},
    hasEntitlement: () => false,
    on: (target: unknown, eventName: string, handler: (event?: Event) => unknown) => {
      if (target === timeGoalCompleteCloseBtn && eventName === "click") handlers.set("timeGoalCompleteCloseBtn:click", handler);
    },
    openOverlay,
    closeOverlay,
    navigateToAppRoute: () => {},
    normalizedPathname: () => "/tasklaunch",
    savePendingTaskJump: () => {},
    jumpToTaskById: () => {},
    escapeHtmlUI: (value: unknown) => String(value),
    formatTime: (value: number) => String(value),
    formatMainTaskElapsed: (elapsedMs: number) => `${elapsedMs}ms`,
    normalizeHistoryTimestampMs: () => 0,
    getHistoryEntryNote: () => "",
    syncSharedTaskSummariesForTask: async () => {},
    syncSharedTaskSummariesForTasks: async () => {},
    startTask: () => {},
    stopTask: () => {},
    resetTask: () => {},
    resetTaskStateImmediate: () => {},
    clearFocusSessionDraft: () => {},
    setFocusSessionDraft: () => {},
    syncFocusSessionNotesInput: () => {},
    syncFocusSessionNotesAccordion: () => {},
    getFocusSessionNotesByTaskId: () => ({}),
    setFocusSessionNotesByTaskId: () => {},
    getFocusSessionNoteSaveTimer: () => null,
    setFocusSessionNoteSaveTimer: () => {},
    getDeferredFocusModeTimeGoalModals: () => [],
    setDeferredFocusModeTimeGoalModals: () => {},
    getTimeGoalModalTaskId: () => timeGoalModalTaskId,
    setTimeGoalModalTaskId: (value: string | null) => {
      timeGoalModalTaskId = value;
    },
    getTimeGoalModalFrozenElapsedMs: () => timeGoalModalFrozenElapsedMs,
    setTimeGoalModalFrozenElapsedMs: (value: number) => {
      timeGoalModalFrozenElapsedMs = value;
    },
    getLiveSessionsByTaskId: () => ({}),
    getTaskTimeGoalAction: () => "confirmModal",
    getFocusShowCheckpoints: () => false,
    setFocusShowCheckpoints: (value: boolean) => {
      focusShowCheckpoints = value;
    },
    setFocusCheckpointSig: () => {},
    getInteractionHapticsEnabled: () => false,
    getInteractionHapticsIntensity: () => "medium",
    getOptimalProductivityStartTime: () => "09:00",
    getOptimalProductivityEndTime: () => "17:00",
    getOptimalProductivityDays: () => ({ mon: true, tue: true, thu: true, fri: true, sat: false, sun: false }),
    renderDashboardWidgets: () => {},
    getTimeGoalReminderAtMsByTaskId: () => ({}),
    getRewardProgress: () => ({}),
    getWeekStarting: () => "mon",
    getAchievementSoundsEnabled: () => false,
  } as unknown as TaskTimerSessionContext);

  return {
    session,
    completedTask,
    checkpointToastQueue,
    clearTimeout,
    openOverlay,
    restoreWindow: () => {
      (globalThis as { window?: unknown }).window = previousWindow;
      (globalThis as { document?: unknown }).document = previousDocument;
    },
    getActiveCheckpointToast: () => activeCheckpointToast,
    getCheckpointToastAutoCloseTimer: () => checkpointToastAutoCloseTimer,
    getFocusModeTaskId: () => focusModeTaskId,
    getFocusModeTaskName: () => focusModeTaskName,
    getFocusShowCheckpoints: () => focusShowCheckpoints,
    closeOverlay,
    triggerTimeGoalCompleteClose: async () => {
      const handler = handlers.get("timeGoalCompleteCloseBtn:click");
      if (!handler) throw new Error("timeGoalCompleteCloseBtn click handler was not registered");
      await handler(new Event("click"));
    },
  };
}

describe("task timer session tick", () => {
  it("suppresses checkpoint toasts for the task when completion opens", () => {
    const harness = createCompletionHarness({ withCheckpoint: true });

    try {
      harness.session.tick();

      expect(harness.openOverlay).toHaveBeenCalled();
      expect(harness.completedTask.running).toBe(false);
      expect(harness.getActiveCheckpointToast()).toBeNull();
      expect(harness.checkpointToastQueue).toEqual([]);
      expect(harness.getCheckpointToastAutoCloseTimer()).toBeNull();
      expect(harness.clearTimeout).toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not clear checkpoint toasts for unrelated tasks when completion opens", () => {
    const harness = createCompletionHarness({
      activeToastTaskId: "task-2",
      queuedToastTaskIds: ["task-2"],
    });

    try {
      harness.session.tick();

      expect(harness.openOverlay).toHaveBeenCalled();
      expect(harness.getActiveCheckpointToast()?.taskId).toBe("task-2");
      expect(harness.checkpointToastQueue.map((toast) => toast.taskId)).toEqual(["task-2"]);
      expect(harness.getCheckpointToastAutoCloseTimer()).toBe(7);
      expect(harness.clearTimeout).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("exits Focus Mode after closing the active task completion modal", async () => {
    const harness = createCompletionHarness({
      focusModeTaskId: "task-1",
      timeGoalModalTaskId: "task-1",
    });

    try {
      harness.session.registerSessionEvents();

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.getFocusModeTaskId()).toBeNull();
      expect(harness.getFocusModeTaskName()).toBe("");
      expect(harness.getFocusShowCheckpoints()).toBe(true);
      expect(harness.closeOverlay).toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not exit Focus Mode after closing a different task completion modal", async () => {
    const harness = createCompletionHarness({
      focusModeTaskId: "task-2",
      timeGoalModalTaskId: "task-1",
    });

    try {
      harness.session.registerSessionEvents();

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.getFocusModeTaskId()).toBe("task-2");
      expect(harness.getFocusModeTaskName()).toBe("Focus");
      expect(harness.closeOverlay).toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("syncs the running task class during live updates without a full refresh", () => {
    const activeTask = task({
      running: true,
      startMs: 1_000,
      hasStarted: true,
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-accent small",
      dataset: { action: "start" },
      title: "Launch",
      disabled: false,
      textContent: "Launch",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const resetBtn = {
      disabled: false,
      title: "",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const progressFill = { style: { width: "", background: "" } } as HTMLElement;
    const taskNode = {
      dataset: { index: "0", taskId: "task-1" },
      classList: createClassList(["task"]),
      querySelector: (selector: string) => {
        if (selector === ".time") return timeEl;
        if (selector === ".progressFill") return progressFill;
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"]') return primaryActionBtn;
        if (selector === '.actions > .iconBtn[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      querySelectorAll: (selector: string) => (selector === ".task" ? [taskNode] : []),
    } as unknown as HTMLElement;

    const previousWindow = (globalThis as { window?: unknown }).window;
    const windowStub = {
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      setTimeout: vi.fn(() => 1),
    };
    (globalThis as { window?: unknown }).window = windowStub;

    const session = createTaskTimerSession({
      els: {
        taskList: taskListEl,
        focusTaskName: null,
      },
      runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
      storageKeys: {
        FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      },
      sharedTasks: {
        milestoneUnitSec: () => 3600,
      } as unknown as TaskTimerSharedTaskApi,
      getTasks: () => [activeTask],
      getCheckpointRepeatActiveTaskId: () => null,
      getHistoryByTaskId: () => ({}),
      getCheckpointToastQueue: () => [],
      getActiveCheckpointToast: () => null,
      setActiveCheckpointToast: () => {},
      getCheckpointAutoResetDirty: () => false,
      setCheckpointAutoResetDirty: () => {},
      getFocusModeTaskId: () => null,
      getFocusModeTaskName: () => null,
      getCurrentAppPage: () => "tasks",
      renderDashboardLiveWidgets: () => {},
      render: () => {},
      save: () => {},
      syncRewardSessionTrackerForTask: () => {},
      syncLiveSessionForTask: () => {},
      formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
      getDynamicColorsEnabled: () => false,
      fillBackgroundForPct: () => "#00ffff",
      getModeColor: () => "#00ffff",
      sortMilestones: (milestones: Task["milestones"]) => milestones,
      getCheckpointBaselineSecByTaskId: () => ({}),
      getCheckpointFiredKeysByTaskId: () => ({}),
      getCheckpointAlertSoundEnabled: () => false,
      getCheckpointAlertToastEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointAlertToastMode: () => "auto5s",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
      getCheckpointToastAutoCloseTimer: () => null,
      setCheckpointToastAutoCloseTimer: () => {},
      getCheckpointToastCountdownRefreshTimer: () => null,
      setCheckpointToastCountdownRefreshTimer: () => {},
      getCheckpointBeepAudio: () => null,
      setCheckpointBeepAudio: () => {},
      getCheckpointBeepQueueCount: () => 0,
      setCheckpointBeepQueueCount: () => {},
      getCheckpointBeepQueueTimer: () => null,
      setCheckpointBeepQueueTimer: () => {},
      broadcastCheckpointAlertMute: () => {},
      hasEntitlement: () => false,
      on: () => {},
      openOverlay: () => {},
      closeOverlay: () => {},
      navigateToAppRoute: () => {},
      normalizedPathname: () => "/tasklaunch",
      savePendingTaskJump: () => {},
      jumpToTaskById: () => {},
      escapeHtmlUI: (value: unknown) => String(value),
      formatTime: (value: number) => String(value),
      formatMainTaskElapsed: (elapsedMs: number) => `${elapsedMs}ms`,
      normalizeHistoryTimestampMs: () => 0,
      getHistoryEntryNote: () => "",
      syncSharedTaskSummariesForTask: async () => {},
      startTask: () => {},
      stopTask: () => {},
      resetTask: () => {},
      resetTaskStateImmediate: () => {},
      clearFocusSessionDraft: () => {},
      setFocusSessionDraft: () => {},
      syncFocusSessionNotesInput: () => {},
      syncFocusSessionNotesAccordion: () => {},
      getFocusSessionNotesByTaskId: () => ({}),
      setFocusSessionNotesByTaskId: () => {},
      getFocusSessionNoteSaveTimer: () => null,
      setFocusSessionNoteSaveTimer: () => {},
      getDeferredFocusModeTimeGoalModals: () => [],
      getTimeGoalModalTaskId: () => null,
      setTimeGoalModalTaskId: () => {},
      getLiveSessionsByTaskId: () => ({}),
      getTaskTimeGoalAction: () => "confirmModal",
      setDeferredFocusModeTimeGoalModals: () => {},
      getFocusShowCheckpoints: () => false,
      setFocusShowCheckpoints: () => {},
      setFocusCheckpointSig: () => {},
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(taskNode.classList.contains("taskRunning")).toBe(true);
    expect(primaryActionBtn.className).toBe("btn btn-warn small");
    expect(primaryActionBtn.dataset.action).toBe("stop");

    expect(windowStub.requestAnimationFrame).toHaveBeenCalled();
    expect(windowStub.setTimeout).toHaveBeenCalled();
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("syncs Focus Mode dial progress state for a task with a time goal", () => {
    const activeTask = task({
      accumulatedMs: 30_000,
      timeGoalEnabled: true,
      timeGoalMinutes: 1,
    });
    const focusDial = createFocusElementStub();
    const progressPath = { setAttribute: vi.fn() };
    focusDial.querySelector = vi.fn(() => progressPath);
    let focusCheckpointSig = "";
    const previousWindow = (globalThis as { window?: unknown }).window;
    const windowStub = {
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      setTimeout: vi.fn(() => 1),
    };
    (globalThis as { window?: unknown }).window = windowStub;

    const session = createTaskTimerSession({
      els: {
        taskList: null,
        focusTaskName: createFocusElementStub(),
        focusTimerDays: createFocusElementStub(),
        focusTimerClock: createFocusElementStub(),
        focusDialHint: createFocusElementStub(),
        focusDial: focusDial as unknown as HTMLButtonElement,
        focusCheckpointRing: null,
        focusCheckpointLogList: null,
        focusCheckpointLogEmpty: null,
      },
      runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
      storageKeys: {
        FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      },
      sharedTasks: { milestoneUnitSec: () => 60, milestoneUnitSuffix: () => "m" } as unknown as TaskTimerSharedTaskApi,
      getTasks: () => [activeTask],
      getFocusModeTaskId: () => "task-1",
      getFocusModeTaskName: () => "Focus",
      getHistoryByTaskId: () => ({}),
      getCheckpointRepeatActiveTaskId: () => null,
      getCheckpointToastQueue: () => [],
      getActiveCheckpointToast: () => null,
      setActiveCheckpointToast: () => {},
      getCheckpointAutoResetDirty: () => false,
      setCheckpointAutoResetDirty: () => {},
      getCurrentAppPage: () => "tasks",
      renderDashboardLiveWidgets: () => {},
      render: () => {},
      save: () => {},
      syncRewardSessionTrackerForTask: () => {},
      syncLiveSessionForTask: () => {},
      formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
      getDynamicColorsEnabled: () => false,
      fillBackgroundForPct: (pct: number) => `pct-${pct}`,
      getModeColor: () => "#00ffff",
      sortMilestones: (milestones: Task["milestones"]) => milestones,
      getCheckpointBaselineSecByTaskId: () => ({}),
      getCheckpointFiredKeysByTaskId: () => ({}),
      getCheckpointAlertSoundEnabled: () => false,
      getCheckpointAlertToastEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointAlertToastMode: () => "auto5s",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
      getCheckpointToastAutoCloseTimer: () => null,
      setCheckpointToastAutoCloseTimer: () => {},
      getCheckpointToastCountdownRefreshTimer: () => null,
      setCheckpointToastCountdownRefreshTimer: () => {},
      getCheckpointBeepAudio: () => null,
      setCheckpointBeepAudio: () => {},
      getCheckpointBeepQueueCount: () => 0,
      setCheckpointBeepQueueCount: () => {},
      getCheckpointBeepQueueTimer: () => null,
      setCheckpointBeepQueueTimer: () => {},
      broadcastCheckpointAlertMute: () => {},
      hasEntitlement: () => false,
      on: () => {},
      openOverlay: () => {},
      closeOverlay: () => {},
      navigateToAppRoute: () => {},
      normalizedPathname: () => "/tasklaunch",
      savePendingTaskJump: () => {},
      jumpToTaskById: () => {},
      escapeHtmlUI: (value: unknown) => String(value),
      formatTime: (value: number) => String(value),
      formatMainTaskElapsed: (elapsedMs: number) => `${elapsedMs}ms`,
      normalizeHistoryTimestampMs: () => 0,
      getHistoryEntryNote: () => "",
      syncSharedTaskSummariesForTask: async () => {},
      syncSharedTaskSummariesForTasks: async () => {},
      startTask: () => {},
      stopTask: () => {},
      resetTask: () => {},
      resetTaskStateImmediate: () => {},
      clearFocusSessionDraft: () => {},
      setFocusSessionDraft: () => {},
      syncFocusSessionNotesInput: () => {},
      syncFocusSessionNotesAccordion: () => {},
      getFocusSessionNotesByTaskId: () => ({}),
      setFocusSessionNotesByTaskId: () => {},
      getFocusSessionNoteSaveTimer: () => null,
      setFocusSessionNoteSaveTimer: () => {},
      getDeferredFocusModeTimeGoalModals: () => [],
      getTimeGoalModalTaskId: () => null,
      setTimeGoalModalTaskId: () => {},
      getLiveSessionsByTaskId: () => ({}),
      getTaskTimeGoalAction: () => "confirmModal",
      setDeferredFocusModeTimeGoalModals: () => {},
      getFocusShowCheckpoints: () => false,
      setFocusShowCheckpoints: () => {},
      getFocusCheckpointSig: () => focusCheckpointSig,
      setFocusCheckpointSig: (value: string) => {
        focusCheckpointSig = value;
      },
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(focusDial.classList.contains("hasTimeGoal")).toBe(true);
    expect(focusDial.classList.contains("hasProgress")).toBe(true);
    expect(focusDial.style.values.get("--focus-progress")).toBe("50%");
    expect(focusDial.style.values.get("--focus-progress-value")).toBe("50");
    expect(focusDial.style.values.get("--focus-progress-angle")).toBe("180deg");
    expect(focusDial.style.values.get("--focus-progress-color")).toBe("pct-50");
    expect(progressPath.setAttribute).toHaveBeenCalledWith("d", "M 50 9 A 41 41 0 0 1 50.000 91.000");
    expect(focusDial.setAttribute).toHaveBeenCalledWith("aria-pressed", "false");
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("syncs fallback Focus Mode progress state for a task without a time goal", () => {
    const activeTask = task({ accumulatedMs: 30_000 });
    const focusDial = createFocusElementStub();
    const progressPath = { setAttribute: vi.fn() };
    focusDial.querySelector = vi.fn(() => progressPath);
    const previousWindow = (globalThis as { window?: unknown }).window;
    const windowStub = {
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      setTimeout: vi.fn(() => 1),
    };
    (globalThis as { window?: unknown }).window = windowStub;

    const session = createTaskTimerSession({
      els: {
        taskList: null,
        focusTaskName: createFocusElementStub(),
        focusTimerDays: createFocusElementStub(),
        focusTimerClock: createFocusElementStub(),
        focusDialHint: createFocusElementStub(),
        focusDial: focusDial as unknown as HTMLButtonElement,
        focusCheckpointRing: null,
        focusCheckpointLogList: null,
        focusCheckpointLogEmpty: null,
      },
      runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
      storageKeys: {
        FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      },
      sharedTasks: { milestoneUnitSec: () => 60, milestoneUnitSuffix: () => "m" } as unknown as TaskTimerSharedTaskApi,
      getTasks: () => [activeTask],
      getFocusModeTaskId: () => "task-1",
      getFocusModeTaskName: () => "Focus",
      getHistoryByTaskId: () => ({}),
      getCheckpointRepeatActiveTaskId: () => null,
      getCheckpointToastQueue: () => [],
      getActiveCheckpointToast: () => null,
      setActiveCheckpointToast: () => {},
      getCheckpointAutoResetDirty: () => false,
      setCheckpointAutoResetDirty: () => {},
      getCurrentAppPage: () => "tasks",
      renderDashboardLiveWidgets: () => {},
      render: () => {},
      save: () => {},
      syncRewardSessionTrackerForTask: () => {},
      syncLiveSessionForTask: () => {},
      formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
      getDynamicColorsEnabled: () => false,
      fillBackgroundForPct: (pct: number) => `pct-${pct}`,
      getModeColor: () => "#00ffff",
      sortMilestones: (milestones: Task["milestones"]) => milestones,
      getCheckpointBaselineSecByTaskId: () => ({}),
      getCheckpointFiredKeysByTaskId: () => ({}),
      getCheckpointAlertSoundEnabled: () => false,
      getCheckpointAlertToastEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointAlertToastMode: () => "auto5s",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
      getCheckpointToastAutoCloseTimer: () => null,
      setCheckpointToastAutoCloseTimer: () => {},
      getCheckpointToastCountdownRefreshTimer: () => null,
      setCheckpointToastCountdownRefreshTimer: () => {},
      getCheckpointBeepAudio: () => null,
      setCheckpointBeepAudio: () => {},
      getCheckpointBeepQueueCount: () => 0,
      setCheckpointBeepQueueCount: () => {},
      getCheckpointBeepQueueTimer: () => null,
      setCheckpointBeepQueueTimer: () => {},
      broadcastCheckpointAlertMute: () => {},
      hasEntitlement: () => false,
      on: () => {},
      openOverlay: () => {},
      closeOverlay: () => {},
      navigateToAppRoute: () => {},
      normalizedPathname: () => "/tasklaunch",
      savePendingTaskJump: () => {},
      jumpToTaskById: () => {},
      escapeHtmlUI: (value: unknown) => String(value),
      formatTime: (value: number) => String(value),
      formatMainTaskElapsed: (elapsedMs: number) => `${elapsedMs}ms`,
      normalizeHistoryTimestampMs: () => 0,
      getHistoryEntryNote: () => "",
      syncSharedTaskSummariesForTask: async () => {},
      syncSharedTaskSummariesForTasks: async () => {},
      startTask: () => {},
      stopTask: () => {},
      resetTask: () => {},
      resetTaskStateImmediate: () => {},
      clearFocusSessionDraft: () => {},
      setFocusSessionDraft: () => {},
      syncFocusSessionNotesInput: () => {},
      syncFocusSessionNotesAccordion: () => {},
      getFocusSessionNotesByTaskId: () => ({}),
      setFocusSessionNotesByTaskId: () => {},
      getFocusSessionNoteSaveTimer: () => null,
      setFocusSessionNoteSaveTimer: () => {},
      getDeferredFocusModeTimeGoalModals: () => [],
      getTimeGoalModalTaskId: () => null,
      setTimeGoalModalTaskId: () => {},
      getLiveSessionsByTaskId: () => ({}),
      getTaskTimeGoalAction: () => "confirmModal",
      setDeferredFocusModeTimeGoalModals: () => {},
      getFocusShowCheckpoints: () => false,
      setFocusShowCheckpoints: () => {},
      getFocusCheckpointSig: () => "",
      setFocusCheckpointSig: () => {},
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(focusDial.classList.contains("hasTimeGoal")).toBe(false);
    expect(focusDial.classList.contains("hasProgress")).toBe(true);
    expect(focusDial.style.values.get("--focus-progress")).toBe(`${(30_000 / (60 * 60 * 1000)) * 100}%`);
    expect(focusDial.style.values.get("--focus-progress-value")).toBe(`${(30_000 / (60 * 60 * 1000)) * 100}`);
    expect(focusDial.style.values.get("--focus-progress-angle")).toBe(`${(30_000 / (60 * 60 * 1000)) * 100 * 3.6}deg`);
    expect(focusDial.style.values.get("--focus-progress-color")).toBe(`pct-${(30_000 / (60 * 60 * 1000)) * 100}`);
    expect(progressPath.setAttribute).toHaveBeenCalledWith("d", "M 50 9 A 41 41 0 0 1 52.146 9.056");
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("renders Focus Mode checkpoint markers with actual milestone angles", () => {
    const activeTask = task({
      accumulatedMs: 20 * 60 * 1000,
      color: "#ff6b6b",
      milestonesEnabled: true,
      milestoneTimeUnit: "minute",
      milestones: [
        { hours: 15, description: "Quarter" },
        { hours: 30, description: "Half" },
        { hours: 45, description: "Three quarters" },
      ],
      timeGoalEnabled: true,
      timeGoalMinutes: 60,
    });
    const focusDial = createFocusElementStub();
    const focusCheckpointRing = createFocusElementStub({ clientWidth: 200, clientHeight: 200 });
    let focusCheckpointSig = "";
    const previousWindow = (globalThis as { window?: unknown }).window;
    const windowStub = {
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      setTimeout: vi.fn(() => 1),
    };
    (globalThis as { window?: unknown }).window = windowStub;

    const session = createTaskTimerSession({
      els: {
        taskList: null,
        focusTaskName: createFocusElementStub(),
        focusTimerDays: createFocusElementStub(),
        focusTimerClock: createFocusElementStub(),
        focusDialHint: createFocusElementStub(),
        focusDial: focusDial as unknown as HTMLButtonElement,
        focusCheckpointRing: focusCheckpointRing as unknown as HTMLElement,
        focusCheckpointLogList: null,
        focusCheckpointLogEmpty: null,
      },
      runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
      storageKeys: {
        FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      },
      sharedTasks: { milestoneUnitSec: () => 60, milestoneUnitSuffix: () => "m" } as unknown as TaskTimerSharedTaskApi,
      getTasks: () => [activeTask],
      getFocusModeTaskId: () => "task-1",
      getFocusModeTaskName: () => "Focus",
      getHistoryByTaskId: () => ({}),
      getCheckpointRepeatActiveTaskId: () => null,
      getCheckpointToastQueue: () => [],
      getActiveCheckpointToast: () => null,
      setActiveCheckpointToast: () => {},
      getCheckpointAutoResetDirty: () => false,
      setCheckpointAutoResetDirty: () => {},
      getCurrentAppPage: () => "tasks",
      renderDashboardLiveWidgets: () => {},
      render: () => {},
      save: () => {},
      syncRewardSessionTrackerForTask: () => {},
      syncLiveSessionForTask: () => {},
      formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
      getDynamicColorsEnabled: () => false,
      fillBackgroundForPct: (pct: number) => `pct-${pct}`,
      getModeColor: () => "#00ffff",
      sortMilestones: (milestones: Task["milestones"]) => milestones,
      getCheckpointBaselineSecByTaskId: () => ({}),
      getCheckpointFiredKeysByTaskId: () => ({}),
      getCheckpointAlertSoundEnabled: () => false,
      getCheckpointAlertToastEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointAlertToastMode: () => "auto5s",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
      getCheckpointToastAutoCloseTimer: () => null,
      setCheckpointToastAutoCloseTimer: () => {},
      getCheckpointToastCountdownRefreshTimer: () => null,
      setCheckpointToastCountdownRefreshTimer: () => {},
      getCheckpointBeepAudio: () => null,
      setCheckpointBeepAudio: () => {},
      getCheckpointBeepQueueCount: () => 0,
      setCheckpointBeepQueueCount: () => {},
      getCheckpointBeepQueueTimer: () => null,
      setCheckpointBeepQueueTimer: () => {},
      broadcastCheckpointAlertMute: () => {},
      hasEntitlement: () => false,
      on: () => {},
      openOverlay: () => {},
      closeOverlay: () => {},
      navigateToAppRoute: () => {},
      normalizedPathname: () => "/tasklaunch",
      savePendingTaskJump: () => {},
      jumpToTaskById: () => {},
      escapeHtmlUI: (value: unknown) => String(value),
      formatTime: (value: number) => String(value),
      formatMainTaskElapsed: (elapsedMs: number) => `${elapsedMs}ms`,
      normalizeHistoryTimestampMs: () => 0,
      getHistoryEntryNote: () => "",
      syncSharedTaskSummariesForTask: async () => {},
      syncSharedTaskSummariesForTasks: async () => {},
      startTask: () => {},
      stopTask: () => {},
      resetTask: () => {},
      resetTaskStateImmediate: () => {},
      clearFocusSessionDraft: () => {},
      setFocusSessionDraft: () => {},
      syncFocusSessionNotesInput: () => {},
      syncFocusSessionNotesAccordion: () => {},
      getFocusSessionNotesByTaskId: () => ({}),
      setFocusSessionNotesByTaskId: () => {},
      getFocusSessionNoteSaveTimer: () => null,
      setFocusSessionNoteSaveTimer: () => {},
      getDeferredFocusModeTimeGoalModals: () => [],
      getTimeGoalModalTaskId: () => null,
      setTimeGoalModalTaskId: () => {},
      getLiveSessionsByTaskId: () => ({}),
      getTaskTimeGoalAction: () => "confirmModal",
      setDeferredFocusModeTimeGoalModals: () => {},
      getFocusShowCheckpoints: () => true,
      setFocusShowCheckpoints: () => {},
      getFocusCheckpointSig: () => focusCheckpointSig,
      setFocusCheckpointSig: (value: string) => {
        focusCheckpointSig = value;
      },
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(focusCheckpointRing.innerHTML).toContain("focusCheckpointMark reached");
    expect(focusCheckpointRing.innerHTML).toContain("--ma:0.0deg");
    expect(focusCheckpointRing.innerHTML).toContain("--ma:90.0deg");
    expect(focusCheckpointRing.innerHTML).toContain("--ma:180.0deg");
    expect(focusCheckpointRing.innerHTML).toContain("--mxpx:81.5px;--mypx:0.0px");
    expect(focusCheckpointRing.innerHTML).toContain("--mxpx:0.0px;--mypx:81.5px");
    expect(focusCheckpointRing.innerHTML).toContain("--mxpx:-81.5px;--mypx:0.0px");
    expect(focusCheckpointRing.innerHTML).toContain("--lxpx:94.0px;--lypx:0.0px");
    expect(focusCheckpointRing.innerHTML).toContain("--lxpx:0.0px;--lypx:94.0px");
    expect(focusCheckpointRing.innerHTML).toContain("--lxpx:-94.0px;--lypx:0.0px");
    expect(focusCheckpointRing.innerHTML).toContain(">15m<");
    expect(focusCheckpointRing.innerHTML).toContain(">30m<");
    expect(focusCheckpointRing.innerHTML).toContain(">45m<");
    expect(focusCheckpointRing.innerHTML).not.toContain(">900000<");
    expect(focusCheckpointRing.innerHTML).toContain("--focus-checkpoint-marker-color:#ff6b6b;");
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("anchors Focus Mode checkpoint UI to the full dial and points arrows inward", () => {
    const css = readFileSync("src/app/tasktimer/styles/00-base.css", "utf8").replace(/\r\n/g, "\n");
    const ringRule = css.match(/\.focusCheckpointRing\{[\s\S]*?\n\}/)?.[0] ?? "";
    const markRule = css.match(/\.focusCheckpointMark\{[\s\S]*?\n\}/)?.[0] ?? "";
    const labelRule = css.match(/\.focusCheckpointLabel\{[\s\S]*?\n\}/)?.[0] ?? "";
    const reachedLabelRule = css.match(/\.focusCheckpointLabel\.reached\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(ringRule).toContain("inset:0");
    expect(markRule).toContain("+ 270deg");
    expect(labelRule).toContain("color: #fff");
    expect(labelRule).toContain("font-size:13px");
    expect(labelRule).toContain("max-width: clamp(112px, 25cqw, 148px)");
    expect(reachedLabelRule).toContain("color: #fff");
  });

  it("keeps the Focus Mode progress mask visible in Chromium", () => {
    const css = readFileSync("src/app/tasktimer/styles/00-base.css", "utf8").replace(/\r\n/g, "\n");
    const taskCss = readFileSync("src/app/tasktimer/styles/02-tasks.css", "utf8").replace(/\r\n/g, "\n");
    const focusModeScreenRule = css.match(/#focusModeScreen\{[\s\S]*?\n\}/)?.[0] ?? "";
    const dialRule = css.match(/\.focusDial\{[\s\S]*?\n\}/)?.[0] ?? "";
    const progressRule = css.match(/\.focusDialProgress\{[\s\S]*?\n\}/)?.[0] ?? "";
    const progressFillRule = css.match(/\.focusDialProgressFill\{[\s\S]*?\n\}/)?.[0] ?? "";
    const exitBarRule = css.match(/\.focusModeExitBar\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusModeHeadRule = taskCss.match(/\.focusModeHead\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusModeScreen = readFileSync("src/app/tasktimer/components/FocusModeScreen.tsx", "utf8").replace(/\r\n/g, "\n");

    expect(focusModeScreenRule).toContain('url("/leaderboard/deep-space-bg.webp") center / cover no-repeat #000');
    expect(focusModeHeadRule).toContain("padding-top:32px");
    expect(dialRule).toContain("--focus-inner-inset: calc(16.125cqw - 1px)");
    expect(progressRule).toContain("inset:0");
    expect(progressRule).toContain("z-index:7");
    expect(progressRule).toContain("visibility:hidden");
    expect(progressFillRule).toContain("stroke: var(--focus-progress-color, rgb(255,59,48))");
    expect(progressFillRule).toContain("stroke-width:14.25");
    expect(progressFillRule).toContain("stroke-dasharray:none");
    expect(progressFillRule).toContain("stroke-dashoffset:0");
    expect(progressFillRule).toContain("vector-effect: non-scaling-stroke");
    expect(exitBarRule).toContain("padding-bottom:32px");
    expect(focusModeScreen).toContain('className="focusDialProgress"');
    expect(focusModeScreen).toContain('className="focusDialProgressFill"');
    expect(focusModeScreen).not.toContain("focusDialProgressShimmer");
    expect(focusModeScreen).toContain('d=""');
    expect(focusModeScreen).not.toContain("<circle");
    expect(progressRule).not.toContain("from -90deg");
    expect(progressRule).not.toContain("-webkit-mask");
    expect(progressRule).not.toContain("mask:");
    expect(progressRule).not.toContain("#fff 72% 91%");
    expect(progressRule).not.toContain("50% - var(--focus-inner-inset)");
    expect(progressRule).not.toContain("transparent 69%, #fff 70%, #fff 89%, transparent 90%");
    expect(progressRule).not.toContain("transparent 78%, #000 79%, #000 88%, transparent 89%");
  });

  it("keeps Focus Mode dial stopped, running, and progress states visually distinct", () => {
    const css = readFileSync("src/app/tasktimer/styles/00-base.css", "utf8").replace(/\r\n/g, "\n");
    const stoppedOuterRule = css.match(/\.focusDial\.isStopped \.focusDialOuter,[\s\S]*?\n\}/)?.[0] ?? "";
    const stoppedInnerRule = css.match(/\.focusDial\.isStopped \.focusDialInner,[\s\S]*?\n\}/)?.[0] ?? "";
    const stoppedTextRule = css.match(/\.focusDial\.isStopped \.focusDialTime,[\s\S]*?\n\}/)?.[0] ?? "";
    const runningOuterRule = css.match(/\.focusDial\.isRunning \.focusDialOuter\{[\s\S]*?\n\}/)?.[0] ?? "";
    const runningGlowRule = css.match(/\.focusDial\.isRunning \.focusDialGlowRing\{[\s\S]*?\n\}/)?.[0] ?? "";
    const pulseRule = css.match(/@keyframes focusDialPulseGlow\{[\s\S]*?\n\}/)?.[0] ?? "";
    const progressRule = css.match(/\.focusDialProgress\{[\s\S]*?\n\}/)?.[0] ?? "";
    const progressFillRule = css.match(/\.focusDialProgressFill\{[\s\S]*?\n\}/)?.[0] ?? "";
    const hasProgressRule = css.match(/\.focusDial\.hasProgress \.focusDialProgress\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(stoppedOuterRule).toContain("border-color: rgba(255,77,77,.96)");
    expect(stoppedOuterRule).toContain("0 0 46px rgba(255,77,77,.38)");
    expect(stoppedInnerRule).toContain("border-color: rgba(255,77,77,.9)");
    expect(stoppedInnerRule).toContain("0 0 12px rgba(255,77,77,.62)");
    expect(stoppedTextRule).toContain("color:#ff4d4d");
    expect(runningOuterRule).toContain("animation: focusDialPulseGlow");
    expect(runningGlowRule).toContain("animation: focusDialPulseGlow");
    expect(pulseRule).toContain("box-shadow:");
    expect(pulseRule).not.toContain("filter:");
    expect(progressRule).toContain("z-index:7");
    expect(progressFillRule).toContain("stroke-dasharray:none");
    expect(progressFillRule).toContain("stroke-dashoffset:0");
    expect(progressRule).not.toContain("var(--focus-progress-color) 0 var(--focus-progress)");
    expect(progressRule).not.toContain("transparent var(--focus-progress) 100%");
    expect(progressRule).not.toContain("rgba(37,243,255,.2) var(--focus-progress) 100%");
    expect(progressRule).not.toContain("color-mix");
    expect(hasProgressRule).toContain("opacity:1");
    expect(hasProgressRule).toContain("visibility:visible");
  });
});
