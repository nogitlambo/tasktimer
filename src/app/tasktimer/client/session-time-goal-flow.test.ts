import { describe, expect, it } from "vitest";
import type { LiveTaskSession, Task } from "../lib/types";
import { shouldKeepTimeGoalCompletionFlowForTask, shiftValidDeferredTimeGoalModal } from "./session";

function timeGoalTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: true,
    startMs: Date.now() - 60_000,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    timeGoalEnabled: true,
    timeGoalMinutes: 1,
    ...overrides,
  };
}

function liveSession(overrides: Partial<LiveTaskSession> = {}): LiveTaskSession {
  return {
    sessionId: "session-1",
    taskId: "task-1",
    name: "Focus",
    startedAtMs: Date.now() - 60_000,
    elapsedMs: 60_000,
    updatedAtMs: Date.now(),
    status: "running",
    ...overrides,
  };
}

describe("time goal completion flow guard", () => {
  it("keeps completion available for an active running live session over its goal", () => {
    expect(
      shouldKeepTimeGoalCompletionFlowForTask(timeGoalTask(), {
        elapsedMs: 60_000,
        liveSession: liveSession(),
      })
    ).toBe(true);
  });

  it("does not reopen completion from a stale running task after the live session was cleared", () => {
    expect(
      shouldKeepTimeGoalCompletionFlowForTask(timeGoalTask(), {
        elapsedMs: 60_000,
        liveSession: null,
      })
    ).toBe(false);
  });

  it("ignores live sessions for a different task", () => {
    expect(
      shouldKeepTimeGoalCompletionFlowForTask(timeGoalTask(), {
        elapsedMs: 60_000,
        liveSession: liveSession({ taskId: "other-task" }),
      })
    ).toBe(false);
  });

  it("drops deferred completion entries whose live session is already gone", () => {
    expect(
      shiftValidDeferredTimeGoalModal(
        [{ taskId: "task-1", frozenElapsedMs: 60_000, reminder: true }],
        {
          tasks: [timeGoalTask()],
          liveSessionsByTaskId: {},
        }
      )
    ).toEqual({
      nextPending: null,
      remainingQueue: [],
    });
  });

  it("skips stale deferred entries and keeps the next valid completion", () => {
    const result = shiftValidDeferredTimeGoalModal(
      [
        { taskId: "task-1", frozenElapsedMs: 60_000, reminder: true },
        { taskId: "task-2", frozenElapsedMs: 120_000, reminder: false },
      ],
      {
        tasks: [
          timeGoalTask(),
          timeGoalTask({ id: "task-2", name: "Deep Work", timeGoalMinutes: 2, startMs: Date.now() - 120_000 }),
        ],
        liveSessionsByTaskId: {
          "task-2": liveSession({
            taskId: "task-2",
            sessionId: "session-2",
            name: "Deep Work",
            elapsedMs: 120_000,
            startedAtMs: Date.now() - 120_000,
          }),
        },
      }
    );

    expect(result.nextPending).toEqual({ taskId: "task-2", frozenElapsedMs: 120_000, reminder: false });
    expect(result.remainingQueue).toEqual([]);
  });
});
