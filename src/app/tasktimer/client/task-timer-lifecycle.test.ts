import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { createTaskTimerLifecycle, createTaskTimerLifecycleCommands } from "./task-timer-lifecycle";

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

function createHarness(overrides: Partial<{ tasks: Task[]; appPage: string; focusTaskId: string | null; autoFocus: boolean }> = {}) {
  const calls: string[] = [];
  const confirmOptions: Array<{ onOk: () => void; onCancel?: () => void }> = [];
  const tasks = overrides.tasks || [task()];
  const commands = createTaskTimerLifecycleCommands({
    clearTaskTimeGoalFlow: (taskId) => calls.push(`clear-goal:${taskId}`),
    flushPendingFocusSessionNoteSave: (taskId) => calls.push(`flush-note:${taskId}`),
    openRewardSessionSegment: (entry, startMs) => calls.push(`open-reward:${entry.id}:${startMs}`),
    closeRewardSessionSegment: (entry, endMs) => calls.push(`close-reward:${entry.id}:${endMs}`),
    clearRewardSessionTracker: (taskId) => calls.push(`clear-reward:${taskId}`),
    upsertLiveSession: (entry, opts) => calls.push(`upsert-live:${entry.id}:${opts.elapsedMs}`),
    finalizeLiveSession: (entry, opts) => calls.push(`finalize-live:${entry.id}:${opts.elapsedMs}:${opts.note || ""}:${opts.completionDifficulty || ""}`),
    getElapsedMs: () => 345,
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
    save: () => calls.push("save"),
    render: () => calls.push("render"),
    renderDashboardWidgets: () => calls.push("dashboard"),
    syncSharedTaskSummariesForTask: vi.fn(async (taskId: string) => {
      calls.push(`sync-shared:${taskId}`);
    }),
  });
  const lifecycle = createTaskTimerLifecycle({
    getTasks: () => tasks,
    getTaskDisplayName: (entry) => String(entry?.name || "Unnamed task"),
    confirm: (title, text, opts) => {
      calls.push(`confirm:${title}:${text}`);
      confirmOptions.push(opts);
    },
    closeConfirm: () => calls.push("close-confirm"),
    addTaskAlreadyRunningConfirmClass: () => calls.push("add-running-confirm-class"),
    removeTaskAlreadyRunningConfirmClass: () => calls.push("remove-running-confirm-class"),
    commands,
    nowMs: () => 123,
  });
  return { lifecycle, tasks, calls, confirmOptions };
}

describe("task timer lifecycle", () => {
  it("starts a stopped task and opens focus mode when configured", () => {
    const harness = createHarness({ autoFocus: true });

    harness.lifecycle.startTask(0);

    expect(harness.tasks[0]).toMatchObject({ running: true, startMs: 123, hasStarted: true });
    expect(harness.calls).toEqual([
      "clear-goal:task-1",
      "flush-note:task-1",
      "open-reward:task-1:123",
      "upsert-live:task-1:0",
      "clear-checkpoint:task-1",
      "save",
      "sync-shared:task-1",
      "render",
      "open-focus:0",
    ]);
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

    expect(harness.tasks[0]).toMatchObject({ running: false, accumulatedMs: 345, startMs: null });
    expect(harness.tasks[1]).toMatchObject({ running: true, startMs: 123 });
    expect(harness.calls).toContain("close-reward:task-1:123");
    expect(harness.calls).toContain("open-reward:task-2:123");
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

    expect(harness.tasks[0]).toMatchObject({ running: false, accumulatedMs: 345, startMs: null });
    expect(harness.calls).toEqual([
      "clear-goal:task-1",
      "flush-note:task-1",
      "close-reward:task-1:123",
      "finalize-live:task-1:345::",
      "clear-checkpoint:task-1",
      "save",
      "sync-shared:task-1",
      "render",
      "dashboard",
    ]);
  });

  it("resets task state and syncs focus note UI when the task is focused", () => {
    const harness = createHarness({ tasks: [task({ running: true, startMs: 1, accumulatedMs: 55, hasStarted: true })], focusTaskId: "task-1" });

    harness.lifecycle.resetTaskStateImmediate(harness.tasks[0], { sessionNote: "done", completionDifficulty: 4 });

    expect(harness.tasks[0]).toMatchObject({ running: false, accumulatedMs: 0, startMs: null, hasStarted: false });
    expect(harness.calls).toEqual([
      "flush-note:task-1",
      "finalize-live:task-1:678:done:4",
      "clear-goal:task-1",
      "clear-reward:task-1",
      "reset-checkpoint:task-1",
      "checkpoint-dirty:true",
      "clear-focus-draft:task-1",
      "sync-focus-input:task-1",
      "sync-focus-accordion:task-1",
    ]);
  });

  it("resets task state even when live-session finalization throws", () => {
    const calls: string[] = [];
    const entry = task({ running: true, startMs: 1, accumulatedMs: 55, hasStarted: true });
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
      getTaskDisplayName: () => "Focus",
      confirm: () => {},
      closeConfirm: () => {},
      addTaskAlreadyRunningConfirmClass: () => {},
      removeTaskAlreadyRunningConfirmClass: () => {},
      commands,
      nowMs: () => 123,
    });

    expect(() => adapter.resetTaskStateImmediate(entry)).toThrow("finalize failed");
    expect(entry).toMatchObject({ running: false, accumulatedMs: 0, startMs: null, hasStarted: false });
    expect(calls).toEqual(["flush-note:task-1"]);
  });
});
