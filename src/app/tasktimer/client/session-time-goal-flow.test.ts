import { describe, expect, it } from "vitest";
import type { LiveTaskSession, Task } from "../lib/types";
import { getTimeGoalCompletionDayKey } from "../lib/timeGoalCompletion";
import {
  buildTimeGoalCompleteNextTaskOptions,
  didElapsedReachTimeGoalFromBaseline,
  getCheckpointAlertCompletionPriority,
  getTimeGoalCompletionElapsedMs,
  getTimeGoalCompleteMetaMessage,
  markTaskTimeGoalCompletedForResolution,
  resetFocusModeScrollPosition,
  shouldAutoStopDailyTimeGoalTask,
  shouldOpenFocusModeForTimeGoalNextTask,
  shouldSuppressTimeGoalCompletionForTask,
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
  it("resets focus mode and page scroll positions before showing the focus screen", () => {
    const scrollCalls: Array<[number, number]> = [];
    const doc = {
      documentElement: { scrollTop: 250, scrollLeft: 9 },
      body: { scrollTop: 140, scrollLeft: 4 },
      defaultView: {
        scrollTo: (left: number, top: number) => {
          scrollCalls.push([left, top]);
        },
      },
    };
    const focusModeScreen = {
      scrollTop: 320,
      scrollLeft: 18,
      ownerDocument: doc,
      parentElement: {
        scrollTop: 410,
        scrollLeft: 22,
        parentElement: {
          scrollTop: 275,
          scrollLeft: 12,
          parentElement: null,
        },
      },
    } as unknown as HTMLElement;
    const focusModeParent = focusModeScreen.parentElement as HTMLElement;
    const focusModeGrandparent = focusModeParent.parentElement as HTMLElement;

    resetFocusModeScrollPosition(focusModeScreen);

    expect(focusModeScreen.scrollTop).toBe(0);
    expect(focusModeScreen.scrollLeft).toBe(0);
    expect(focusModeParent.scrollTop).toBe(0);
    expect(focusModeParent.scrollLeft).toBe(0);
    expect(focusModeGrandparent.scrollTop).toBe(0);
    expect(focusModeGrandparent.scrollLeft).toBe(0);
    expect(doc.documentElement.scrollTop).toBe(0);
    expect(doc.documentElement.scrollLeft).toBe(0);
    expect(doc.body.scrollTop).toBe(0);
    expect(doc.body.scrollLeft).toBe(0);
    expect(scrollCalls).toEqual([[0, 0]]);
  });

  it("detects a time goal when the first observed baseline is already over the goal", () => {
    expect(didElapsedReachTimeGoalFromBaseline(undefined, 75, 60)).toBe(true);
  });

  it("detects a time goal when elapsed crosses the goal after an earlier baseline", () => {
    expect(didElapsedReachTimeGoalFromBaseline(59, 60, 60)).toBe(true);
  });

  it("does not repeatedly detect a time goal after the baseline is already past the goal", () => {
    expect(didElapsedReachTimeGoalFromBaseline(75, 76, 60)).toBe(false);
  });

  it("does not detect a time goal before elapsed reaches the goal", () => {
    expect(didElapsedReachTimeGoalFromBaseline(undefined, 59, 60)).toBe(false);
  });

  it("does not suppress checkpoint alerts below the time goal", () => {
    expect(
      getCheckpointAlertCompletionPriority({
        prevBaselineSec: 20,
        elapsedWholeSec: 30,
        timeGoalSec: 60,
        taskId: "task-1",
      })
    ).toEqual({
      shouldOpenTimeGoalModal: false,
      reminder: false,
      suppressCheckpointAlertSideEffects: false,
    });
  });

  it("suppresses same-tick checkpoint alerts when elapsed crosses the time goal", () => {
    expect(
      getCheckpointAlertCompletionPriority({
        prevBaselineSec: 59,
        elapsedWholeSec: 60,
        timeGoalSec: 60,
        taskId: "task-1",
      })
    ).toEqual({
      shouldOpenTimeGoalModal: true,
      reminder: false,
      suppressCheckpointAlertSideEffects: true,
    });
  });

  it("suppresses checkpoint alerts when a due time-goal reminder should open", () => {
    expect(
      getCheckpointAlertCompletionPriority({
        prevBaselineSec: 75,
        elapsedWholeSec: 80,
        timeGoalSec: 60,
        taskId: "task-1",
        reminderAtMs: 200,
        nowMs: 250,
      })
    ).toEqual({
      shouldOpenTimeGoalModal: true,
      reminder: true,
      suppressCheckpointAlertSideEffects: true,
    });
  });

  it("does not suppress checkpoint alerts when the task complete modal is already active for the task", () => {
    expect(
      getCheckpointAlertCompletionPriority({
        prevBaselineSec: 59,
        elapsedWholeSec: 60,
        timeGoalSec: 60,
        taskId: "task-1",
        activeTimeGoalModalTaskId: "task-1",
      })
    ).toEqual({
      shouldOpenTimeGoalModal: false,
      reminder: false,
      suppressCheckpointAlertSideEffects: false,
    });
  });

  it("clamps completed elapsed to the configured time goal", () => {
    expect(getTimeGoalCompletionElapsedMs(timeGoalTask({ timeGoalMinutes: 1 }), 61_250)).toBe(60_000);
  });

  it("does not clamp completed elapsed for tasks without a time goal", () => {
    expect(getTimeGoalCompletionElapsedMs(timeGoalTask({ timeGoalEnabled: false, timeGoalMinutes: 0 }), 61_250)).toBe(61_250);
  });

  it("auto-stops a running daily time-goal task once elapsed reaches the goal", () => {
    expect(shouldAutoStopDailyTimeGoalTask(timeGoalTask({ timeGoalMinutes: 1 }), { elapsedMs: 60_000 })).toBe(true);
    expect(shouldAutoStopDailyTimeGoalTask(timeGoalTask({ timeGoalMinutes: 1 }), { elapsedMs: 72_345 })).toBe(true);
  });

  it("does not auto-stop a daily time-goal task before elapsed reaches the goal", () => {
    expect(shouldAutoStopDailyTimeGoalTask(timeGoalTask({ timeGoalMinutes: 1 }), { elapsedMs: 59_999 })).toBe(false);
  });

  it("does not auto-stop weekly time goals", () => {
    expect(shouldAutoStopDailyTimeGoalTask(timeGoalTask({ timeGoalPeriod: "week", timeGoalMinutes: 1 }), { elapsedMs: 60_000 })).toBe(false);
  });

  it("does not auto-stop an already completed daily time-goal task with qualifying history", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const completedToday = getTimeGoalCompletionDayKey(nowValue);
    const entry = timeGoalTask({
      timeGoalCompletedDayKey: completedToday,
      timeGoalCompletedAtMs: nowValue - 60_000,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60_000,
    });

    expect(
      shouldAutoStopDailyTimeGoalTask(entry, {
        elapsedMs: 72_345,
        historyByTaskId: { "task-1": [{ ts: nowValue, name: "Focus", ms: 60_000 }] },
        nowMs: nowValue,
      })
    ).toBe(false);
  });

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

  it("does not suppress completion when today's goal history was deleted", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const completedToday = getTimeGoalCompletionDayKey(nowValue);

    expect(
      shouldSuppressTimeGoalCompletionForTask(
        timeGoalTask({
          timeGoalCompletedDayKey: completedToday,
          timeGoalCompletedAtMs: nowValue - 60_000,
          timeGoalCompletedReason: "goal",
          timeGoalCompletedElapsedMs: 60_000,
        }),
        {
          historyByTaskId: {},
          nowMs: nowValue,
        }
      )
    ).toBe(false);
  });

  it("suppresses completion when today's qualifying goal history still exists", () => {
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const completedToday = getTimeGoalCompletionDayKey(nowValue);

    expect(
      shouldSuppressTimeGoalCompletionForTask(
        timeGoalTask({
          timeGoalCompletedDayKey: completedToday,
          timeGoalCompletedAtMs: nowValue - 60_000,
          timeGoalCompletedReason: "goal",
          timeGoalCompletedElapsedMs: 60_000,
        }),
        {
          historyByTaskId: { "task-1": [{ ts: nowValue, name: "Focus", ms: 60_000 }] },
          nowMs: nowValue,
        }
      )
    ).toBe(true);
  });

  it("updates completion metadata when a stale completion marker is completed again", () => {
    const previousCompletionMs = new Date(2026, 4, 7, 9, 0, 0).getTime();
    const nextCompletionMs = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const entry = timeGoalTask({
      timeGoalCompletedDayKey: getTimeGoalCompletionDayKey(previousCompletionMs),
      timeGoalCompletedAtMs: previousCompletionMs,
      timeGoalCompletedReason: "goal",
      timeGoalCompletedElapsedMs: 60_000,
    });

    markTaskTimeGoalCompletedForResolution(entry, nextCompletionMs, 60_000, { historyByTaskId: {} });

    expect(entry.timeGoalCompletedAtMs).toBe(nextCompletionMs);
    expect(entry.timeGoalCompletedElapsedMs).toBe(60_000);
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
    const nowValue = new Date(2026, 4, 7, 10, 0, 0).getTime();
    const today = getTimeGoalCompletionDayKey(nowValue);
    const options = buildTimeGoalCompleteNextTaskOptions(
      [
        timeGoalTask({ id: "active", name: "Active", running: true }),
        timeGoalTask({ id: "daily", name: "Daily Task", running: false, color: "#ff5252", plannedStartTime: "09:30" }),
        timeGoalTask({ id: "completed", name: "Completed", running: false, timeGoalCompletedDayKey: today, timeGoalCompletedReason: "goal" }),
        timeGoalTask({ id: "weekly", name: "Weekly", running: false, timeGoalPeriod: "week" }),
        timeGoalTask({ id: "no-goal", name: "No Goal", running: false, timeGoalEnabled: false }),
        timeGoalTask({ id: "running", name: "Running", running: true }),
      ],
      {
        activeTaskId: "active",
        historyByTaskId: { completed: [{ ts: nowValue, name: "Completed", ms: 60_000 }] },
        nowMs: nowValue,
      }
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

  it("shows the all-tasks-complete message only when no next tasks remain", () => {
    expect(getTimeGoalCompleteMetaMessage([{ id: "next", name: "Next", color: "#35e8ff", scheduleText: "9:00 AM" }])).toBe("");
    expect(getTimeGoalCompleteMetaMessage([])).toBe("All tasks completed for today!");
  });

  it("reopens focus mode for the chosen next task only when the completed task was focused", () => {
    expect(shouldOpenFocusModeForTimeGoalNextTask("task-1", "task-1")).toBe(true);
    expect(shouldOpenFocusModeForTimeGoalNextTask("task-2", "task-1")).toBe(false);
    expect(shouldOpenFocusModeForTimeGoalNextTask(null, "task-1")).toBe(false);
  });
});
