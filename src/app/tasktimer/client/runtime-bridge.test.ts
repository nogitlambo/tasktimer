import { beforeEach, describe, expect, it, vi } from "vitest";
import { maybeHandleTaskTimerPendingPushAction } from "./runtime-bridge";
import type { Task } from "../lib/types";

const runtimeBridgeMocks = vi.hoisted(() => ({
  pending: null as null | { taskId: string; route: string; actionId: string; sourceNotificationId?: number; dispatchNonce?: string },
  uid: "user-1",
  sourceNotifications: [] as Array<{ taskId: string; sourceNotificationId: unknown }>,
  appliedActions: [] as Array<{ actionId: string; taskId: string; route?: string; deviceId?: string }>,
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => ({ currentUser: runtimeBridgeMocks.uid ? { uid: runtimeBridgeMocks.uid } : null }),
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: () => null,
}));

vi.mock("../lib/pushNotifications", () => ({
  getTaskTimerPushDeviceId: () => "device-1",
  loadPendingPushAction: () => runtimeBridgeMocks.pending,
}));

vi.mock("../lib/pushFunctions", () => ({
  applyScheduledPushAction: vi.fn(async (input) => {
    runtimeBridgeMocks.appliedActions.push(input);
    return { ok: true };
  }),
}));

vi.mock("../lib/nativeTimerNotification", () => ({
  setPendingRunningTimerSourceNotification: vi.fn((taskId, sourceNotificationId) => {
    runtimeBridgeMocks.sourceNotifications.push({ taskId, sourceNotificationId });
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

describe("runtime bridge push actions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    runtimeBridgeMocks.pending = null;
    runtimeBridgeMocks.uid = "user-1";
    runtimeBridgeMocks.sourceNotifications = [];
    runtimeBridgeMocks.appliedActions = [];
    vi.stubGlobal("window", {
      setTimeout: vi.fn(),
    });
  });

  it("opens default push taps without starting the task", async () => {
    const calls: string[] = [];
    runtimeBridgeMocks.pending = { taskId: "task-1", route: "/tasklaunch", actionId: "default" };

    await maybeHandleTaskTimerPendingPushAction({
      getTasks: () => [task()],
      clearPendingPushAction: () => calls.push("clear"),
      startTaskByIndex: (index) => calls.push(`start:${index}`),
      jumpToTaskById: (taskId) => calls.push(`jump:${taskId}`),
      maybeRestorePendingTimeGoalFlow: () => calls.push("restore-flow"),
    });

    expect(calls).toEqual(["clear", "jump:task-1", "restore-flow"]);
    expect(runtimeBridgeMocks.appliedActions).toEqual([]);
    expect(runtimeBridgeMocks.sourceNotifications).toEqual([]);
  });

  it("starts launch actions and preserves the source notification id for native replacement", async () => {
    const calls: string[] = [];
    const storedValues = new Map<string, string>();
    runtimeBridgeMocks.pending = {
      taskId: "task-1",
      route: "/tasklaunch",
      actionId: "launchTask",
      sourceNotificationId: 123,
      dispatchNonce: "message-1|task-1|launchTask|123|0",
    };
    vi.stubGlobal("window", {
      setTimeout: vi.fn(),
      localStorage: {
        setItem: vi.fn((key: string, value: string) => storedValues.set(key, value)),
        removeItem: vi.fn(),
      },
    });

    await maybeHandleTaskTimerPendingPushAction({
      getTasks: () => [task()],
      clearPendingPushAction: () => calls.push("clear"),
      startTaskByIndex: (index) => calls.push(`start:${index}`),
      jumpToTaskById: (taskId) => calls.push(`jump:${taskId}`),
      maybeRestorePendingTimeGoalFlow: () => calls.push("restore-flow"),
    });

    expect(calls).toEqual(["clear", "start:0"]);
    expect(runtimeBridgeMocks.sourceNotifications).toEqual([{ taskId: "task-1", sourceNotificationId: 123 }]);
    expect(runtimeBridgeMocks.appliedActions).toEqual([
      { actionId: "launchTask", taskId: "task-1", route: "/tasklaunch", deviceId: "device-1" },
    ]);
    expect(storedValues.get("taskticker_tasks_v1:lastNativePushDispatch")).toBe("message-1|task-1|launchTask|123|0");
  });
});
