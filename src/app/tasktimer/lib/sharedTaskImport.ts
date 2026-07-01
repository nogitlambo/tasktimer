import type { SharedTaskImportConfig, SharedTaskSummary } from "./friendsStore";
import { normalizeOptimalProductivityDays } from "./productivityPeriod";
import {
  buildWeeklyPlannedStartByDay,
  findFirstAvailableScheduleSlotFromProductivityWindow,
  normalizeScheduleStoredTime,
  resolveNextScheduleDayDate,
  setTaskScheduledTimeForDay,
  type ScheduleDay,
} from "./schedule-placement";
import type { Task } from "./types";

export type SharedTaskImportPlacementStatus = "scheduled" | "rescheduled" | "unscheduled";

export type BuildImportedSharedTaskOptions = {
  summary: Pick<SharedTaskSummary, "ownerUid" | "taskId" | "shareDocId" | "taskName" | "taskColor">;
  importConfig: SharedTaskImportConfig;
  existingTasks: Task[];
  makeTask: (name: string, order: number) => Task;
  createId: () => string;
  optimalProductivityDays: unknown;
  optimalProductivityStartTime: unknown;
  optimalProductivityEndTime: unknown;
  nowDate?: Date;
  importedAtMs?: number;
};

export type BuildImportedSharedTaskResult = {
  task: Task;
  status: SharedTaskImportPlacementStatus;
};

export function hasImportedSharedTask(tasks: Task[], ownerUid: string, taskId: string): boolean {
  const normalizedOwnerUid = String(ownerUid || "").trim();
  const normalizedTaskId = String(taskId || "").trim();
  if (!normalizedOwnerUid || !normalizedTaskId) return false;
  return (tasks || []).some(
    (task) =>
      String(task?.sharedSourceOwnerUid || "").trim() === normalizedOwnerUid &&
      String(task?.sharedSourceTaskId || "").trim() === normalizedTaskId
  );
}

function nextTaskOrder(tasks: Task[]): number {
  return ((tasks || []).reduce((max, task) => Math.max(max, Number(task?.order || 0)), 0) || 0) + 1;
}

function cloneImportedMilestones(config: SharedTaskImportConfig, createId: () => string): Task["milestones"] {
  return (config.milestones || []).map((milestone, index) => ({
    id: createId(),
    createdSeq:
      Number.isFinite(Number(milestone.createdSeq)) && Number(milestone.createdSeq) > 0
        ? Math.floor(Number(milestone.createdSeq))
        : index + 1,
    hours: Number.isFinite(Number(milestone.hours)) ? Math.max(0, Number(milestone.hours)) : 0,
    description: String(milestone.description || ""),
    alertsEnabled: milestone.alertsEnabled !== false,
  }));
}

function clearImportedTaskSchedule(task: Task) {
  task.onceOffDay = null;
  task.onceOffTargetDate = null;
  task.plannedStartDay = null;
  task.plannedStartTime = null;
  task.plannedStartByDay = null;
  task.plannedStartOpenEnded = true;
}

function applyRecipientSchedule(task: Task, config: SharedTaskImportConfig, days: ScheduleDay[], plannedStartTime: string, nowDate?: Date) {
  const firstDay = days[0] || "mon";
  task.plannedStartOpenEnded = false;
  task.plannedStartTime = plannedStartTime;
  if (config.taskType === "once-off") {
    task.taskType = "once-off";
    task.onceOffDay = firstDay;
    task.onceOffTargetDate = resolveNextScheduleDayDate(firstDay, nowDate);
    task.plannedStartDay = firstDay;
    task.plannedStartByDay = { [firstDay]: plannedStartTime };
    return;
  }

  task.taskType = "recurring";
  task.onceOffDay = null;
  task.onceOffTargetDate = null;
  task.plannedStartDay = null;
  if (config.timeGoalPeriod === "week" && config.splitAcrossProductivityDays === false) {
    task.splitAcrossProductivityDays = false;
    task.plannedStartByDay = { [firstDay]: plannedStartTime };
    return;
  }
  task.splitAcrossProductivityDays = config.timeGoalPeriod === "week" ? true : undefined;
  task.plannedStartByDay = buildWeeklyPlannedStartByDay(days, plannedStartTime);
}

export function buildImportedSharedTask(options: BuildImportedSharedTaskOptions): BuildImportedSharedTaskResult {
  const { importConfig, existingTasks } = options;
  const name = String(importConfig.name || options.summary.taskName || "").trim() || "Task";
  const task = options.makeTask(name, nextTaskOrder(existingTasks));
  task.name = name;
  task.color = importConfig.color || options.summary.taskColor || null;
  task.taskType = importConfig.taskType;
  task.accumulatedMs = 0;
  task.resumePendingSinceDayKey = null;
  task.running = false;
  task.startMs = null;
  task.collapsed = false;
  task.hasStarted = false;
  task.createdAtMs = options.importedAtMs ?? Date.now();
  task.timeGoalCompletedDayKey = null;
  task.timeGoalCompletedWeekKey = null;
  task.timeGoalCompletedAtMs = null;
  task.timeGoalCompletedReason = null;
  task.timeGoalCompletedElapsedMs = null;
  task.timeGoalEnabled = !!importConfig.timeGoalEnabled;
  task.timeGoalValue = Math.max(0, Number(importConfig.timeGoalValue) || 0);
  task.timeGoalUnit = importConfig.timeGoalUnit === "minute" ? "minute" : "hour";
  task.timeGoalPeriod = importConfig.taskType === "once-off" ? "day" : importConfig.timeGoalPeriod === "day" ? "day" : "week";
  task.timeGoalMinutes = Math.max(0, Number(importConfig.timeGoalMinutes) || 0);
  task.milestonesEnabled = !!importConfig.milestonesEnabled;
  task.milestoneTimeUnit = importConfig.milestoneTimeUnit === "day" || importConfig.milestoneTimeUnit === "minute" ? importConfig.milestoneTimeUnit : "hour";
  task.milestones = cloneImportedMilestones(importConfig, options.createId);
  task.checkpointSoundEnabled = !!importConfig.checkpointSoundEnabled;
  task.checkpointSoundMode = importConfig.checkpointSoundMode === "repeat" ? "repeat" : "once";
  task.checkpointToastEnabled = !!importConfig.checkpointToastEnabled;
  task.checkpointToastMode =
    importConfig.checkpointToastMode === "manual" || importConfig.checkpointToastMode === "auto3s"
      ? importConfig.checkpointToastMode
      : "auto5s";
  task.timeGoalAction = importConfig.timeGoalAction || "confirmModal";
  task.finalCheckpointAction = importConfig.finalCheckpointAction || task.timeGoalAction;
  task.presetIntervalsEnabled = !!importConfig.presetIntervalsEnabled;
  task.presetIntervalValue = Math.max(0, Number(importConfig.presetIntervalValue) || 0);
  task.presetIntervalLastMilestoneId = null;
  task.presetIntervalNextSeq =
    Number.isFinite(Number(importConfig.presetIntervalNextSeq)) && Number(importConfig.presetIntervalNextSeq) > 0
      ? Math.floor(Number(importConfig.presetIntervalNextSeq))
      : 1;
  task.plannedStartPushRemindersEnabled = importConfig.plannedStartPushRemindersEnabled !== false;
  task.sharedSourceOwnerUid = String(options.summary.ownerUid || "").trim() || null;
  task.sharedSourceTaskId = String(options.summary.taskId || "").trim() || null;
  task.sharedSourceShareDocId = String(options.summary.shareDocId || "").trim() || null;
  task.sharedSourceImportedAtMs = options.importedAtMs ?? Date.now();

  const hasScheduleDuration = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0;
  const days = normalizeOptimalProductivityDays(options.optimalProductivityDays) as ScheduleDay[];
  if (!hasScheduleDuration || days.length === 0) {
    clearImportedTaskSchedule(task);
    return { task, status: "unscheduled" };
  }

  const productivityStartTime = normalizeScheduleStoredTime(options.optimalProductivityStartTime) || "00:00";
  applyRecipientSchedule(task, importConfig, days, productivityStartTime, options.nowDate);
  const slot = findFirstAvailableScheduleSlotFromProductivityWindow(existingTasks, task, {
    optimalProductivityStartTime: options.optimalProductivityStartTime,
    optimalProductivityEndTime: options.optimalProductivityEndTime,
    allowOutsideProductivityWindow: true,
  });
  if (!slot) {
    clearImportedTaskSchedule(task);
    return { task, status: "unscheduled" };
  }
  slot.days.forEach((day) => setTaskScheduledTimeForDay(task, day, slot.time));
  return {
    task,
    status: slot.source === "productivityWindow" && slot.time === productivityStartTime ? "scheduled" : "rescheduled",
  };
}
