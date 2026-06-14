import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { createTaskTimerLifecycle, createTaskTimerLifecycleCommands } from "./task-timer-lifecycle";

const nativeTimerNotificationMock = vi.hoisted(() => ({
  calls: [] as string[],
}));

vi.mock("../lib/nativeTimerNotification", () => ({
  showNativeRunningTimerNotification: vi.fn(async (input: { taskId: string; startedAtMs: number; elapsedBeforeStartMs?: number }) => {
    nativeTimerNotificationMock.calls.push(
      `show-native:${input.taskId}:${input.startedAtMs}:${input.elapsedBeforeStartMs || 0}`
    );
  }),
  clearNativeRunningTimerNotification: vi.fn(async (taskId: string) => {
    nativeTimerNotificationMock.calls.push(`clear-native:${taskId}`);
  }),
}));

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

function createHarness(
  overrides: Partial<{
    tasks: Task[];
    appPage: string;
    focusTaskId: string | null;
    autoFocus: boolean;
    elapsedMs: number;
    nowMs: number;
    historyByTaskId: Record<string, Array<{ ts: number; ms: number; name: string }>>;
  }> = {}
) {
  const calls: string[] = [];
  nativeTimerNotificationMock.calls = calls;
  const confirmOptions: Array<{ onOk: () => void; onCancel?: () => void }> = [];
  const tasks = overrides.tasks || [task()];
  const commands = createTaskTimerLifecycleCommands({
    clearTaskTimeGoalFlow: (taskId) => calls.push(`clear-goal:${taskId}`),
    flushPendingFocusSessionNoteSave: (taskId) => calls.push(`flush-note:${taskId}`),
    openRewardSessionSegment: (entry, startMs) => calls.push(`open-reward:${entry.id}:${startMs}`),
    closeRewardSessionSegment: (entry, endMs) => calls.push(`close-reward:${entry.id}:${endMs}`),
    clearRewardSessionTracker: (taskId) => calls.push(`clear-reward:${taskId}`),
    upsertLiveSession: (entry, opts) =>
      calls.push(`upsert-live:${entry.id}:${opts.elapsedMs}:${opts.resumedFromMs || 0}:${opts.forceCloudFlush === true ? "force" : "queued"}`),
    finalizeLiveSession: (entry, opts) => {
      const base = `finalize-live:${entry.id}:${opts.elapsedMs}:${opts.note || ""}:${opts.completionDifficulty || ""}:${opts.deferTimeGoalXp ? "defer" : "award"}`;
      calls.push(opts.completedAtMs != null ? `${base}:${opts.completedAtMs}` : base);
    },
    applyPendingTimeGoalXpForTask: (taskId) => calls.push(`apply-pending:${taskId || ""}`),
    getElapsedMs: () => overrides.elapsedMs ?? 345,
    getTaskElapsedMs: () => 678,
    clearCheckpointBaseline: (taskId) => calls.push(`clear-checkpoint:${taskId}`),
    resetCheckpointAlertTracking: (taskId) => calls.push(`reset-checkpoint:${taskId}`),
    setCheckpointAutoResetDirty: (dirty) => calls.push(`checkpoint-dirty:${dirty}`),
    clearFocusSessionDraft: (taskId) => calls.push(`clear-focus-draft:${taskId}`),
    getFocusModeTaskId: () => (Object.prototype.hasOwnProperty.call(overrides, "focusTaskId") ? overrides.focusTaskId || null : null),
    syncFocusSessionNotesInput: (taskId) => calls.push(`sync-focus-input:${taskId}`),
    syncFocusSessionNotesAccordion: (taskId) => calls.push(`sync-focus-accordion:${taskId}`),
    getCurrentAppPage: () => overrides.appPage || "tasks",
    getAutoFocusOnTaskLaunchEnabled: () => overrides.autoFocus ?? false,
    openFocusMode: (index) => calls.push(`open-focus:${index}`),
    save: (opts) => calls.push(`save:${opts?.forceCloudFlush === true ? "force" : "queued"}`),
    render: () => calls.push("render"),
    renderDashboardWidgets: () => calls.push("dashboard"),
    syncSharedTaskSummariesForTask: vi.fn(async (taskId: string) => {
      calls.push(`sync-shared:${taskId}`);
    }),
  });
  const lifecycle = createTaskTimerLifecycle({
    getTasks: () => tasks,
    getHistoryByTaskId: () => overrides.historyByTaskId || {},
    getTaskDisplayName: (entry) => String(entry?.name || "Unnamed task"),
    confirm: (title, text, opts) => {
      calls.push(`confirm:${title}:${text}`);
      confirmOptions.push(opts);
    },
    closeConfirm: () => calls.push("close-confirm"),
    addTaskAlreadyRunningConfirmClass: () => calls.push("add-running-confirm-class"),
    removeTaskAlreadyRunningConfirmClass: () => calls.push("remove-running-confirm-class"),
    commands,
    nowMs: () => overrides.nowMs ?? 123,
  });
  return { lifecycle, tasks, calls, confirmOptions };
}

describe("task timer lifecycle", () => {
  it("starts a stopped task and opens focus mode when configured", () => {
    const harness = createHarness({ autoFocus: true });

    harness.lifecycle.startTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: true, startMs: 123, hasStarted: true, resumePendingSinceDayKey: null });
    expect(harness.calls).toEqual([
      "clear-goal:task-1",
      "flush-note:task-1",
      "open-reward:task-1:123",
      "upsert-live:task-1:0:0:force",
      "show-native:task-1:123:0",
      "clear-checkpoint:task-1",
      "save:force",
      "sync-shared:task-1",
      "render",
      "open-focus:0",
    ]);
  });

  it("does not start a goal-completed task when today's goal history is missing", () => {
    const harness = createHarness({
      tasks: [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: "1970-01-01",
          timeGoalCompletedAtMs: 123,
          timeGoalCompletedReason: "goal",
        }),
      ],
    });

    harness.lifecycle.startTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: false, startMs: null });
    expect(harness.calls).toEqual([]);
  });

  it("does not start a goal-completed task with qualifying history today", () => {
    const harness = createHarness({
      tasks: [
        task({
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          timeGoalCompletedDayKey: "1970-01-01",
          timeGoalCompletedAtMs: 123,
          timeGoalCompletedReason: "goal",
        }),
      ],
      historyByTaskId: {
        "task-1": [{ ts: 123, ms: 60 * 60 * 1000, name: "Focus" }],
      },
    });

    harness.lifecycle.startTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: false, startMs: null });
    expect(harness.calls).toEqual([]);
  });

  it("starts a reset-completed task again on the same day", () => {
    const harness = createHarness({
      tasks: [
        task({
          timeGoalCompletedDayKey: "1970-01-01",
          timeGoalCompletedAtMs: 123,
          timeGoalCompletedReason: "reset",
          timeGoalCompletedElapsedMs: 30 * 60 * 1000,
        }),
      ],
    });

    harness.lifecycle.startTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: true, startMs: 123, hasStarted: true, resumePendingSinceDayKey: null });
    expect(harness.calls).toContain("upsert-live:task-1:0:0:force");
  });

  it("preserves resumed elapsed in the live session when restarting a stopped task", () => {
    const harness = createHarness({ tasks: [task({ accumulatedMs: 5 * 60 * 1000, hasStarted: true })] });

    harness.lifecycle.startTask(0);

    expect(harness.calls).toContain("upsert-live:task-1:0:300000:force");
    expect(harness.calls).toContain("show-native:task-1:123:300000");
  });

  it("confirms before switching away from another running task", () => {
    const harness = createHarness({
      tasks: [task({ id: "task-1", name: "Running", running: true, startMs: 1 }), task({ id: "task-2", name: "Next" })],
    });

    harness.lifecycle.startTask(1);
    expect(harness.calls.slice(0, 2)).toEqual([
      "add-running-confirm-class",
      "confirm:Task Already Running:Running is currently running. Do you want to stop this timer and launch Next?",
    ]);

    harness.confirmOptions[0]?.onOk();

    expect(harness.tasks[0]).toMatchObject({ running: false, accumulatedMs: 345, startMs: null, resumePendingSinceDayKey: "1970-01-01" });
    expect(harness.tasks[1]).toMatchObject({ running: true, startMs: 123 });
    expect(harness.calls).toContain("close-reward:task-1:123");
    expect(harness.calls).toContain("clear-native:task-1");
    expect(harness.calls).toContain("open-reward:task-2:123");
    expect(harness.calls).toContain("show-native:task-2:123:0");
  });

  it("cancels task-switch confirmation without mutating tasks", () => {
    const running = task({ id: "task-1", name: "Running", running: true, startMs: 1 });
    const next = task({ id: "task-2", name: "Next" });
    const harness = createHarness({ tasks: [running, next] });

    harness.lifecycle.startTask(1);
    harness.confirmOptions[0]?.onCancel?.();

    expect(running.running).toBe(true);
    expect(next.running).toBe(false);
    expect(harness.calls).toEqual([
      "add-running-confirm-class",
      "confirm:Task Already Running:Running is currently running. Do you want to stop this timer and launch Next?",
      "remove-running-confirm-class",
      "close-confirm",
    ]);
  });

  it("stops a running task and refreshes dashboard widgets on the dashboard", () => {
    const harness = createHarness({ tasks: [task({ running: true, startMs: 1 })], appPage: "dashboard" });

    harness.lifecycle.stopTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: false, accumulatedMs: 345, startMs: null, resumePendingSinceDayKey: "1970-01-01" });
    expect(harness.calls).toEqual([
      "clear-goal:task-1",
      "flush-note:task-1",
      "close-reward:task-1:123",
      "finalize-live:task-1:345:::award",
      "clear-native:task-1",
      "clear-checkpoint:task-1",
      "save:force",
      "sync-shared:task-1",
      "render",
      "dashboard",
    ]);
  });

  it("marks a daily time-goal task complete when it is stopped after reaching the goal", () => {
    const harness = createHarness({
      tasks: [
        task({
          running: true,
          startMs: 1,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 0.005,
        }),
      ],
    });

    harness.lifecycle.stopTask(0);

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: 300,
      startMs: null,
      timeGoalCompletedDayKey: "1970-01-01",
      timeGoalCompletedAtMs: 123,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 300,
    });
  });

  it("caps a daily time-goal task left running overnight when stopped after its goal", () => {
    const startMs = new Date(2026, 5, 12, 22, 0, 0).getTime();
    const stopMs = startMs + 9 * 60 * 60 * 1000 + 45 * 60 * 1000;
    const goalMs = 2 * 60 * 60 * 1000;
    const completedAtMs = startMs + goalMs;
    const harness = createHarness({
      nowMs: stopMs,
      elapsedMs: stopMs - startMs,
      tasks: [
        task({
          running: true,
          startMs,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 120,
        }),
      ],
    });

    harness.lifecycle.stopTask(0);

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: goalMs,
      startMs: null,
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: goalMs,
    });
    expect(harness.calls).toContain(`close-reward:task-1:${completedAtMs}`);
    expect(harness.calls).toContain(`finalize-live:task-1:${goalMs}:::award:${completedAtMs}`);
  });

  it("uses remaining goal time when a resumed task reaches its daily goal", () => {
    const accumulatedMs = 30 * 60 * 1000;
    const goalMs = 2 * 60 * 60 * 1000;
    const startMs = new Date(2026, 5, 13, 8, 0, 0).getTime();
    const stopMs = startMs + 5 * 60 * 60 * 1000;
    const completedAtMs = startMs + (goalMs - accumulatedMs);
    const harness = createHarness({
      nowMs: stopMs,
      elapsedMs: accumulatedMs + (stopMs - startMs),
      tasks: [
        task({
          accumulatedMs,
          running: true,
          startMs,
          hasStarted: true,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 120,
        }),
      ],
    });

    harness.lifecycle.stopTask(0);

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: goalMs,
      startMs: null,
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedElapsedMs: goalMs,
    });
    expect(harness.calls).toContain(`finalize-live:task-1:${goalMs}:::award:${completedAtMs}`);
  });

  it("defers XP when a daily time-goal task is stopped before reaching the goal", () => {
    const harness = createHarness({
      tasks: [
        task({
          running: true,
          startMs: 1,
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
        }),
      ],
    });

    harness.lifecycle.stopTask(0);

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: 345,
      startMs: null,
    });
    expect(harness.tasks[0]?.timeGoalCompletedDayKey).toBeUndefined();
    expect(harness.calls).toContain("finalize-live:task-1:345:::defer");
  });

  it("resets task state and syncs focus note UI when the task is focused", () => {
    const harness = createHarness({
      tasks: [
        task({
          running: true,
          startMs: 1,
          accumulatedMs: 55,
          hasStarted: true,
          timeGoalCompletedReason: "reset",
          timeGoalCompletedElapsedMs: 55,
        }),
      ],
      focusTaskId: "task-1",
    });

    harness.lifecycle.resetTaskStateImmediate(harness.tasks[0], { sessionNote: "done", completionDifficulty: 4 });

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: 0,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
      timeGoalCompletedReason: "reset",
      timeGoalCompletedElapsedMs: 55,
    });
    expect(harness.calls).toEqual([
      "flush-note:task-1",
      "apply-pending:task-1",
      "finalize-live:task-1:678:done:4:award",
      "clear-native:task-1",
      "clear-goal:task-1",
      "clear-reward:task-1",
      "reset-checkpoint:task-1",
      "checkpoint-dirty:true",
      "clear-focus-draft:task-1",
      "sync-focus-input:task-1",
      "sync-focus-accordion:task-1",
    ]);
  });

  it("does not finalize history again when resetting an already stopped task", () => {
    const harness = createHarness({
      tasks: [
        task({
          running: false,
          accumulatedMs: 678,
          hasStarted: true,
          resumePendingSinceDayKey: "1970-01-01",
        }),
      ],
    });

    harness.lifecycle.resetTaskStateImmediate(harness.tasks[0], { logHistory: true, sessionNote: "done" });

    expect(harness.tasks[0]).toMatchObject({
      running: false,
      accumulatedMs: 0,
      startMs: null,
      hasStarted: false,
      resumePendingSinceDayKey: null,
    });
    expect(harness.calls).not.toContain("finalize-live:task-1:678:done:");
    expect(harness.calls).toContain("apply-pending:task-1");
  });

  it("resets task state and completes cleanup when live-session finalization throws", () => {
    const calls: string[] = [];
    nativeTimerNotificationMock.calls = calls;
    const entry = task({ running: true, startMs: 1, accumulatedMs: 55, hasStarted: true });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const commands = createTaskTimerLifecycleCommands({
      clearTaskTimeGoalFlow: (taskId) => calls.push(`clear-goal:${taskId}`),
      flushPendingFocusSessionNoteSave: (taskId) => calls.push(`flush-note:${taskId}`),
      openRewardSessionSegment: () => {},
      closeRewardSessionSegment: () => {},
      clearRewardSessionTracker: (taskId) => calls.push(`clear-reward:${taskId}`),
      upsertLiveSession: () => {},
      finalizeLiveSession: () => {
        throw new Error("finalize failed");
      },
      applyPendingTimeGoalXpForTask: (taskId) => calls.push(`apply-pending:${taskId || ""}`),
      getElapsedMs: () => 0,
      getTaskElapsedMs: () => 678,
      clearCheckpointBaseline: () => {},
      resetCheckpointAlertTracking: (taskId) => calls.push(`reset-checkpoint:${taskId}`),
      setCheckpointAutoResetDirty: (dirty) => calls.push(`checkpoint-dirty:${dirty}`),
      clearFocusSessionDraft: (taskId) => calls.push(`clear-focus-draft:${taskId}`),
      getFocusModeTaskId: () => null,
      syncFocusSessionNotesInput: () => {},
      syncFocusSessionNotesAccordion: () => {},
      getCurrentAppPage: () => "tasks",
      getAutoFocusOnTaskLaunchEnabled: () => false,
      openFocusMode: () => {},
      save: () => {},
      render: () => {},
      renderDashboardWidgets: () => {},
      syncSharedTaskSummariesForTask: async () => {},
    });
    const adapter = createTaskTimerLifecycle({
      getTasks: () => [entry],
      getHistoryByTaskId: () => ({}),
      getTaskDisplayName: () => "Focus",
      confirm: () => {},
      closeConfirm: () => {},
      addTaskAlreadyRunningConfirmClass: () => {},
      removeTaskAlreadyRunningConfirmClass: () => {},
      commands,
      nowMs: () => 123,
    });

    expect(() => adapter.resetTaskStateImmediate(entry)).not.toThrow();
    expect(entry).toMatchObject({ running: false, accumulatedMs: 0, startMs: null, hasStarted: false });
    expect(calls).toEqual([
      "flush-note:task-1",
      "apply-pending:task-1",
      "clear-native:task-1",
      "clear-goal:task-1",
      "clear-reward:task-1",
      "reset-checkpoint:task-1",
      "checkpoint-dirty:true",
      "clear-focus-draft:task-1",
    ]);
    expect(consoleError).toHaveBeenCalledWith("Failed to finalize task session", expect.any(Error));
    consoleError.mockRestore();
  });
});
