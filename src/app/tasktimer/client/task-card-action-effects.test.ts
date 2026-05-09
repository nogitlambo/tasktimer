import { describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import { createTaskCardActionEffects } from "./task-card-action-effects";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
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

function createHarness(overrides: Partial<{ advanced: boolean; social: boolean; uid: string | null; appPage: string }> = {}) {
  const calls: string[] = [];
  const timers: Array<() => void> = [];
  const confirmOptions: Array<{ onOk: () => void }> = [];
  const effects = createTaskCardActionEffects({
    getTasks: () => [task()],
    canUseAdvancedHistory: () => overrides.advanced ?? true,
    canUseSocialFeatures: () => overrides.social ?? true,
    showUpgradePrompt: (featureName) => calls.push(`upgrade:${featureName}`),
    startTask: (index) => calls.push(`start:${index}`),
    stopTask: (index) => calls.push(`stop:${index}`),
    resetTask: (index) => calls.push(`reset:${index}`),
    archiveTask: (index) => calls.push(`archive:${index}`),
    deleteTask: (index) => calls.push(`delete:${index}`),
    openEdit: (index) => calls.push(`edit:${index}`),
    openHistory: (index) => calls.push(`history:${index}`),
    openFocusMode: (index) => calls.push(`focus:${index}`),
    toggleCollapse: (index) => calls.push(`collapse:${index}`),
    openTaskExportModal: (index) => calls.push(`export:${index}`),
    openManualEntry: (taskId) => {
      calls.push(`manual:${taskId}`);
      return true;
    },
    openShareTaskModal: (index) => calls.push(`share:${index}`),
    confirm: (title, text, opts) => {
      calls.push(`confirm:${title}:${text}`);
      confirmOptions.push(opts);
    },
    currentUid: () => (Object.prototype.hasOwnProperty.call(overrides, "uid") ? overrides.uid || null : "user-1"),
    closeConfirm: () => calls.push("close-confirm"),
    deleteSharedTaskSummariesForTask: vi.fn(async (uid: string, taskId: string) => {
      calls.push(`delete-shared:${uid}:${taskId}`);
    }),
    refreshOwnSharedSummaries: vi.fn(async () => {
      calls.push("refresh-own-shared");
    }),
    getCurrentAppPage: () => overrides.appPage ?? "tasks",
    refreshGroupsData: vi.fn(async () => {
      calls.push("refresh-groups");
    }),
    render: () => calls.push("render"),
    broadcastCheckpointAlertMute: (taskId) => calls.push(`mute:${taskId}`),
    stopCheckpointRepeatAlert: () => calls.push("stop-repeat"),
    setTimeoutRef: (handler) => {
      calls.push("timeout");
      timers.push(handler);
    },
  });
  return { effects, calls, timers, confirmOptions };
}

describe("task card action effects", () => {
  it("routes simple task-card actions to injected side effects", () => {
    const harness = createHarness();

    expect(harness.effects.handleAction({ action: "start", taskIndex: 2, taskId: "task-1" })).toBe(true);
    expect(harness.effects.handleAction({ action: "history", taskIndex: 2, taskId: "task-1" })).toBe(true);
    expect(harness.effects.handleAction({ action: "collapse", taskIndex: 2, taskId: "task-1" })).toBe(true);
    expect(harness.effects.handleAction({ action: "archive", taskIndex: 2, taskId: "task-1" })).toBe(true);

    expect(harness.calls).toEqual(["start:2", "history:2", "collapse:2", "archive:2"]);
  });

  it("gates locked actions before side effects run", () => {
    const harness = createHarness({ advanced: false, social: false });

    expect(harness.effects.handleAction({ action: "manualEntry", taskIndex: 0, taskId: "task-1" })).toBe(true);
    expect(harness.effects.handleAction({ action: "shareTask", taskIndex: 0, taskId: "task-1" })).toBe(true);

    expect(harness.calls).toEqual(["upgrade:Manual history entry", "upgrade:Task sharing and friends"]);
    expect(harness.timers).toHaveLength(0);
  });

  it("defers manual entry opening through the injected timer", () => {
    const harness = createHarness();

    harness.effects.handleAction({ action: "manualEntry", taskIndex: 0, taskId: "task-1" });

    expect(harness.calls).toEqual(["timeout"]);
    harness.timers.shift()?.();
    expect(harness.calls).toEqual(["timeout", "manual:task-1"]);
  });

  it("confirms unshare and refreshes friends data when the user confirms on friends page", async () => {
    const harness = createHarness({ appPage: "friends" });

    harness.effects.handleAction({ action: "unshareTask", taskIndex: 0, taskId: "task-1" });
    expect(harness.calls).toEqual(["confirm:Unshare Task:Unshare this task from all friends?"]);

    harness.confirmOptions[0]?.onOk();
    await vi.waitFor(() => {
      expect(harness.calls).toContain("close-confirm");
    });

    expect(harness.calls).toEqual([
      "confirm:Unshare Task:Unshare this task from all friends?",
      "delete-shared:user-1:task-1",
      "refresh-own-shared",
      "refresh-groups",
      "render",
      "close-confirm",
    ]);
  });

  it("closes confirm without unsharing when there is no current user", () => {
    const harness = createHarness({ uid: null });

    harness.effects.handleAction({ action: "unshareTask", taskIndex: 0, taskId: "task-1" });
    harness.confirmOptions[0]?.onOk();

    expect(harness.calls).toEqual(["confirm:Unshare Task:Unshare this task from all friends?", "close-confirm"]);
  });

  it("mutes checkpoint alerts and reports unknown actions", () => {
    const harness = createHarness();

    expect(harness.effects.handleAction({ action: "muteCheckpointAlert", taskIndex: 0, taskId: "task-1" })).toBe(true);
    expect(harness.effects.handleAction({ action: "missing", taskIndex: 0, taskId: "task-1" })).toBe(false);

    expect(harness.calls).toEqual(["mute:task-1", "stop-repeat"]);
  });
});
