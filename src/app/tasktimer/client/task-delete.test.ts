import { describe, expect, it, vi } from "vitest";
import type { DeletedTaskMeta, Task } from "../lib/types";
import type { TaskTimerConfirmOptions } from "./context";
import { createTaskTimerTaskDelete } from "./task-delete";
import { playDeleteAlertAudio } from "./delete-alert-audio";

vi.mock("./delete-alert-audio", () => ({
  playDeleteAlertAudio: vi.fn(),
}));

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    color: "#c9ff24",
    accumulatedMs: 0,
    running: false,
    startMs: null,
    hasStarted: false,
    collapsed: false,
    milestones: [],
    ...overrides,
  } as Task;
}

function createHarness(options: { tasks?: Task[]; focusModeTaskId?: string | null } = {}) {
  let tasks = options.tasks || [task({ id: "task-1", name: "Focus" }), task({ id: "task-2", name: "Plan" })];
  let historyByTaskId: Record<string, unknown[]> = {
    "task-1": [{ ms: 1000 }],
    "task-2": [{ ms: 2000 }],
  };
  let deletedTaskMeta: DeletedTaskMeta = {
    "task-1": { name: "Focus", color: "#c9ff24", deletedAt: 1, status: "deleted" },
  } as DeletedTaskMeta;
  const calls: string[] = [];
  const confirmOptions: TaskTimerConfirmOptions[] = [];
  const confirmOverlay = { classList: { add: vi.fn(), remove: vi.fn() } } as unknown as HTMLElement;

  const api = createTaskTimerTaskDelete({
    getTasks: () => tasks,
    setTasks: (next) => {
      tasks = next;
      calls.push(`setTasks:${next.map((entry) => entry.id).join(",")}`);
    },
    getHistoryByTaskId: () => historyByTaskId,
    setHistoryByTaskId: (next) => {
      historyByTaskId = next;
      calls.push("setHistoryByTaskId");
    },
    getDeletedTaskMeta: () => deletedTaskMeta,
    setDeletedTaskMeta: (next) => {
      deletedTaskMeta = next;
      calls.push("setDeletedTaskMeta");
    },
    getConfirmOverlay: () => confirmOverlay,
    confirm: (title, text, opts) => {
      calls.push(`confirm:${title}:${text}`);
      confirmOptions.push(opts);
    },
    closeConfirm: () => calls.push("closeConfirm"),
    saveHistory: (next) => {
      historyByTaskId = next;
      calls.push(`saveHistory:${Object.keys(next).join(",")}`);
    },
    saveDeletedMeta: (next) => {
      deletedTaskMeta = next;
      calls.push(`saveDeletedMeta:${Object.keys(next).join(",")}`);
    },
    save: (opts) => calls.push(`save:${opts?.deletedTaskIds?.join(",") || ""}`),
    deleteSharedTaskSummariesForTask: vi.fn(async () => calls.push("deleteShared")),
    refreshOwnSharedSummaries: vi.fn(async () => calls.push("refreshShared")),
    getCurrentUid: () => "uid-1",
    getFocusModeTaskId: () => options.focusModeTaskId || null,
    closeFocusMode: () => calls.push("closeFocusMode"),
    showActionConfirmation: (message) => calls.push(`toast:${message}`),
    render: () => calls.push("render"),
  });

  return {
    api,
    calls,
    confirmOptions,
    confirmOverlay,
    get tasks() {
      return tasks;
    },
    get historyByTaskId() {
      return historyByTaskId;
    },
    get deletedTaskMeta() {
      return deletedTaskMeta;
    },
  };
}

describe("createTaskTimerTaskDelete", () => {
  it("removes the confirmed task through the task state setter", () => {
    const harness = createHarness();

    harness.api(0);
    const onOk = harness.confirmOptions[0]?.onOk;
    expect(onOk).toBeTypeOf("function");
    expect(harness.confirmOptions[0]?.altLabel).toBe("Archive");
    onOk?.();

    expect(harness.tasks.map((entry) => entry.id)).toEqual(["task-2"]);
    expect(harness.historyByTaskId).toEqual({ "task-2": [{ ms: 2000 }] });
    expect(harness.deletedTaskMeta).toEqual({});
    expect(harness.calls).toEqual([
      'confirm:Delete "Focus"?:History entries associated with this task will also be permanently deleted (your awarded XP will be preserved). To keep history entries and just remove the task, choose Archive.',
      "setTasks:task-2",
      "saveHistory:task-2",
      "saveDeletedMeta:",
      "save:task-1",
      "deleteShared",
      "refreshShared",
      "render",
      "closeConfirm",
      "toast:Task deleted.",
    ]);
    expect(harness.confirmOverlay.classList.add).toHaveBeenCalledWith("isDeleteTaskConfirm");
    expect(harness.confirmOverlay.classList.remove).toHaveBeenCalledWith("isDeleteTaskConfirm");
    expect(playDeleteAlertAudio).toHaveBeenCalledTimes(1);
  });

  it("archives the task from the delete confirmation alternate action", () => {
    const harness = createHarness({ focusModeTaskId: "task-1" });

    harness.api(0);
    const onAlt = harness.confirmOptions[0]?.onAlt;
    expect(onAlt).toBeTypeOf("function");
    expect(harness.confirmOptions[0]?.altLabel).toBe("Archive");
    expect(harness.confirmOptions[0]?.altButtonClassName).toBe("btn btn-ghost");
    onAlt?.();

    expect(harness.tasks.map((entry) => entry.id)).toEqual(["task-2"]);
    expect(harness.historyByTaskId).toEqual({
      "task-1": [{ ms: 1000 }],
      "task-2": [{ ms: 2000 }],
    });
    expect(harness.deletedTaskMeta["task-1"]).toMatchObject({
      name: "Focus",
      color: "#c9ff24",
      state: "archived",
    });
    expect(harness.calls).toEqual([
      'confirm:Delete "Focus"?:History entries associated with this task will also be permanently deleted (your awarded XP will be preserved). To keep history entries and just remove the task, choose Archive.',
      "setTasks:task-2",
      "setDeletedTaskMeta",
      "saveDeletedMeta:task-1",
      "save:task-1",
      "deleteShared",
      "refreshShared",
      "closeFocusMode",
      "render",
      "closeConfirm",
      "toast:Task archived.",
    ]);
    expect(harness.confirmOverlay.classList.remove).toHaveBeenCalledWith("isDeleteTaskConfirm");
  });

  it("hides the archive option for running tasks", () => {
    const harness = createHarness({ tasks: [task({ id: "task-1", name: "Focus", running: true }), task({ id: "task-2", name: "Plan" })] });

    harness.api(0);

    expect(harness.confirmOptions[0]?.altLabel).toBeNull();
    expect(harness.confirmOptions[0]?.onAlt).toBeNull();
  });
});
