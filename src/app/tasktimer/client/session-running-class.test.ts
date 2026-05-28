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
    textContent: "",
    innerHTML: "",
    clientWidth: options.clientWidth ?? 0,
    clientHeight: options.clientHeight ?? 0,
    setAttribute: vi.fn(),
  };
}

describe("task timer session tick", () => {
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
    expect(focusDial.style.values.get("--focus-progress-color")).toBe("pct-50");
    expect(focusDial.setAttribute).toHaveBeenCalledWith("aria-pressed", "false");
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("syncs fallback Focus Mode progress state for a task without a time goal", () => {
    const activeTask = task({ accumulatedMs: 30_000 });
    const focusDial = createFocusElementStub();
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
    expect(focusDial.style.values.get("--focus-progress-color")).toBe(`pct-${(30_000 / (60 * 60 * 1000)) * 100}`);
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("renders Focus Mode checkpoint markers with actual milestone angles", () => {
    const activeTask = task({
      accumulatedMs: 20 * 60 * 1000,
      milestonesEnabled: true,
      milestoneTimeUnit: "minute",
      milestones: [
        { hours: 15, description: "Quarter" },
        { hours: 30, description: "Half" },
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
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("keeps the Focus Mode progress mask visible in Chromium", () => {
    const css = readFileSync("src/app/tasktimer/styles/00-base.css", "utf8").replace(/\r\n/g, "\n");
    const progressRule = css.match(/\.focusDialProgress\{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(progressRule).toContain("conic-gradient");
    expect(progressRule).toContain("from 0deg");
    expect(progressRule).not.toContain("from -90deg");
    expect(progressRule).toContain("transparent 69%, #fff 70%, #fff 89%, transparent 90%");
    expect(progressRule).not.toContain("transparent 78%, #000 79%, #000 88%, transparent 89%");
  });
});
