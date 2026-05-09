import { describe, expect, it } from "vitest";
import type { LiveTaskSession, Task } from "../lib/types";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import {
  buildTimeGoalCompleteNextTaskOptions,
  getTimeGoalCompleteMetaMessage,
  shouldKeepTimeGoalCompletionFlowForTask,
  shiftValidDeferredTimeGoalModal,
} from "./session";

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
    timeGoalPeriod: "day",
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

  it("does not keep completion for a task already completed today", () => {
    const completedToday = getTimeGoalCompletionDayKey();
    expect(
      shouldKeepTimeGoalCompletionFlowForTask(
        timeGoalTask({
          timeGoalCompletedDayKey: completedToday,
          timeGoalCompletedAtMs: Date.now(),
        }),
        {
          elapsedMs: 60_000,
          liveSession: liveSession(),
        }
      )
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

describe("time goal complete next task launcher", () => {
  it("includes only incomplete daily-goal tasks after excluding the active task", () => {
    const today = getTimeGoalCompletionDayKey();
    const options = buildTimeGoalCompleteNextTaskOptions(
      [
        timeGoalTask({ id: "active", name: "Active", running: true }),
        timeGoalTask({ id: "daily", name: "Daily Task", running: false, color: "#ff5252", plannedStartTime: "09:30" }),
        timeGoalTask({ id: "completed", name: "Completed", running: false, timeGoalCompletedDayKey: today }),
        timeGoalTask({ id: "weekly", name: "Weekly", running: false, timeGoalPeriod: "week" }),
        timeGoalTask({ id: "no-goal", name: "No Goal", running: false, timeGoalEnabled: false }),
        timeGoalTask({ id: "running", name: "Running", running: true }),
      ],
      { activeTaskId: "active" }
    );

    expect(options).toEqual([{ id: "daily", name: "Daily Task", color: "#ff5252", scheduleText: "9:30 AM" }]);
  });

  it("uses the accent fallback when a task has no valid assigned color", () => {
    expect(
      buildTimeGoalCompleteNextTaskOptions(
        [timeGoalTask({ id: "daily", name: "Daily Task", running: false, color: "not-a-color" })],
        { fallbackColor: "#00bcd4" }
      )
    ).toEqual([{ id: "daily", name: "Daily Task", color: "#00bcd4", scheduleText: "Unscheduled" }]);
  });

  it("orders scheduled task tiles from earliest to latest and keeps unscheduled tasks last", () => {
    const options = buildTimeGoalCompleteNextTaskOptions([
      timeGoalTask({ id: "late", name: "Late", running: false, plannedStartTime: "17:00" }),
      timeGoalTask({ id: "unscheduled", name: "Unscheduled", running: false }),
      timeGoalTask({ id: "early", name: "Early", running: false, plannedStartTime: "08:15" }),
      timeGoalTask({ id: "midday", name: "Midday", running: false, plannedStartTime: "12:00" }),
    ]);

    expect(options.map((option) => option.id)).toEqual(["early", "midday", "late", "unscheduled"]);
  });

  it("shows the all-tasks-complete message only after a sentiment is selected and no next tasks remain", () => {
    expect(getTimeGoalCompleteMetaMessage(undefined, [])).toBe("");
    expect(getTimeGoalCompleteMetaMessage(3, [{ id: "next", name: "Next", color: "#35e8ff", scheduleText: "9:00 AM" }])).toBe("");
    expect(getTimeGoalCompleteMetaMessage(3, [])).toBe("All tasks completed for today!");
  });
});
