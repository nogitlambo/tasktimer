import { describe, expect, it, vi } from "vitest";
import { createTaskDestructiveActionEffects } from "./task-destructive-action-effects";
import type { DeletedTaskMeta, Task } from "../lib/types";

type ConfirmCall = {
  title: string;
  text: string;
  opts: {
    okLabel: string;
    cancelLabel?: string;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    dangerInputMatch?: string;
    onOk: () => void | Promise<void>;
    onCancel?: () => void;
  };
};

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Task 1",
    color: "#fff",
    accumulatedMs: 0,
    running: false,
    startMs: null,
    hasStarted: false,
    collapsed: false,
    milestones: [],
    ...overrides,
  } as Task;
}

function createHarness(overrides: {
  tasks?: Task[];
  history?: Record<string, unknown[]>;
  alsoDelete?: boolean;
  uid?: string | null;
  focusTaskId?: string | null;
  sessionNote?: string;
} = {}) {
  let tasks = overrides.tasks || [createTask()];
  let history = overrides.history || {};
  let deletedMeta: DeletedTaskMeta = { old: { name: "Old", color: null, deletedAt: 1 } };
  const confirmCalls: ConfirmCall[] = [];
  const classes = new Set<string>();
  const calls: string[] = [];
  const deletedSharedTaskIds: string[] = [];
  const syncedTaskIds: string[][] = [];
  const savedTaskOpts: Array<{ deletedTaskIds?: string[] } | undefined> = [];

  const adapter = createTaskDestructiveActionEffects({
    getTasks: () => tasks,
    setTasks: (next) => {
      tasks = next;
      calls.push("setTasks");
    },
    getHistoryByTaskId: () => history,
    setHistoryByTaskId: (next) => {
      history = next;
      calls.push("setHistory");
    },
    setDeletedTaskMeta: (next) => {
      deletedMeta = next;
      calls.push("setDeletedMeta");
    },
    currentUid: () => overrides.uid ?? "uid-1",
    getFocusModeTaskId: () => overrides.focusTaskId ?? null,
    confirm: (title, text, opts) => {
      confirmCalls.push({ title, text, opts });
      calls.push(`confirm:${title}`);
    },
    closeConfirm: () => calls.push("closeConfirm"),
    getConfirmDeleteAllChecked: () => !!overrides.alsoDelete,
    addConfirmOverlayClass: (className) => {
      classes.add(className);
      calls.push(`addClass:${className}`);
    },
    removeConfirmOverlayClass: (className) => {
      classes.delete(className);
      calls.push(`removeClass:${className}`);
    },
    setResetTaskConfirmBusy: (busy, success) => calls.push(`busy:${busy}:${success}`),
    captureResetActionSessionNote: () => overrides.sessionNote || "",
    setFocusSessionDraft: (_taskId, note) => calls.push(`draft:${note}`),
    resetTaskStateImmediate: (task, opts) => {
      task.accumulatedMs = 0;
      calls.push(`resetImmediate:${String(task.id)}:${opts?.sessionNote || ""}`);
    },
    save: (opts) => {
      savedTaskOpts.push(opts);
      calls.push(`save:${JSON.stringify(opts || {})}`);
    },
    saveHistory: (next) => {
      history = next;
      calls.push("saveHistory");
    },
    saveDeletedMeta: (next) => {
      deletedMeta = next;
      calls.push("saveDeletedMeta");
    },
    render: () => calls.push("render"),
    renderDashboardWidgets: () => calls.push("dashboard"),
    closeFocusMode: () => calls.push("closeFocus"),
    deleteSharedTaskSummariesForTask: async (_uid, taskId) => {
      deletedSharedTaskIds.push(taskId);
      calls.push(`deleteShared:${taskId}`);
    },
    refreshOwnSharedSummaries: async () => {
      calls.push("refreshOwnShared");
    },
    syncSharedTaskSummariesForTasks: async (taskIds) => {
      syncedTaskIds.push(taskIds);
      calls.push(`syncShared:${taskIds.join(",")}`);
    },
  });

  return {
    adapter,
    get tasks() {
      return tasks;
    },
    get history() {
      return history;
    },
    get deletedMeta() {
      return deletedMeta;
    },
    confirmCalls,
    classes,
    calls,
    deletedSharedTaskIds,
    syncedTaskIds,
    savedTaskOpts,
  };
}

describe("task destructive action effects", () => {
  it("opens reset confirmation and marks reset confirm state", () => {
    const harness = createHarness();

    harness.adapter.resetTask(0);

    expect(harness.confirmCalls[0]?.title).toBe("Reset Task");
    expect(harness.confirmCalls[0]?.opts.okLabel).toBe("Reset");
    expect(harness.classes.has("isResetTaskConfirm")).toBe(true);
    expect(harness.calls).toContain("busy:false:false");
  });

  it("ignores reset for missing or running tasks", () => {
    const harness = createHarness({ tasks: [createTask({ running: true })] });

    harness.adapter.resetTask(0);
    harness.adapter.resetTask(5);

    expect(harness.confirmCalls).toHaveLength(0);
  });

  it("resets a task, captures session note, and closes focus mode when reset task is focused", async () => {
    const harness = createHarness({ focusTaskId: "task-1", sessionNote: "done" });

    harness.adapter.resetTask(0);
    await harness.confirmCalls[0].opts.onOk();

    expect(harness.calls).toContain("busy:true:false");
    expect(harness.calls).toContain("draft:done");
    expect(harness.calls).toContain("resetImmediate:task-1:done");
    expect(harness.calls).toContain("save:{}");
    expect(harness.calls).toContain("closeFocus");
    expect(harness.classes.has("isResetTaskConfirm")).toBe(false);
  });

  it("clears reset confirm state on cancel", () => {
    const harness = createHarness();

    harness.adapter.resetTask(0);
    harness.confirmCalls[0].opts.onCancel?.();

    expect(harness.classes.has("isResetTaskConfirm")).toBe(false);
    expect(harness.calls).toContain("closeConfirm");
  });

  it("deletes history only and syncs shared summaries for existing tasks", () => {
    const harness = createHarness({
      tasks: [createTask({ id: "a" }), createTask({ id: "b" })],
      history: { a: [{ ms: 1 }], b: [{ ms: 2 }, { ms: 3 }] },
      alsoDelete: false,
    });

    harness.adapter.resetAll();
    harness.confirmCalls[0].opts.onOk();

    expect(harness.history).toEqual({});
    expect(harness.deletedMeta).toEqual({});
    expect(harness.tasks).toHaveLength(2);
    expect(harness.savedTaskOpts).toEqual([undefined]);
    expect(harness.syncedTaskIds).toEqual([["a", "b"]]);
    expect(harness.confirmCalls[1]?.title).toBe("Delete Complete");
    expect(harness.confirmCalls[1]?.text).toBe("3 history entries deleted.");
    expect(harness.classes.has("isResetAllDeleteConfirm")).toBe(true);
  });

  it("deletes all tasks and queues shared summary cleanup for each task", async () => {
    const harness = createHarness({
      tasks: [createTask({ id: "a" }), createTask({ id: "b" })],
      history: { a: [{ ms: 1 }], b: [{ ms: 2 }] },
      alsoDelete: true,
      uid: "uid-1",
    });

    harness.adapter.resetAll();
    harness.confirmCalls[0].opts.onOk();
    await vi.waitFor(() => {
      expect(harness.calls).toContain("refreshOwnShared");
    });

    expect(harness.tasks).toEqual([]);
    expect(harness.savedTaskOpts).toEqual([{ deletedTaskIds: ["a", "b"] }]);
    expect(harness.deletedSharedTaskIds.sort()).toEqual(["a", "b"]);
    expect(harness.confirmCalls[1]?.text).toBe("2 tasks and 2 history entries deleted.");
  });
});
