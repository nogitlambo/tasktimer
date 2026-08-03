import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSessionsByTaskId, Task } from "../lib/types";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import type { TaskTimerSessionContext } from "./context";
import type { TaskTimerRuntime } from "./runtime";
import type { TaskTimerSharedTaskApi } from "./task-shared";
import {
  TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT,
  TASKTIMER_REPLAY_TIME_GOAL_COMPLETE_XP_EVENT,
  TASKTIMER_TIME_GOAL_COMPLETE_XP_CLAIM_DELIVERED_EVENT,
  type TimeGoalCompleteXpReplayRequest,
} from "./xp-award-events";
import { clearXpAwardButtonLabelOverride, setXpAwardButtonLabelOverride } from "./xp-award-button-label-override";

vi.mock("./interaction-haptics", () => ({
  playCheckpointAlertVibration: vi.fn(),
  playTaskCompleteConfettiHaptic: vi.fn(),
}));

const nativeRuntime = vi.hoisted(() => ({
  androidCheckpointAlarmRuntime: false,
}));

vi.mock("../lib/nativeTimerNotification", () => ({
  dismissNativeCheckpointAlarm: vi.fn(async () => {}),
  isNativeAndroidCheckpointAlarmRuntime: () => nativeRuntime.androidCheckpointAlarmRuntime,
  syncNativeCheckpointAlarms: vi.fn(async () => {}),
}));

import { playCheckpointAlertVibration } from "./interaction-haptics";
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
    display: "",
    setProperty: (name: string, value: string) => {
      values.set(name, value);
    },
  };
}

type FocusElementStub = ReturnType<typeof createClassList> extends infer ClassList
  ? {
      classList: ClassList;
      style: ReturnType<typeof createStyleStub>;
      dataset: Record<string, string>;
      textContent: string;
      innerHTML: string;
      offsetWidth: number;
      clientWidth: number;
      clientHeight: number;
      hidden: boolean;
      disabled: boolean;
      setAttribute: ReturnType<typeof vi.fn>;
      closest: ReturnType<typeof vi.fn>;
      querySelector: ReturnType<typeof vi.fn>;
      getBoundingClientRect: ReturnType<typeof vi.fn>;
    }
  : never;

function createFocusElementStub(options: { clientWidth?: number; clientHeight?: number } = {}): FocusElementStub {
  return {
    classList: createClassList(),
    style: createStyleStub(),
    dataset: {},
    textContent: "",
    innerHTML: "",
    offsetWidth: 0,
    clientWidth: options.clientWidth ?? 0,
    clientHeight: options.clientHeight ?? 0,
    hidden: false,
    disabled: false,
    setAttribute: vi.fn(),
    closest: vi.fn(() => null),
    querySelector: vi.fn(() => null),
    getBoundingClientRect: vi.fn(() => ({ left: 24, top: 36, width: 120, height: 32 })),
  };
}

function createCompletionHarness(options?: {
  withCheckpoint?: boolean;
  focusModeTaskId?: string | null;
  timeGoalModalTaskId?: string | null;
  taskOverrides?: Partial<Task>;
  liveSessionsByTaskId?: LiveSessionsByTaskId;
  localStorageValues?: Record<string, string | null>;
  achievementSoundsEnabled?: boolean;
  interactionHapticsEnabled?: boolean;
  interactionHapticsIntensity?: "max" | "medium" | "low";
  reducedMotion?: boolean;
  checkpointAlertSoundEnabled?: boolean;
  checkpointAlertVibrationEnabled?: boolean;
  checkpointAlertFlashEnabled?: boolean;
  checkpointAlertSoundMode?: "once" | "repeat";
  liveTaskDom?: boolean;
  nativeAndroidCheckpointAlarmRuntime?: boolean;
  timeGoalCompleteNextTasksEnabled?: boolean;
  extraTasks?: Task[];
  withNextTaskElements?: boolean;
}) {
  nativeRuntime.androidCheckpointAlarmRuntime = !!options?.nativeAndroidCheckpointAlarmRuntime;
  const completedTask = task({
    id: "task-1",
    name: "Focus",
    accumulatedMs: 120_000,
    running: true,
    milestonesEnabled: !!options?.withCheckpoint,
    milestoneTimeUnit: "minute",
    milestones: options?.withCheckpoint ? [{ hours: 0.5, description: "Halfway" }] : [],
    timeGoalEnabled: true,
    timeGoalMinutes: 1,
    timeGoalPeriod: "day",
    ...options?.taskOverrides,
  });
  let timeGoalModalTaskId: string | null = options?.timeGoalModalTaskId ?? null;
  let timeGoalModalFrozenElapsedMs = timeGoalModalTaskId ? 60_000 : 0;
  let focusModeTaskId: string | null = options?.focusModeTaskId ?? null;
  let focusModeTaskName = focusModeTaskId ? "Focus" : "";
  let focusShowCheckpoints = true;
  let checkpointBeepAudio: HTMLAudioElement | null = null;
  let checkpointBeepQueueCount = 0;
  let checkpointBeepQueueTimer: number | null = null;
  let checkpointRepeatStopAtMs = 0;
  let checkpointRepeatCycleTimer: number | null = null;
  let checkpointRepeatActiveTaskId: string | null = null;
  const checkpointFlashUntilMsByTaskId: Record<string, number> = {};
  const checkpointBaselineSecByTaskId: Record<string, number> = { "task-1": 0 };
  const checkpointFiredKeysByTaskId: Record<string, Set<string>> = {};
  const clearTimeout = vi.fn();
  const openOverlay = vi.fn();
  const closeOverlay = vi.fn();
  const render = vi.fn();
  const save = vi.fn();
  const resetTaskStateImmediate = vi.fn();
  const clearFocusSessionDraft = vi.fn();
  const setFocusSessionDraft = vi.fn();
  const liveTaskNode = {
    classList: createClassList(["task", "taskRunning"]),
    dataset: { index: "0", taskId: "task-1" },
    offsetWidth: 320,
    querySelector: vi.fn(() => null),
  };
  const taskList = options?.liveTaskDom
    ? { classList: createClassList([]), querySelectorAll: vi.fn(() => [liveTaskNode]) }
    : null;
  const focusModeScreen = createFocusElementStub();
  focusModeScreen.style = { ...focusModeScreen.style, display: "block" };
  const timeGoalCompleteOverlay = {
    dataset: {} as Record<string, string>,
    style: { display: "none" },
    getAttribute: () => null,
  };
  const timeGoalCompleteCloseBtn = createFocusElementStub();
  const timeGoalCompleteTitle = createFocusElementStub();
  const timeGoalCompleteText = createFocusElementStub();
  const timeGoalCompleteXpValue = createFocusElementStub();
  timeGoalCompleteText.querySelector = vi.fn((selector: string) =>
    selector === "#timeGoalCompleteXpValue" ? timeGoalCompleteXpValue : null
  );
  const timeGoalCompleteMeta = createFocusElementStub();
  const timeGoalCompleteNextTaskOverlay = {
    dataset: {} as Record<string, string>,
    style: { display: "none" },
    getAttribute: () => null,
  };
  const timeGoalCompleteNextTaskModalGrid = createFocusElementStub();
  const timeGoalCompleteNextTaskCloseBtn = createFocusElementStub();
  const handlers = new Map<string, (event?: Event) => unknown>();
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const audioPlay = vi.fn();
  const audioPause = vi.fn();
  const audioInstances: Array<{
    src: string;
    currentTime: number;
    duration: number;
    loop: boolean;
    paused: boolean;
    eventHandlers: Map<string, EventListenerOrEventListenerObject>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
  }> = [];
  (globalThis as { Audio?: unknown }).Audio = vi.fn(function AudioStub(src?: string) {
    const eventHandlers = new Map<string, EventListenerOrEventListenerObject>();
    const audio = {
      src: src || "",
      currentTime: 0,
      duration: 1.8,
      loop: false,
      paused: true,
      readyState: 4,
      preload: "",
      load: vi.fn(),
      eventHandlers,
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        eventHandlers.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        eventHandlers.delete(type);
      }),
      pause: vi.fn(() => {
        audio.paused = true;
        return audioPause();
      }),
      play: vi.fn(() => {
        audio.paused = false;
        return audioPlay();
      }),
    };
    audioInstances.push(audio);
    return audio;
  });
  const windowAddEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
  const windowRemoveEventListener = vi.fn<(type: string, listener: EventListenerOrEventListenerObject) => void>();
  const windowDispatchEvent = vi.fn<(event: Event) => boolean>(() => true);
  const windowStub = {
    requestAnimationFrame: vi.fn(() => 1),
    setTimeout: vi.fn((handler: () => void, timeout?: number) => {
      void handler;
      void timeout;
      return 1;
    }),
    clearTimeout,
    localStorage: {
      setItem: vi.fn(),
      getItem: vi.fn((key: string) => options?.localStorageValues?.[key] ?? null),
      removeItem: vi.fn(),
    },
    matchMedia: vi.fn(() => ({
      matches: options?.reducedMotion ?? true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    addEventListener: windowAddEventListener,
    removeEventListener: windowRemoveEventListener,
    dispatchEvent: windowDispatchEvent,
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
      taskList: taskList as unknown as HTMLElement | null,
      focusTaskName: null,
      focusModeScreen: focusModeScreen as unknown as HTMLElement,
      timeGoalCompleteOverlay: timeGoalCompleteOverlay as unknown as HTMLElement,
      timeGoalCompleteTitle: timeGoalCompleteTitle as unknown as HTMLElement,
      timeGoalCompleteText: timeGoalCompleteText as unknown as HTMLElement,
      timeGoalCompleteXpValue: timeGoalCompleteXpValue as unknown as HTMLElement,
      timeGoalCompleteMeta: timeGoalCompleteMeta as unknown as HTMLElement,
      timeGoalCompleteCloseBtn: timeGoalCompleteCloseBtn as unknown as HTMLButtonElement,
      timeGoalCompleteLaunchNextBtn: null,
      timeGoalCompleteNextTasks: null,
      timeGoalCompleteNextTaskGrid: null,
      timeGoalCompleteNextTaskOverlay: options?.withNextTaskElements ? timeGoalCompleteNextTaskOverlay as unknown as HTMLElement : null,
      timeGoalCompleteNextTaskModalTitle: null,
      timeGoalCompleteNextTaskModalText: null,
      timeGoalCompleteNextTaskModalGrid: options?.withNextTaskElements ? timeGoalCompleteNextTaskModalGrid as unknown as HTMLElement : null,
      timeGoalCompleteNextTaskCloseBtn: options?.withNextTaskElements ? timeGoalCompleteNextTaskCloseBtn as unknown as HTMLButtonElement : null,
      timeGoalCompleteConfettiStage: null,
      timeGoalCompleteNoteInput: null,
    },
    runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
    storageKeys: {
      FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      TIME_GOAL_PENDING_FLOW_KEY: "tasktimer:time-goal",
      TIME_GOAL_PENDING_COMPLETIONS_KEY: "taskticker_tasks_v1:pendingTimeGoalCompletions",
      TIME_GOAL_COMPLETION_ACK_KEY: "tasktimer:time-goal-ack",
    },
    sharedTasks: { milestoneUnitSec: () => 60 } as unknown as TaskTimerSharedTaskApi,
    getTasks: () => [completedTask, ...(options?.extraTasks || [])],
    getHistoryByTaskId: () => ({}),
    getCheckpointFlashUntilMsByTaskId: () => checkpointFlashUntilMsByTaskId,
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
    save,
    syncRewardSessionTrackerForTask: () => {},
    syncLiveSessionForTask: () => {},
    formatMainTaskElapsedHtml: (elapsedMs: number) => `${elapsedMs}ms`,
    getDynamicColorsEnabled: () => false,
    getTimeGoalCompleteNextTasksEnabled: () => options?.timeGoalCompleteNextTasksEnabled === true,
    fillBackgroundForPct: () => "#00ffff",
    getModeColor: () => "#00ffff",
    sortMilestones: (milestones: Task["milestones"]) => milestones,
    getCheckpointAlertSoundEnabled: () => !!options?.checkpointAlertSoundEnabled,
    getCheckpointAlertVibrationEnabled: () => !!options?.checkpointAlertVibrationEnabled,
    getCheckpointAlertFlashEnabled: () => options?.checkpointAlertFlashEnabled !== false,
    getCheckpointAlertSoundMode: () => options?.checkpointAlertSoundMode || "once",
    getCheckpointRepeatStopAtMs: () => checkpointRepeatStopAtMs,
    setCheckpointRepeatStopAtMs: (value: number) => {
      checkpointRepeatStopAtMs = value;
    },
    getCheckpointRepeatCycleTimer: () => checkpointRepeatCycleTimer,
    setCheckpointRepeatCycleTimer: (value: number | null) => {
      checkpointRepeatCycleTimer = value;
    },
    setCheckpointRepeatActiveTaskId: (value: string | null) => {
      checkpointRepeatActiveTaskId = value;
    },
    getCheckpointRepeatActiveTaskId: () => checkpointRepeatActiveTaskId,
    getCheckpointBeepAudio: () => checkpointBeepAudio,
    setCheckpointBeepAudio: (value: HTMLAudioElement | null) => {
      checkpointBeepAudio = value;
    },
    getCheckpointBeepQueueCount: () => checkpointBeepQueueCount,
    setCheckpointBeepQueueCount: (value: number) => {
      checkpointBeepQueueCount = value;
    },
    getCheckpointBeepQueueTimer: () => checkpointBeepQueueTimer,
    setCheckpointBeepQueueTimer: (value: number | null) => {
      checkpointBeepQueueTimer = value;
    },
    broadcastCheckpointAlertMute: () => {},
    hasEntitlement: () => false,
    on: (target: unknown, eventName: string, handler: (event?: Event) => unknown) => {
      if (target === timeGoalCompleteCloseBtn && eventName === "click") handlers.set("timeGoalCompleteCloseBtn:click", handler);
      if (target === timeGoalCompleteText && eventName === "click") handlers.set("timeGoalCompleteText:click", handler);
      if (target === timeGoalCompleteNextTaskModalGrid && eventName === "click") handlers.set("timeGoalCompleteNextTaskModalGrid:click", handler);
      if (target === timeGoalCompleteNextTaskCloseBtn && eventName === "click") handlers.set("timeGoalCompleteNextTaskCloseBtn:click", handler);
      if (target === windowStub) handlers.set(`window:${eventName}`, handler);
    },
    openOverlay,
    closeOverlay,
    applyAppPage: () => {},
    navigateToAppRoute: () => {},
    normalizedPathname: () => "/tasklaunch",
    savePendingTaskJump: () => {},
    jumpToTaskById: () => {},
    jumpToTaskAndHighlight: () => {},
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
    resetTaskStateImmediate,
    clearFocusSessionDraft,
    setFocusSessionDraft,
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
    getLiveSessionsByTaskId: () => options?.liveSessionsByTaskId || {},
    getTaskTimeGoalAction: () => "confirmModal",
    getFocusShowCheckpoints: () => false,
    setFocusShowCheckpoints: (value: boolean) => {
      focusShowCheckpoints = value;
    },
    setFocusCheckpointSig: () => {},
    getInteractionHapticsEnabled: () => !!options?.interactionHapticsEnabled,
    getInteractionHapticsIntensity: () => options?.interactionHapticsIntensity || "medium",
    getOptimalProductivityStartTime: () => "09:00",
    getOptimalProductivityEndTime: () => "17:00",
    getOptimalProductivityDays: () => ({ mon: true, tue: true, thu: true, fri: true, sat: false, sun: false }),
    renderDashboardWidgets: () => {},
    getTimeGoalReminderAtMsByTaskId: () => ({}),
    getRewardProgress: () => ({}),
    getWeekStarting: () => "mon",
    getAchievementSoundsEnabled: () => !!options?.achievementSoundsEnabled,
  } as unknown as TaskTimerSessionContext);

  return {
    session,
    completedTask,
    liveTaskNode,
    checkpointFlashUntilMsByTaskId,
    checkpointBaselineSecByTaskId,
    checkpointFiredKeysByTaskId,
    clearTimeout,
    openOverlay,
    timeGoalCompleteOverlay,
    timeGoalCompleteTitle,
    timeGoalCompleteText,
    timeGoalCompleteXpValue,
    timeGoalCompleteCloseBtn,
    timeGoalCompleteMeta,
    timeGoalCompleteNextTaskOverlay,
    timeGoalCompleteNextTaskModalGrid,
    timeGoalCompleteNextTaskCloseBtn,
    save,
    resetTaskStateImmediate,
    clearFocusSessionDraft,
    setFocusSessionDraft,
    audioPlay,
    audioPause,
    audioInstances,
    windowStub,
    restoreWindow: () => {
      nativeRuntime.androidCheckpointAlarmRuntime = false;
      (globalThis as { window?: unknown }).window = previousWindow;
      (globalThis as { document?: unknown }).document = previousDocument;
      (globalThis as { Audio?: unknown }).Audio = previousAudio;
    },
    isCheckpointFlashing: (taskId: string) => Number(checkpointFlashUntilMsByTaskId[taskId] || 0) > Date.now(),
    getFocusModeTaskId: () => focusModeTaskId,
    getFocusModeTaskName: () => focusModeTaskName,
    getFocusShowCheckpoints: () => focusShowCheckpoints,
    closeOverlay,
    triggerTimeGoalCompleteClose: async () => {
      const handler = handlers.get("timeGoalCompleteCloseBtn:click");
      if (!handler) throw new Error("timeGoalCompleteCloseBtn click handler was not registered");
      await handler(new Event("click"));
    },
    triggerTimeGoalCompleteTextClick: () => {
      const handler = handlers.get("timeGoalCompleteText:click");
      if (!handler) throw new Error("timeGoalCompleteText click handler was not registered");
      handler(new Event("click"));
    },
    triggerTimeGoalCompleteXpReplay: (detail: TimeGoalCompleteXpReplayRequest) => {
      const handler = handlers.get(`window:${TASKTIMER_REPLAY_TIME_GOAL_COMPLETE_XP_EVENT}`);
      if (!handler) throw new Error("time goal complete XP replay handler was not registered");
      handler(new CustomEvent(TASKTIMER_REPLAY_TIME_GOAL_COMPLETE_XP_EVENT, { detail }));
    },
    triggerOverlayClosed: (overlayId: string) => {
      const handler = handlers.get(`window:tasktimer:overlayClosed`);
      if (!handler) throw new Error("overlay closed handler was not registered");
      handler(new CustomEvent("tasktimer:overlayClosed", { detail: { overlayId } }));
    },
    triggerNextTaskGridClick: (nextTaskId: string) => {
      const handler = handlers.get("timeGoalCompleteNextTaskModalGrid:click");
      if (!handler) throw new Error("next task grid click handler was not registered");
      const tile = { dataset: { timeGoalNextTaskId: nextTaskId } };
      const target = { closest: vi.fn(() => tile) } as unknown as HTMLElement;
      handler({ target } as unknown as Event);
    },
    triggerNextTaskClose: () => {
      const handler = handlers.get("timeGoalCompleteNextTaskCloseBtn:click");
      if (!handler) throw new Error("next task close handler was not registered");
      handler(new Event("click"));
    },
  };
}

function runLastScheduledTimeout(harness: ReturnType<typeof createCompletionHarness>) {
  const calls = harness.windowStub.setTimeout.mock.calls;
  const callback = calls[calls.length - 1]?.[0];
  if (typeof callback !== "function") throw new Error("No scheduled timeout callback found");
  callback();
}

function runScheduledTimeoutByDelay(harness: ReturnType<typeof createCompletionHarness>, delayMs: number) {
  const call = harness.windowStub.setTimeout.mock.calls.find(([, timeout]) => timeout === delayMs);
  const callback = call?.[0];
  if (typeof callback !== "function") throw new Error(`No ${delayMs}ms timeout callback found`);
  callback();
}

function runAllScheduledTimeoutsByDelay(harness: ReturnType<typeof createCompletionHarness>, delayMs: number) {
  harness.windowStub.setTimeout.mock.calls
    .filter(([, timeout]) => timeout === delayMs)
    .forEach(([callback]) => {
      if (typeof callback === "function") callback();
    });
}

describe("task timer session tick", () => {
  beforeEach(() => {
    clearXpAwardButtonLabelOverride("task-1");
  });

  it("plays the once-only checkpoint alert once", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      taskOverrides: {
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.audioInstances[0]?.src).toBe("/checkpoint.mp3");
      expect(harness.windowStub.setTimeout).toHaveBeenCalledTimes(1);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    } finally {
      harness.restoreWindow();
    }
  });

  it("vibrates with the foreground checkpoint tone", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      checkpointAlertVibrationEnabled: true,
      taskOverrides: { checkpointSoundEnabled: true, timeGoalEnabled: false, timeGoalMinutes: 0 },
    });

    try {
      vi.mocked(playCheckpointAlertVibration).mockClear();
      harness.session.tick();
      expect(playCheckpointAlertVibration).toHaveBeenCalledTimes(1);
    } finally {
      harness.restoreWindow();
    }
  });

  it("plays two checkpoint vibrations without audio when sound is disabled", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertVibrationEnabled: true,
      taskOverrides: { checkpointSoundEnabled: true, timeGoalEnabled: false, timeGoalMinutes: 0 },
    });

    try {
      vi.mocked(playCheckpointAlertVibration).mockClear();
      harness.session.tick();
      expect(harness.audioPlay).not.toHaveBeenCalled();
      expect(playCheckpointAlertVibration).toHaveBeenCalledTimes(1);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 450);

      runScheduledTimeoutByDelay(harness, 450);
      expect(playCheckpointAlertVibration).toHaveBeenCalledTimes(2);
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not play checkpoint audio or vibration when both channels are disabled", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      taskOverrides: { checkpointSoundEnabled: true, timeGoalEnabled: false, timeGoalMinutes: 0 },
    });

    try {
      vi.mocked(playCheckpointAlertVibration).mockClear();
      harness.session.tick();
      expect(harness.audioPlay).not.toHaveBeenCalled();
      expect(playCheckpointAlertVibration).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("fires checkpoint alerts on a later run despite retained completion metadata", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      taskOverrides: {
        checkpointSoundEnabled: true,
        timeGoalMinutes: 10,
        timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(Date.now()),
        timeGoalCompletedAtMs: Date.now() - 60_000,
        timeGoalCompletedReason: "reset",
        timeGoalCompletedElapsedMs: 60_000,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.isCheckpointFlashing("task-1")).toBe(true);
    } finally {
      harness.restoreWindow();
    }
  });

  it("plays a due checkpoint alert before opening the same-tick completion modal", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      taskOverrides: {
        checkpointSoundEnabled: true,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.completedTask.running).toBe(false);
    } finally {
      harness.restoreWindow();
    }
  });

  it("plays the foreground checkpoint alert in the native Android runtime", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      nativeAndroidCheckpointAlarmRuntime: true,
      taskOverrides: {
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.audioInstances[0]?.src).toBe("/checkpoint.mp3");
    } finally {
      harness.restoreWindow();
    }
  });

  it("plays one checkpoint alert when multiple checkpoints are reached together", () => {
    const harness = createCompletionHarness({
      checkpointAlertSoundEnabled: true,
      taskOverrides: {
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [
          { hours: 0.25, description: "Quarter" },
          { hours: 0.5, description: "Halfway" },
        ],
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledTimes(2);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
    } finally {
      harness.restoreWindow();
    }
  });

  it("uses cumulative elapsed as the new baseline after checkpoint tracking is re-armed", () => {
    const harness = createCompletionHarness({
      checkpointAlertSoundEnabled: true,
      taskOverrides: {
        accumulatedMs: 40 * 60_000,
        milestonesEnabled: true,
        milestoneTimeUnit: "minute",
        milestones: [
          { hours: 30, description: "Passed" },
          { hours: 60, description: "Future" },
        ],
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });
    delete harness.checkpointBaselineSecByTaskId["task-1"];
    harness.checkpointFiredKeysByTaskId["task-1"] = new Set();

    try {
      harness.session.tick();
      expect(harness.audioPlay).not.toHaveBeenCalled();

      harness.completedTask.accumulatedMs = 61 * 60_000;
      harness.session.tick();
      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
    } finally {
      harness.restoreWindow();
    }
  });

  it("plays each repeat checkpoint alert cycle once", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      checkpointAlertSoundMode: "repeat",
      taskOverrides: {
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledTimes(2);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(harness.windowStub.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);

      if (harness.audioInstances[0]) harness.audioInstances[0].paused = true;
      runScheduledTimeoutByDelay(harness, 2000);
      expect(harness.audioPlay).toHaveBeenCalledTimes(2);
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not restart a repeat checkpoint alert while the checkpoint sound is still playing", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertSoundEnabled: true,
      checkpointAlertSoundMode: "repeat",
      taskOverrides: {
        checkpointSoundEnabled: true,
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();
      runLastScheduledTimeout(harness);

      expect(harness.audioPlay).toHaveBeenCalledTimes(1);
    } finally {
      harness.restoreWindow();
    }
  });

  it("starts a 5-second checkpoint flash when a checkpoint is reached", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      taskOverrides: {
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.isCheckpointFlashing("task-1")).toBe(true);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);

      runLastScheduledTimeout(harness);
      expect(harness.isCheckpointFlashing("task-1")).toBe(false);
    } finally {
      harness.restoreWindow();
    }
  });

  it("applies and clears the checkpoint flash class on the live task card", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      liveTaskDom: true,
      taskOverrides: {
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.liveTaskNode.classList.contains("taskCheckpointFlash")).toBe(true);
      expect(harness.windowStub.setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);

      runLastScheduledTimeout(harness);
      expect(harness.liveTaskNode.classList.contains("taskCheckpointFlash")).toBe(false);
    } finally {
      harness.restoreWindow();
    }
  });

  it("persists pending completion when the completion modal opens", () => {
    const harness = createCompletionHarness({ withCheckpoint: true });

    try {
      harness.session.tick();

      expect(harness.openOverlay).toHaveBeenCalled();
      expect(harness.windowStub.localStorage.setItem).toHaveBeenCalledWith(
        "tasktimer:time-goal",
        expect.stringContaining("task-1")
      );
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not open the follow-up next-task modal by default", () => {
    const harness = createCompletionHarness({
      withNextTaskElements: true,
      extraTasks: [
        task({
          id: "task-2",
          name: "Next Focus",
          timeGoalEnabled: true,
          timeGoalMinutes: 1,
          timeGoalPeriod: "day",
        }),
      ],
    });

    try {
      harness.session.tick();

      expect(harness.openOverlay).not.toHaveBeenCalledWith(harness.timeGoalCompleteNextTaskOverlay);
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toBe("");
    } finally {
      harness.restoreWindow();
    }
  });

  it("opens the follow-up next-task modal after the reward modal closes when enabled", async () => {
    const harness = createCompletionHarness({
      withNextTaskElements: true,
      timeGoalModalTaskId: "task-1",
      timeGoalCompleteNextTasksEnabled: true,
      extraTasks: [
        task({
          id: "task-2",
          name: "Next Focus",
          color: "#ff00aa",
          timeGoalEnabled: true,
          timeGoalMinutes: 1,
          timeGoalPeriod: "day",
        }),
      ],
    });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "0";
      harness.openOverlay.mockClear();

      await harness.triggerTimeGoalCompleteClose();
      harness.triggerOverlayClosed("timeGoalCompleteOverlay");
      runAllScheduledTimeoutsByDelay(harness, 0);

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteNextTaskOverlay);
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toContain("Click a task below to launch immediately");
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toContain('data-time-goal-next-task-id="task-2"');
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toContain("Next Focus");
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toContain("1m");
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not open the follow-up next-task modal when no eligible tasks remain", async () => {
    const disabledHarness = createCompletionHarness({ withNextTaskElements: true });
    try {
      disabledHarness.session.tick();

      expect(disabledHarness.openOverlay).not.toHaveBeenCalledWith(disabledHarness.timeGoalCompleteNextTaskOverlay);
    } finally {
      disabledHarness.restoreWindow();
    }

    const enabledHarness = createCompletionHarness({
      withNextTaskElements: true,
      timeGoalModalTaskId: "task-1",
      timeGoalCompleteNextTasksEnabled: true,
    });
    try {
      enabledHarness.session.registerSessionEvents();
      enabledHarness.timeGoalCompleteOverlay.dataset.awardedXp = "0";
      enabledHarness.openOverlay.mockClear();

      await enabledHarness.triggerTimeGoalCompleteClose();
      enabledHarness.triggerOverlayClosed("timeGoalCompleteOverlay");
      runAllScheduledTimeoutsByDelay(enabledHarness, 0);

      expect(enabledHarness.openOverlay).not.toHaveBeenCalledWith(enabledHarness.timeGoalCompleteNextTaskOverlay);
      expect(enabledHarness.timeGoalCompleteNextTaskModalGrid.innerHTML).toBe("");
    } finally {
      enabledHarness.restoreWindow();
    }
  });

  it("opens an XP-only task complete modal for a session summary XP replay request", () => {
    const harness = createCompletionHarness({
      achievementSoundsEnabled: true,
      interactionHapticsEnabled: true,
      reducedMotion: false,
      withNextTaskElements: true,
      timeGoalCompleteNextTasksEnabled: true,
      extraTasks: [
        task({
          id: "task-2",
          name: "Next Focus",
          timeGoalEnabled: true,
          timeGoalMinutes: 1,
          timeGoalPeriod: "day",
        }),
      ],
    });

    try {
      harness.session.registerSessionEvents();

      harness.triggerTimeGoalCompleteXpReplay({
        fromXp: 108,
        toXp: 120,
        awardedXp: 12,
        taskId: "task-1",
        sourceTaskId: "task-1",
        sourceElementKey: "historyEntrySummaryXpValue",
        sourceRect: { left: 40, top: 50, width: 70, height: 18 },
      });

      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBe("true");
      expect(harness.timeGoalCompleteOverlay.dataset.awardedXp).toBe("12");
      expect(harness.timeGoalCompleteTitle.textContent).toBe("Focus Complete!");
      expect(harness.timeGoalCompleteXpValue.textContent).toBe("12");
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteText.classList.contains("isCounting")).toBe(false);
      expect(harness.timeGoalCompleteCloseBtn.hidden).toBe(false);
      expect(harness.openOverlay).not.toHaveBeenCalledWith(harness.timeGoalCompleteNextTaskOverlay);
      expect(harness.timeGoalCompleteNextTaskModalGrid.innerHTML).toBe("");
      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);

      const pendingAwardEvent = harness.windowStub.dispatchEvent.mock.calls[0]?.[0] as CustomEvent | undefined;
      expect(pendingAwardEvent?.detail).toMatchObject({
        fromXp: 108,
        toXp: 120,
        awardedXp: 12,
        sourceModal: "timeGoalComplete",
        sourceTaskId: "task-1",
        sourceOverlayId: "timeGoalCompleteOverlay",
        sourceElementKey: "timeGoalCompleteXpValue",
        sourceRect: { left: 24, top: 36, width: 120, height: 32 },
      });
      expect(harness.save).not.toHaveBeenCalled();
      expect(harness.resetTaskStateImmediate).not.toHaveBeenCalled();
      expect(harness.setFocusSessionDraft).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("resets replay presentation state before reopening the replay modal", () => {
    const harness = createCompletionHarness({
      achievementSoundsEnabled: true,
      interactionHapticsEnabled: true,
      reducedMotion: false,
    });

    try {
      harness.session.registerSessionEvents();

      harness.triggerTimeGoalCompleteXpReplay({
        fromXp: 108,
        toXp: 120,
        awardedXp: 12,
        taskId: "task-1",
        sourceTaskId: "task-1",
        sourceElementKey: "historyEntrySummaryXpValue",
        sourceRect: { left: 40, top: 50, width: 70, height: 18 },
      });

      harness.timeGoalCompleteText.classList.add("isCounting", "isPlaying");
      harness.audioPause.mockClear();

      harness.triggerTimeGoalCompleteXpReplay({
        fromXp: 120,
        toXp: 132,
        awardedXp: 12,
        taskId: "task-1",
        sourceTaskId: "task-1",
        sourceElementKey: "historyEntrySummaryXpValue",
        sourceRect: { left: 40, top: 50, width: 70, height: 18 },
      });

      expect(harness.audioPause).toHaveBeenCalled();
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBe("true");
      expect(harness.timeGoalCompleteOverlay.dataset.replayFromXp).toBe("120");
      expect(harness.timeGoalCompleteOverlay.dataset.replayToXp).toBe("132");
      expect(harness.timeGoalCompleteOverlay.dataset.replayAwardedXp).toBe("12");
    } finally {
      harness.restoreWindow();
    }
  });

  it("closes a replay task complete modal on Claim without resolving task completion", async () => {
    const harness = createCompletionHarness({
      withNextTaskElements: true,
      timeGoalCompleteNextTasksEnabled: true,
    });

    try {
      harness.session.registerSessionEvents();
      harness.triggerTimeGoalCompleteXpReplay({
        fromXp: 108,
        toXp: 120,
        awardedXp: 12,
        taskId: "task-1",
        sourceTaskId: "task-1",
        sourceElementKey: "historyEntrySummaryXpValue",
        sourceRect: { left: 40, top: 50, width: 70, height: 18 },
      });
      harness.closeOverlay.mockClear();
      harness.save.mockClear();
      harness.resetTaskStateImmediate.mockClear();
      harness.clearFocusSessionDraft.mockClear();
      harness.setFocusSessionDraft.mockClear();

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.closeOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBeUndefined();
      expect(harness.save).not.toHaveBeenCalled();
      expect(harness.resetTaskStateImmediate).not.toHaveBeenCalled();
      expect(harness.clearFocusSessionDraft).not.toHaveBeenCalled();
      expect(harness.setFocusSessionDraft).not.toHaveBeenCalled();
      expect(harness.completedTask.running).toBe(true);
      expect(harness.completedTask.accumulatedMs).toBe(120_000);

      harness.triggerOverlayClosed("timeGoalCompleteOverlay");
      runAllScheduledTimeoutsByDelay(harness, 0);
      expect(harness.openOverlay).not.toHaveBeenCalledWith(harness.timeGoalCompleteNextTaskOverlay);
    } finally {
      harness.restoreWindow();
    }
  });

  it("requests modal XP delivery on Claim and blocks duplicate Claim while delivery is pending", async () => {
    const harness = createCompletionHarness({
      timeGoalModalTaskId: "task-1",
    });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "12";
      harness.windowStub.dispatchEvent.mockImplementation((event: Event) => {
        if (event.type === TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT) {
          event.preventDefault();
          return false;
        }
        return true;
      });

      const claimPromise = harness.triggerTimeGoalCompleteClose();
      await Promise.resolve();

      expect(harness.timeGoalCompleteCloseBtn.disabled).toBe(true);
      expect(harness.windowStub.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT,
        })
      );
      const claimEvent = harness.windowStub.dispatchEvent.mock.calls.find(
        ([event]) => (event as Event).type === TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT
      )?.[0] as CustomEvent | undefined;
      expect(claimEvent?.detail).toMatchObject({
        overlayId: "timeGoalCompleteOverlay",
        awardedXp: 12,
        sourceElementKey: "timeGoalCompleteXpValue",
      });

      await harness.triggerTimeGoalCompleteClose();
      expect(harness.resetTaskStateImmediate).not.toHaveBeenCalled();

      const deliveredHandler = harness.windowStub.addEventListener.mock.calls.find(
        ([eventName]) => eventName === TASKTIMER_TIME_GOAL_COMPLETE_XP_CLAIM_DELIVERED_EVENT
      )?.[1] as (() => void) | undefined;
      deliveredHandler?.();
      await claimPromise;

      expect(harness.timeGoalCompleteCloseBtn.disabled).toBe(false);
      expect(harness.resetTaskStateImmediate).toHaveBeenCalledTimes(1);
      expect(harness.closeOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
    } finally {
      harness.restoreWindow();
    }
  });

  it("skips modal XP delivery for zero-XP Claim and resolves immediately", async () => {
    const harness = createCompletionHarness({
      timeGoalModalTaskId: "task-1",
    });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "0";

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.windowStub.dispatchEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT,
        })
      );
      expect(harness.resetTaskStateImmediate).toHaveBeenCalledTimes(1);
      expect(harness.closeOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteCloseBtn.disabled).toBe(false);
    } finally {
      harness.restoreWindow();
    }
  });

  it("closes a zero-XP completion modal even when no active task is bound", async () => {
    const harness = createCompletionHarness();

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "0";

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.windowStub.dispatchEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT,
        })
      );
      expect(harness.resetTaskStateImmediate).not.toHaveBeenCalled();
      expect(harness.closeOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteCloseBtn.disabled).toBe(false);
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not start checkpoint flash when flash alerts are disabled", () => {
    const harness = createCompletionHarness({
      withCheckpoint: true,
      checkpointAlertFlashEnabled: false,
      taskOverrides: {
        timeGoalEnabled: false,
        timeGoalMinutes: 0,
      },
    });

    try {
      harness.session.tick();

      expect(harness.isCheckpointFlashing("task-1")).toBe(false);
      expect(harness.checkpointFlashUntilMsByTaskId).toEqual({});
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

  it("acknowledges completion when closing the active task completion modal", async () => {
    const harness = createCompletionHarness({
      timeGoalModalTaskId: "task-1",
    });

    try {
      harness.session.registerSessionEvents();

      await harness.triggerTimeGoalCompleteClose();

      expect(harness.windowStub.localStorage.setItem).toHaveBeenCalledWith(
        "tasktimer:time-goal-ack",
        expect.stringContaining("task-1")
      );
    } finally {
      harness.restoreWindow();
    }
  });

  it("restores a synced completed task as an acknowledgement modal without a local pending flow", () => {
    const completedAtMs = Date.now();
    const harness = createCompletionHarness({
      taskOverrides: {
        accumulatedMs: 0,
        running: false,
        startMs: null,
        timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(completedAtMs),
        timeGoalCompletedAtMs: completedAtMs,
        timeGoalCompletedReason: "goal",
        timeGoalCompletedElapsedMs: 60_000,
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow();

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.acknowledgement).toBe("true");
    } finally {
      harness.restoreWindow();
    }
  });

  it("restores a local pending completion flow for an overdue running task", () => {
    const harness = createCompletionHarness({
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - 60_000,
          elapsedMs: 0,
          resumedFromMs: 0,
          status: "running",
          updatedAtMs: Date.now(),
        },
      },
      localStorageValues: {
        "tasktimer:time-goal": JSON.stringify({
          taskId: "task-1",
          step: "main",
          frozenElapsedMs: 60_000,
          reminder: false,
        }),
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow();

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBeUndefined();
    } finally {
      harness.restoreWindow();
    }
  });

  it("replays a push-restored pending completion flow when an xp preview is persisted", () => {
    const harness = createCompletionHarness({
      achievementSoundsEnabled: true,
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - 60_000,
          elapsedMs: 0,
          resumedFromMs: 0,
          status: "running",
          updatedAtMs: Date.now(),
        },
      },
      localStorageValues: {
        "tasktimer:time-goal": JSON.stringify({
          taskId: "task-1",
          step: "main",
          frozenElapsedMs: 60_000,
          reminder: false,
          awardPreview: {
            fromXp: 108,
            toXp: 120,
            awardedXp: 12,
          },
        }),
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow({ source: "push", taskId: "task-1" });

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBe("true");
      expect(harness.timeGoalCompleteOverlay.dataset.replayFromXp).toBe("108");
      expect(harness.timeGoalCompleteOverlay.dataset.replayToXp).toBe("120");
      expect(harness.timeGoalCompleteOverlay.dataset.awardedXp).toBe("12");
    } finally {
      harness.restoreWindow();
    }
  });

  it("falls back to the normal modal for push-restored pending flow when no xp preview is persisted", () => {
    const harness = createCompletionHarness({
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - 60_000,
          elapsedMs: 0,
          resumedFromMs: 0,
          status: "running",
          updatedAtMs: Date.now(),
        },
      },
      localStorageValues: {
        "tasktimer:time-goal": JSON.stringify({
          taskId: "task-1",
          step: "main",
          frozenElapsedMs: 60_000,
          reminder: false,
        }),
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow({ source: "push", taskId: "task-1" });

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBeUndefined();
    } finally {
      harness.restoreWindow();
    }
  });

  it("replays a push-restored queued completion when an xp preview is persisted", () => {
    const completedAtMs = Date.now();
    const harness = createCompletionHarness({
      achievementSoundsEnabled: true,
      taskOverrides: {
        accumulatedMs: 0,
        running: false,
        startMs: null,
        timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(completedAtMs),
        timeGoalCompletedAtMs: completedAtMs,
        timeGoalCompletedReason: "goal",
        timeGoalCompletedElapsedMs: 60_000,
      },
      localStorageValues: {
        "taskticker_tasks_v1:pendingTimeGoalCompletions": JSON.stringify([{
          taskId: "task-1",
          periodKey: getTimeGoalCompletionDayKey(completedAtMs),
          completedAtMs,
          elapsedMs: 60_000,
          awardPreview: {
            fromXp: 120,
            toXp: 138,
            awardedXp: 18,
          },
        }]),
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow({ source: "push", taskId: "task-1" });

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
      expect(harness.timeGoalCompleteOverlay.dataset.replay).toBe("true");
      expect(harness.timeGoalCompleteOverlay.dataset.replayAwardedXp).toBe("18");
      expect(harness.timeGoalCompleteOverlay.dataset.acknowledgement).toBe("false");
    } finally {
      harness.restoreWindow();
    }
  });

  it("opens the completion modal for an overdue running task without a local pending flow", () => {
    const harness = createCompletionHarness({
      liveSessionsByTaskId: {
        "task-1": {
          sessionId: "session-1",
          taskId: "task-1",
          name: "Focus",
          startedAtMs: Date.now() - 60_000,
          elapsedMs: 0,
          resumedFromMs: 0,
          status: "running",
          updatedAtMs: Date.now(),
        },
      },
    });

    try {
      harness.session.maybeRestorePendingTimeGoalFlow();

      expect(harness.openOverlay).toHaveBeenCalledWith(harness.timeGoalCompleteOverlay);
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

  it("stores the task completion awarded xp on the overlay", () => {
    const harness = createCompletionHarness();

    try {
      harness.session.tick();

      expect(harness.timeGoalCompleteOverlay.dataset.awardedXp).toBeDefined();
    } finally {
      harness.restoreWindow();
    }
  });

  it("reveals task completion XP subtext after the completion sound and plays the reward sound", () => {
    const harness = createCompletionHarness({ achievementSoundsEnabled: true });

    try {
      harness.session.tick();

      const completionAudio = harness.audioInstances.find((audio) => audio.src === "/task_completed.mp3");
      expect(completionAudio).toBeDefined();
      expect(harness.timeGoalCompleteText.classList.contains("isXpRevealPending")).toBe(true);
      expect(harness.audioPlay).toHaveBeenCalledTimes(1);

      const endedHandler = completionAudio?.eventHandlers.get("ended");
      expect(endedHandler).toBeDefined();
      if (typeof endedHandler === "function") {
        endedHandler(new Event("ended"));
      } else {
        endedHandler?.handleEvent(new Event("ended"));
      }

      expect(harness.timeGoalCompleteText.classList.contains("isXpRevealPending")).toBe(false);
      expect(harness.audioInstances.some((audio) => audio.src === "/xp-reward.mp3")).toBe(true);
      expect(harness.audioPlay).toHaveBeenCalledTimes(2);
    } finally {
      harness.restoreWindow();
    }
  });

  it("keeps zero-xp initial task completion from scheduling repeat cues", () => {
    vi.useFakeTimers();
    const harness = createCompletionHarness({ achievementSoundsEnabled: true, interactionHapticsEnabled: true, reducedMotion: false });

    try {
      harness.session.tick();
      expect(harness.timeGoalCompleteOverlay.dataset.awardedXp).toBe("0");
      expect(harness.timeGoalCompleteXpValue.textContent).toBe("0");
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteCloseBtn.hidden).toBe(false);
      expect(harness.timeGoalCompleteCloseBtn.textContent).toBe("Close");
      harness.audioPlay.mockClear();

      vi.advanceTimersByTime(1050);
      vi.advanceTimersByTime(500);

      expect(harness.timeGoalCompleteXpValue.textContent).toBe("0");
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteCloseBtn.hidden).toBe(false);
      expect(harness.timeGoalCompleteCloseBtn.textContent).toBe("Close");
      expect(harness.timeGoalCompleteCloseBtn.classList.contains("isClaimReady")).toBe(true);
      expect(harness.audioPlay).not.toHaveBeenCalled();
      expect(harness.timeGoalCompleteText.classList.contains("isIntervalSplashing")).toBe(false);
    } finally {
      harness.restoreWindow();
      vi.useRealTimers();
    }
  });

  it("keeps the static task completion xp text when the text is clicked", () => {
    vi.useFakeTimers();
    const harness = createCompletionHarness({
      achievementSoundsEnabled: true,
      interactionHapticsEnabled: true,
      interactionHapticsIntensity: "low",
      reducedMotion: false,
    });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.style.display = "flex";
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "12";
      harness.windowStub.setTimeout.mockClear();
      harness.audioPlay.mockClear();

      harness.triggerTimeGoalCompleteTextClick();

      expect(harness.timeGoalCompleteXpValue.textContent).toBe("12");
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteText.classList.contains("isPlaying")).toBe(false);
      expect(harness.timeGoalCompleteText.classList.contains("isCounting")).toBe(false);
      expect(harness.audioPlay).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(harness.audioPlay).not.toHaveBeenCalled();
      expect(harness.timeGoalCompleteText.classList.contains("isIntervalSplashing")).toBe(false);

      harness.triggerTimeGoalCompleteTextClick();

      expect(harness.audioPause).not.toHaveBeenCalled();
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteText.classList.contains("isCounting")).toBe(false);
      expect(harness.audioPlay).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
      vi.useRealTimers();
    }
  });

  it("does not replay reward sound when task completion xp text is clicked with sounds disabled", () => {
    const harness = createCompletionHarness({ achievementSoundsEnabled: false, reducedMotion: false });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.style.display = "flex";
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "12";

      harness.triggerTimeGoalCompleteTextClick();

      expect(harness.timeGoalCompleteXpValue.textContent).toBe("12");
      expect(harness.timeGoalCompleteText.classList.contains("isCalculating")).toBe(false);
      expect(harness.timeGoalCompleteText.classList.contains("isCounting")).toBe(false);
      expect(harness.audioPlay).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not replay the task completion xp text animation for zero xp", () => {
    const harness = createCompletionHarness({ achievementSoundsEnabled: true, reducedMotion: false });

    try {
      harness.session.registerSessionEvents();
      harness.timeGoalCompleteOverlay.style.display = "flex";
      harness.timeGoalCompleteOverlay.dataset.awardedXp = "0";
      harness.windowStub.setTimeout.mockClear();

      harness.triggerTimeGoalCompleteTextClick();

      expect(harness.timeGoalCompleteXpValue.textContent).toBe("");
      expect(harness.timeGoalCompleteText.classList.contains("isPlaying")).toBe(false);
      expect(harness.audioPlay).not.toHaveBeenCalled();
    } finally {
      harness.restoreWindow();
    }
  });

  it("syncs the running task class during live updates without a full refresh", () => {
    const activeTask = task({
      running: true,
      startMs: 1_000,
      hasStarted: true,
      milestonesEnabled: true,
      milestones: [{ hours: 1, description: "" }],
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-accent small",
      dataset: { action: "start" },
      title: "Launch",
      disabled: false,
      textContent: "Launch",
      innerHTML: "Launch",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const resetBtn = {
      disabled: false,
      title: "",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const progressFill = { style: { width: "", background: "" } } as HTMLElement;
    const progressPctLabel = { textContent: "" } as HTMLElement;
    const taskNode = {
      dataset: { index: "0", taskId: "task-1" },
      classList: createClassList(["task"]),
      querySelector: (selector: string) => {
        if (selector === ".time") return timeEl;
        if (selector === ".progressFill") return progressFill;
        if (selector === ".progressPctLabel") return progressPctLabel;
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"], .actions > .btn[data-action="reset"]') return primaryActionBtn;
        if (selector === '.taskBackActions > .taskMenuItem[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      classList: createClassList([]),
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
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(taskNode.classList.contains("taskRunning")).toBe(true);
    expect((taskListEl as unknown as { classList: { contains: (token: string) => boolean } }).classList.contains("hasRunningTask")).toBe(true);
    expect(primaryActionBtn.className).toBe("btn btn-warn small taskPrimaryAction taskPrimaryActionStop");
    expect(primaryActionBtn.dataset.action).toBe("stop");
    expect(primaryActionBtn.innerHTML).toContain("taskPrimaryActionFace");
    expect(primaryActionBtn.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Stop</span>');
    expect(primaryActionBtn.innerHTML).not.toContain("taskPrimaryActionSecondary");
    expect(progressFill.style.width).toBe("100%");
    expect(progressPctLabel.textContent).toBe("100%");

    expect(windowStub.requestAnimationFrame).toHaveBeenCalled();
    expect(windowStub.setTimeout).toHaveBeenCalled();
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("syncs a stopped task with elapsed time to the Resume primary action during live updates", () => {
    const stoppedTask = task({
      accumulatedMs: 45_000,
      running: false,
      startMs: null,
      hasStarted: true,
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-warn small taskPrimaryAction taskPrimaryActionStop",
      dataset: { action: "stop" },
      title: "Stop",
      disabled: false,
      textContent: "Stop",
      innerHTML: "Stop",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const resetBtn = {
      disabled: true,
      title: "",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const progressFill = { style: { width: "", background: "" } } as HTMLElement;
    const taskNode = {
      dataset: { index: "0", taskId: "task-1" },
      classList: createClassList(["task", "taskRunning"]),
      querySelector: (selector: string) => {
        if (selector === ".time") return timeEl;
        if (selector === ".progressFill") return progressFill;
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"], .actions > .btn[data-action="reset"]') return primaryActionBtn;
        if (selector === '.taskBackActions > .taskMenuItem[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      classList: createClassList(["hasRunningTask"]),
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
      getTasks: () => [stoppedTask],
      getCheckpointRepeatActiveTaskId: () => null,
      getHistoryByTaskId: () => ({}),
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      setFocusCheckpointSig: () => {},
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
      getWeekStarting: () => "mon",
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(taskNode.classList.contains("taskRunning")).toBe(false);
    expect((taskListEl as unknown as { classList: { contains: (token: string) => boolean } }).classList.contains("hasRunningTask")).toBe(false);
    expect(primaryActionBtn.className).toBe("btn btn-resume small taskPrimaryAction taskPrimaryActionResume");
    expect(primaryActionBtn.dataset.action).toBe("start");
    expect(primaryActionBtn.title).toBe("Resume");
    expect(primaryActionBtn.disabled).toBe(false);
    expect(primaryActionBtn.innerHTML).toContain("taskPrimaryActionFace");
    expect(primaryActionBtn.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Resume</span>');
    expect(primaryActionBtn.innerHTML).not.toContain("taskPrimaryActionSecondary");
    expect(resetBtn.disabled).toBe(false);
    expect(resetBtn.title).toBe("Reset");

    expect(windowStub.requestAnimationFrame).toHaveBeenCalled();
    expect(windowStub.setTimeout).toHaveBeenCalled();
    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("keeps a held completed task on the Reset primary action during live updates", () => {
    const completedTask = task({
      accumulatedMs: 0,
      running: false,
      startMs: null,
      timeGoalEnabled: true,
      timeGoalMinutes: 60,
      timeGoalPeriod: "day",
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-accent small taskPrimaryAction taskPrimaryActionLaunch",
      dataset: { action: "start" },
      title: "Launch",
      disabled: false,
      textContent: "Launch",
      innerHTML: "Launch",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const resetBtn = {
      disabled: true,
      title: "",
      setAttribute: vi.fn(),
    } as unknown as HTMLButtonElement;
    const taskNode = {
      dataset: { index: "0", taskId: "task-1" },
      classList: createClassList(["task", "taskCompleted"]),
      querySelector: (selector: string) => {
        if (selector === ".time") return timeEl;
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"], .actions > .btn[data-action="reset"]') return primaryActionBtn;
        if (selector === '.taskBackActions > .taskMenuItem[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      classList: createClassList([]),
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
      getTasks: () => [completedTask],
      getCheckpointRepeatActiveTaskId: () => null,
      getHistoryByTaskId: () => ({}),
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      setFocusCheckpointSig: () => {},
      getInteractionHapticsEnabled: () => false,
      getInteractionHapticsIntensity: () => "medium",
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
      renderDashboardWidgets: () => {},
      getWeekStarting: () => "mon",
    } as unknown as TaskTimerSessionContext);

    try {
      setXpAwardButtonLabelOverride("task-1", "Reset");

      session.tick();

      expect(primaryActionBtn.className).toBe("btn btn-warn small taskPrimaryAction taskPrimaryActionReset");
      expect(primaryActionBtn.dataset.action).toBe("reset");
      expect(primaryActionBtn.title).toBe("Reset");
      expect(primaryActionBtn.disabled).toBe(false);
      expect(primaryActionBtn.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Reset</span>');
    } finally {
      clearXpAwardButtonLabelOverride("task-1");
      (globalThis as { window?: unknown }).window = previousWindow;
    }
  });

  it("keeps current-period goal completion metadata resettable during live updates", () => {
    const staleCompletedTask = task({
      timeGoalEnabled: true,
      timeGoalMinutes: 60,
      timeGoalPeriod: "day",
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(),
      timeGoalCompletedAtMs: Date.now(),
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-accent small",
      dataset: { action: "start" },
      title: "Launch",
      disabled: false,
      textContent: "Launch",
      innerHTML: "Launch",
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
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"], .actions > .btn[data-action="reset"]') return primaryActionBtn;
        if (selector === '.taskBackActions > .taskMenuItem[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      classList: createClassList([]),
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
      getTasks: () => [staleCompletedTask],
      getCheckpointRepeatActiveTaskId: () => null,
      getHistoryByTaskId: () => ({}),
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
    } as unknown as TaskTimerSessionContext);

    session.tick();

    expect(taskNode.classList.contains("taskCompleted")).toBe(true);
    expect(primaryActionBtn.className).toBe("btn btn-warn small taskPrimaryAction taskPrimaryActionReset");
    expect(primaryActionBtn.dataset.action).toBe("reset");
    expect(primaryActionBtn.title).toBe("Reset");
    expect(primaryActionBtn.disabled).toBe(false);
    expect(primaryActionBtn.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Reset</span>');
    expect(primaryActionBtn.innerHTML).not.toContain("taskPrimaryActionSecondary");
    expect(resetBtn.disabled).toBe(true);
    expect(resetBtn.title).toBe("No time to reset");

    (globalThis as { window?: unknown }).window = previousWindow;
  });

  it("renders an August 1, 2026 completed goal task as Completed during live updates on Sunday, August 2, 2026", () => {
    const originalDateNow = Date.now;
    Date.now = () => new Date(2026, 7, 2, 8, 0, 0).getTime();
    const staleCompletedTask = task({
      accumulatedMs: 60 * 60 * 1000,
      hasStarted: true,
      timeGoalEnabled: true,
      timeGoalMinutes: 60,
      timeGoalPeriod: "day",
      timeGoalCompletedDayKey: "2026-08-01",
      timeGoalCompletedAtMs: new Date(2026, 7, 1, 21, 0, 0).getTime(),
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60 * 60 * 1000,
    });
    const timeEl = { innerHTML: "" } as HTMLElement;
    const primaryActionBtn = {
      className: "btn btn-accent small",
      dataset: { action: "start" },
      title: "Launch",
      disabled: false,
      textContent: "Launch",
      innerHTML: "Launch",
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
        if (selector === '.actions > .btn[data-action="start"], .actions > .btn[data-action="stop"], .actions > .btn[data-action="reset"]') return primaryActionBtn;
        if (selector === '.taskBackActions > .taskMenuItem[data-action="reset"]') return resetBtn;
        return null;
      },
    } as unknown as HTMLElement;
    const taskListEl = {
      classList: createClassList([]),
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
      getTasks: () => [staleCompletedTask],
      getCheckpointRepeatActiveTaskId: () => null,
      getHistoryByTaskId: () => ({}),
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
    } as unknown as TaskTimerSessionContext);

    try {
      session.tick();

      expect(taskNode.classList.contains("taskCompleted")).toBe(true);
      expect(primaryActionBtn.className).toBe("btn btn-done small taskPrimaryAction taskPrimaryActionDone");
      expect(primaryActionBtn.dataset.action).toBe("reset");
      expect(primaryActionBtn.title).toBe("Completed");
      expect(primaryActionBtn.disabled).toBe(true);
      expect(primaryActionBtn.innerHTML).toContain('<span class="taskPrimaryActionPrimary">Completed</span>');
      expect(primaryActionBtn.innerHTML).not.toContain('<span class="taskPrimaryActionPrimary">Resume</span>');
      expect(resetBtn.disabled).toBe(false);
      expect(resetBtn.title).toBe("Reset");
    } finally {
      Date.now = originalDateNow;
      (globalThis as { window?: unknown }).window = previousWindow;
    }
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
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
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
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
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
      getCheckpointFlashUntilMsByTaskId: () => ({}),
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
      getCheckpointAlertFlashEnabled: () => false,
      getCheckpointAlertSoundMode: () => "once",
      getCheckpointRepeatStopAtMs: () => 0,
      setCheckpointRepeatStopAtMs: () => {},
      getCheckpointRepeatCycleTimer: () => null,
      setCheckpointRepeatCycleTimer: () => {},
      setCheckpointRepeatActiveTaskId: () => {},
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
      getWeekStarting: () => "mon",
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
    const focusModeOpenRule = css.match(/body\.isFocusModeOpen #focusModeScreen\{[\s\S]*?\n\}/)?.[0] ?? "";
    const dialRule = css.match(/\.focusDial\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusNotesRules = Array.from(css.matchAll(/\.focusSessionNotes\{[\s\S]*?\n\}/g)).map(
      (match) => match[0]
    );
    const focusNotesBodyRules = Array.from(css.matchAll(/#focusModeScreen \.focusSessionNotesBody\{[\s\S]*?\n\}/g)).map(
      (match) => match[0]
    );
    const focusNoteEditorGridRule = css.match(/#focusModeScreen \.sessionNoteEditorGrid\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusNotesInputRules = Array.from(css.matchAll(/#focusModeScreen \.focusSessionNotesInput\{[\s\S]*?\n\}/g)).map(
      (match) => match[0]
    );
    const progressRule = css.match(/\.focusDialProgress\{[\s\S]*?\n\}/)?.[0] ?? "";
    const progressFillRule = css.match(/\.focusDialProgressFill\{[\s\S]*?\n\}/)?.[0] ?? "";
    const exitBarRule = css.match(/\.focusModeExitBar\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusModeHeadRule = taskCss.match(/\.focusModeHead\{[\s\S]*?\n\}/)?.[0] ?? "";
    const focusModeScreen = readFileSync("src/app/tasktimer/components/FocusModeScreen.tsx", "utf8").replace(/\r\n/g, "\n");

    expect(focusModeScreenRule).toContain('url("/leaderboard/deep-space-bg.webp") center / cover no-repeat #000');
    expect(focusModeOpenRule).toContain("display:flex !important");
    expect(focusModeOpenRule).toContain("flex-direction:column");
    expect(focusModeOpenRule).toContain("overflow-y:auto");
    expect(focusModeHeadRule).toContain("padding-top:32px");
    expect(dialRule).toContain("--focus-inner-inset: calc(16.125cqw - 1px)");
    expect(focusNotesRules.some((rule) => rule.includes("overflow-x:clip"))).toBe(true);
    expect(focusNotesRules.some((rule) => rule.includes("overflow-y:visible"))).toBe(true);
    expect(focusNotesRules.some((rule) => rule.includes("flex:0 0 auto"))).toBe(true);
    expect(focusNotesRules.some((rule) => rule.includes("margin-bottom:clamp(18px, 2.8dvh, 34px)"))).toBe(true);
    expect(focusNotesBodyRules.some((rule) => rule.includes("display:flex"))).toBe(true);
    expect(focusNotesBodyRules.some((rule) => rule.includes("flex-direction:column"))).toBe(true);
    expect(focusNoteEditorGridRule).toContain("margin-bottom:clamp(18px, 2.8dvh, 34px)");
    expect(
      focusNotesInputRules.some((rule) =>
        rule.includes("max-height:max(var(--focus-session-notes-min-height), min(34dvh, 300px))")
      )
    ).toBe(true);
    expect(progressRule).toContain("inset:0");
    expect(progressRule).toContain("z-index:7");
    expect(progressRule).toContain("visibility:hidden");
    expect(progressFillRule).toContain("stroke: var(--focus-progress-color, rgb(255,59,48))");
    expect(progressFillRule).toContain("stroke-width:14.25");
    expect(progressFillRule).toContain("stroke-dasharray:none");
    expect(progressFillRule).toContain("stroke-dashoffset:0");
    expect(progressFillRule).toContain("vector-effect: non-scaling-stroke");
    expect(exitBarRule).toContain("padding-bottom:32px");
    expect(exitBarRule).toContain("align-self:center");
    expect(exitBarRule).toContain("flex:0 0 auto");
    expect(exitBarRule).toContain("margin:clamp(14px, 2dvh, 24px) auto 0");
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

  it("lets task-complete confetti finish before revealing the XP award text", () => {
    const source = readFileSync("src/app/tasktimer/client/session.ts", "utf8").replace(/\r\n/g, "\n");
    const revealHelper = source.match(/function revealTimeGoalCompleteXpSubtext\(opts\?: \{ playRewardSound\?: boolean \}\) \{[\s\S]*?\n  \}/)?.[0] ?? "";

    expect(revealHelper).not.toBe("");
    expect(source).toContain("import { finishTimeGoalConfetti,");
    expect(revealHelper.indexOf("clearTimeGoalCompleteXpRevealTimer();")).toBeGreaterThan(-1);
    expect(revealHelper.indexOf("finishTimeGoalConfetti(")).toBeGreaterThan(
      revealHelper.indexOf("clearTimeGoalCompleteXpRevealTimer();")
    );
    expect(revealHelper.indexOf("finishTimeGoalConfetti(")).toBeLessThan(
      revealHelper.indexOf("setTimeGoalCompleteXpSubtextVisible(true);")
    );
    expect(revealHelper).not.toContain("stopTimeGoalCompleteConfetti();");
    expect(source).toContain('text.classList.remove("isXpRevealDropping");');
    expect(source).toContain('text.classList.add("isXpRevealDropping");');
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
