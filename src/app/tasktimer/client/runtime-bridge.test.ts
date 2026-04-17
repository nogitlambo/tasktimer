import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Task } from "../lib/types";

const mocks = vi.hoisted(() => ({
  loadPendingPushAction: vi.fn(),
  applyScheduledPushAction: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: () => ({
    currentUser: {
      uid: "user-1",
      email: "architect@example.com",
    },
  }),
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: () => null,
}));

vi.mock("../lib/pushNotifications", () => ({
  loadPendingPushAction: mocks.loadPendingPushAction,
  getTaskTimerPushDeviceId: () => "device-1",
}));

vi.mock("../lib/pushFunctions", () => ({
  applyScheduledPushAction: mocks.applyScheduledPushAction,
}));

import {
  extractLatestCheckpointAlertMuteSignal,
  handleTaskTimerArchieNavigate,
  maybeHandleTaskTimerPendingPushAction,
} from "./runtime-bridge";

describe("runtime-bridge", () => {
  beforeEach(() => {
    mocks.loadPendingPushAction.mockReset();
    mocks.applyScheduledPushAction.mockClear();
  });

  it("routes Archie navigation requests onto app pages and fallback paths", () => {
    const applyAppPage = vi.fn();
    const navigateToAppRoute = vi.fn();

    handleTaskTimerArchieNavigate("/dashboard", { applyAppPage, navigateToAppRoute });
    handleTaskTimerArchieNavigate("/leaderboard", { applyAppPage, navigateToAppRoute });
    handleTaskTimerArchieNavigate("/privacy", { applyAppPage, navigateToAppRoute });

    expect(applyAppPage).toHaveBeenCalledWith("dashboard", { pushNavStack: true, syncUrl: "push" });
    expect(applyAppPage).toHaveBeenCalledWith("leaderboard", { pushNavStack: true, syncUrl: "push" });
    expect(navigateToAppRoute).toHaveBeenCalledWith("/privacy");
  });

  it("applies pending launch-task actions through the extracted handler", async () => {
    mocks.loadPendingPushAction.mockReturnValue({
      actionId: "launchTask",
      taskId: "task-1",
      route: "/tasklaunch",
    });
    const clearPendingPushAction = vi.fn();
    const startTaskByIndex = vi.fn();

    await maybeHandleTaskTimerPendingPushAction({
      getTasks: () => [{ id: "task-1" } as Task],
      clearPendingPushAction,
      startTaskByIndex,
      jumpToTaskById: vi.fn(),
      maybeRestorePendingTimeGoalFlow: vi.fn(),
    });

    expect(clearPendingPushAction).toHaveBeenCalledTimes(1);
    expect(startTaskByIndex).toHaveBeenCalledWith(0);
    expect(mocks.applyScheduledPushAction).toHaveBeenCalledWith({
      actionId: "launchTask",
      taskId: "task-1",
      route: "/tasklaunch",
      deviceId: "device-1",
    });
  });

  it("extracts the latest checkpoint mute signal from device payloads", () => {
    expect(
      extractLatestCheckpointAlertMuteSignal(
        [
          { checkpointAlertMuteTaskId: "task-a", checkpointAlertMuteAtMs: 10 },
          { checkpointAlertMuteTaskId: "task-b", checkpointAlertMuteAtMs: 25 },
        ],
        12
      )
    ).toEqual({
      latestMuteAtMs: 25,
      latestMutedTaskId: "task-b",
    });
  });
});
