import { describe, expect, it } from "vitest";

import type { SharedTaskImportConfig } from "./friendsStore";
import { buildImportedSharedTask, hasImportedSharedTask } from "./sharedTaskImport";
import { getScheduleTaskDurationMinutesForDay, type ScheduleDay } from "./schedule-placement";
import type { Task } from "./types";

function makeTask(name: string, order: number): Task {
  return {
    id: `task-${order}`,
    name,
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: order,
    order,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    timeGoalEnabled: false,
    timeGoalValue: 0,
    timeGoalUnit: "hour",
    timeGoalPeriod: "week",
    timeGoalMinutes: 0,
    plannedStartByDay: null,
    plannedStartOpenEnded: false,
    plannedStartPushRemindersEnabled: true,
  };
}

function busyTask(id: string, day: ScheduleDay, start: string, minutes: number): Task {
  return {
    ...makeTask(id, Number(id.replace(/\D/g, "")) || 1),
    id,
    timeGoalEnabled: true,
    timeGoalValue: minutes,
    timeGoalUnit: "minute",
    timeGoalPeriod: "day",
    timeGoalMinutes: minutes,
    plannedStartByDay: { [day]: start },
    plannedStartTime: start,
  };
}

function importConfig(overrides: Partial<SharedTaskImportConfig> = {}): SharedTaskImportConfig {
  return {
    name: "Shared Focus",
    color: "#8bd450",
    taskType: "recurring",
    onceOffDay: null,
    plannedStartTime: "09:00",
    plannedStartByDay: { mon: "09:00" },
    plannedStartOpenEnded: false,
    plannedStartPushRemindersEnabled: true,
    splitAcrossProductivityDays: true,
    timeGoalEnabled: true,
    timeGoalValue: 1,
    timeGoalUnit: "hour",
    timeGoalPeriod: "day",
    timeGoalMinutes: 60,
    milestonesEnabled: true,
    milestoneTimeUnit: "hour",
    milestones: [{ id: "owner-ms-1", createdSeq: 1, hours: 0.5, description: "Halfway", alertsEnabled: true }],
    checkpointSoundEnabled: true,
    checkpointSoundMode: "once",
    checkpointToastEnabled: true,
    checkpointToastMode: "auto5s",
    timeGoalAction: "confirmModal",
    finalCheckpointAction: "confirmModal",
    presetIntervalsEnabled: false,
    presetIntervalValue: 0,
    presetIntervalLastMilestoneId: null,
    presetIntervalNextSeq: 2,
    ...overrides,
  };
}

const summary = {
  ownerUid: "friend-1",
  taskId: "owner-task-1",
  shareDocId: "share:friend-1:user-1:owner-task-1",
  taskName: "Shared Focus",
  taskColor: "#8bd450",
};

function build(overrides: Partial<Parameters<typeof buildImportedSharedTask>[0]> = {}) {
  return buildImportedSharedTask({
    summary,
    importConfig: importConfig(),
    existingTasks: [],
    makeTask,
    createId: (() => {
      let seq = 0;
      return () => `new-id-${++seq}`;
    })(),
    optimalProductivityDays: ["mon", "wed"],
    optimalProductivityStartTime: "09:00",
    optimalProductivityEndTime: "12:00",
    importedAtMs: 1234,
    ...overrides,
  });
}

describe("shared task import scheduling", () => {
  it("schedules recurring daily imports on the recipient productivity days", () => {
    const result = build();

    expect(result.status).toBe("scheduled");
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00" });
    expect(result.task.sharedSourceOwnerUid).toBe("friend-1");
    expect(result.task.sharedSourceTaskId).toBe("owner-task-1");
    expect(result.task.milestones[0]?.id).toBe("new-id-1");
  });

  it("ignores an original shared time outside the recipient productivity window", () => {
    const result = build({
      importConfig: importConfig({
        plannedStartTime: "14:00",
        plannedStartByDay: { mon: "14:00" },
      }),
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "12:00",
    });

    expect(result.status).toBe("scheduled");
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00" });
  });

  it("uses the earliest recipient productivity slot even when the original shared time is in-window", () => {
    const result = build({
      importConfig: importConfig({
        plannedStartTime: "10:00",
        plannedStartByDay: { mon: "10:00" },
      }),
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "12:00",
    });

    expect(result.status).toBe("scheduled");
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00" });
  });

  it("schedules owner-unscheduled imports when they have a valid time goal", () => {
    const result = build({
      importConfig: importConfig({
        plannedStartTime: null,
        plannedStartByDay: null,
        plannedStartOpenEnded: true,
      }),
    });

    expect(result.status).toBe("scheduled");
    expect(result.task.plannedStartOpenEnded).toBe(false);
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00" });
  });

  it("moves a conflicting import to the next shared slot inside the productivity window", () => {
    const result = build({
      existingTasks: [busyTask("busy-1", "mon", "09:00", 60), busyTask("busy-2", "wed", "09:00", 60)],
    });

    expect(result.status).toBe("rescheduled");
    expect(result.task.plannedStartByDay).toEqual({ mon: "10:00", wed: "10:00" });
  });

  it("falls back to a shared slot outside the productivity window", () => {
    const result = build({
      existingTasks: [busyTask("busy-1", "mon", "09:00", 180), busyTask("busy-2", "wed", "09:00", 180)],
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "10:00",
    });

    expect(result.status).toBe("rescheduled");
    expect(result.task.plannedStartByDay).toEqual({ mon: "12:00", wed: "12:00" });
  });

  it("imports unscheduled when no fitting slot exists", () => {
    const result = build({
      importConfig: importConfig({ timeGoalValue: 24, timeGoalUnit: "hour", timeGoalMinutes: 24 * 60 }),
      optimalProductivityStartTime: "09:00",
      optimalProductivityEndTime: "23:59",
    });

    expect(result.status).toBe("unscheduled");
    expect(result.task.plannedStartOpenEnded).toBe(true);
    expect(result.task.plannedStartByDay).toBeNull();
  });

  it("splits weekly imports across recipient productivity days", () => {
    const result = build({
      importConfig: importConfig({ timeGoalPeriod: "week", timeGoalMinutes: 121, timeGoalValue: 121, timeGoalUnit: "minute" }),
    });

    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00", wed: "09:00" });
    expect(getScheduleTaskDurationMinutesForDay(result.task, "mon")).toBe(61);
    expect(getScheduleTaskDurationMinutesForDay(result.task, "wed")).toBe(60);
  });

  it("keeps weekly imports on one recipient productivity day when split is disabled", () => {
    const result = build({
      importConfig: importConfig({
        timeGoalPeriod: "week",
        timeGoalMinutes: 120,
        timeGoalValue: 2,
        splitAcrossProductivityDays: false,
      }),
    });

    expect(result.task.splitAcrossProductivityDays).toBe(false);
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00" });
    expect(getScheduleTaskDurationMinutesForDay(result.task, "mon")).toBe(120);
  });

  it("places once-off imports on the first recipient productivity day", () => {
    const result = build({
      importConfig: importConfig({ taskType: "once-off", timeGoalPeriod: "day" }),
      optimalProductivityDays: ["fri", "mon"],
      nowDate: new Date(2026, 5, 30),
    });

    expect(result.task.taskType).toBe("once-off");
    expect(result.task.onceOffDay).toBe("mon");
    expect(result.task.onceOffTargetDate).toBe("2026-07-06");
    expect(result.task.plannedStartByDay).toEqual({ mon: "09:00" });
  });

  it("detects existing imported copies by source owner and task", () => {
    expect(hasImportedSharedTask([{ ...makeTask("Existing", 1), sharedSourceOwnerUid: "friend-1", sharedSourceTaskId: "owner-task-1" }], "friend-1", "owner-task-1")).toBe(true);
  });
});
