import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
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
      runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as any,
      storageKeys: {
        FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      },
      sharedTasks: {
        milestoneUnitSec: () => 3600,
      } as any,
      getTasks: () => [activeTask],
      getCheckpointRepeatActiveTaskId: () => null,
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
    } as any);

    session.tick();

    expect(taskNode.classList.contains("taskRunning")).toBe(true);
    expect(primaryActionBtn.className).toBe("btn btn-warn small");
    expect(primaryActionBtn.dataset.action).toBe("stop");

    expect(windowStub.requestAnimationFrame).toHaveBeenCalled();
    expect(windowStub.setTimeout).toHaveBeenCalled();
    (globalThis as { window?: unknown }).window = previousWindow;
  });
});
