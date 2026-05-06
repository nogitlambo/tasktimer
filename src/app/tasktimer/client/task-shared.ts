import {
  hasLocalDatePassed,
  normalizeLocalDateValue,
  normalizeTaskPlannedStartByDay,
  syncLegacyPlannedStartFields,
} from "../lib/schedule-placement";
import type { Task } from "../lib/types";

function normalizePlannedStartDay(
  raw: unknown
): "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null {
  const value = String(raw || "").trim().toLowerCase();
  return value === "mon" ||
    value === "tue" ||
    value === "wed" ||
    value === "thu" ||
    value === "fri" ||
    value === "sat" ||
    value === "sun"
    ? value
    : null;
}

type TaskTimerSharedTaskContext = {
  createId: () => string;
  getEditTimeGoalDraft?: () => {
    value: number;
    unit: "minute" | "hour";
    period: "day" | "week";
  };
};

export type TaskTimerSharedTaskApi = {
  createId: () => string;
  makeTask: (name: string, order?: number) => Task;
  normalizeLoadedTask: (task: Task) => void;
  ensureMilestoneIdentity: (task: Task) => void;
  deriveCheckpointAlertEnabledState: (task: Task | null | undefined) => { soundEnabled: boolean; toastEnabled: boolean };
  getPresetIntervalValueNum: (task: Task | null | undefined) => number;
  getPresetIntervalNextSeqNum: (task: Task | null | undefined) => number;
  milestoneUnitSec: (task: Task | null | undefined) => number;
  milestoneUnitSuffix: (task: Task | null | undefined) => string;
  hasNonPositiveCheckpoint: (milestones: Task["milestones"] | null | undefined) => boolean;
  formatCheckpointTimeGoalText: (
    task: Task | null | undefined,
    opts?: { timeGoalMinutes?: number | null; forEditDraft?: boolean }
  ) => string;
  isCheckpointAtOrAboveTimeGoal: (
    checkpointHours: number | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ) => boolean;
  hasCheckpointAtOrAboveTimeGoal: (
    milestones: Task["milestones"] | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ) => boolean;
};

function checkpointTimeGoalLimitSec(timeGoalMinutes: number | null | undefined): number {
  const minutes = Number.isFinite(Number(timeGoalMinutes)) ? Math.max(0, Number(timeGoalMinutes)) : 0;
  return minutes > 0 ? minutes * 60 : 0;
}

export function createTaskTimerSharedTask(ctx: TaskTimerSharedTaskContext): TaskTimerSharedTaskApi {
  function makeTask(name: string, order?: number): Task {
    const task: Task = {
      id: ctx.createId(),
      name,
      taskType: "recurring",
      onceOffDay: null,
      onceOffTargetDate: null,
      order: order || 1,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      hasStarted: false,
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: true,
      checkpointToastMode: "auto5s",
      timeGoalAction: "confirmModal",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
      presetIntervalLastMilestoneId: null,
      presetIntervalNextSeq: 1,
      timeGoalEnabled: false,
      timeGoalValue: 0,
      timeGoalUnit: "hour",
      timeGoalPeriod: "week",
      timeGoalMinutes: 0,
      plannedStartDay: null,
      plannedStartByDay: null,
      plannedStartPushRemindersEnabled: true,
    };
    return task;
  }

  function normalizeLoadedTask(task: Task) {
    const taskWithMode = task as Task & {
      mode?: string;
      finalCheckpointAction?: Task["timeGoalAction"];
    };
    delete taskWithMode.mode;
    if (task.milestoneTimeUnit !== "hour" && task.milestoneTimeUnit !== "minute") {
      task.milestoneTimeUnit = "hour";
    }
    task.checkpointSoundEnabled = !!task.checkpointSoundEnabled;
    task.checkpointSoundMode = task.checkpointSoundMode === "repeat" ? "repeat" : "once";
    task.checkpointToastEnabled = !!task.checkpointToastEnabled;
    task.checkpointToastMode = task.checkpointToastMode === "manual" ? "manual" : "auto5s";
    task.timeGoalAction = "confirmModal";
    task.timeGoalEnabled = !!task.timeGoalEnabled;
    task.timeGoalValue = Number.isFinite(Number(task.timeGoalValue)) ? Math.max(0, Number(task.timeGoalValue)) : 0;
    task.timeGoalUnit = task.timeGoalUnit === "minute" ? "minute" : "hour";
    task.timeGoalPeriod = task.timeGoalPeriod === "day" ? "day" : "week";
    task.timeGoalMinutes = Number.isFinite(Number(task.timeGoalMinutes)) ? Math.max(0, Number(task.timeGoalMinutes)) : 0;
    task.taskType = task.taskType === "once-off" ? "once-off" : "recurring";
    task.onceOffDay = task.taskType === "once-off" ? normalizePlannedStartDay(task.onceOffDay) : null;
    task.onceOffTargetDate = task.taskType === "once-off" ? normalizeLocalDateValue(task.onceOffTargetDate) : null;
    task.plannedStartDay = normalizePlannedStartDay(task.plannedStartDay);
    task.plannedStartByDay = normalizeTaskPlannedStartByDay(task.plannedStartByDay);
    if (task.taskType === "once-off" && task.onceOffTargetDate && hasLocalDatePassed(task.onceOffTargetDate)) {
      task.plannedStartDay = null;
      task.plannedStartTime = null;
      task.plannedStartByDay = null;
      task.plannedStartOpenEnded = false;
    }
    syncLegacyPlannedStartFields(task);
    task.plannedStartPushRemindersEnabled = task.plannedStartPushRemindersEnabled !== false;
    ensureMilestoneIdentity(task);
    const derivedAlerts = deriveCheckpointAlertEnabledState(task);
    task.checkpointSoundEnabled = derivedAlerts.soundEnabled;
    task.checkpointToastEnabled = derivedAlerts.toastEnabled;
  }

  function ensureMilestoneIdentity(task: Task) {
    if (!task || !Array.isArray(task.milestones)) return;
    let nextSeq = 1;
    let maxSeq = 0;
    task.milestones.forEach((milestone) => {
      if (!milestone) return;
      if (!milestone.id) milestone.id = ctx.createId();
      milestone.alertsEnabled = milestone.alertsEnabled !== false;
      const milestoneAny = milestone as { createdSeq?: number };
      const createdSeq = Number(milestoneAny.createdSeq ?? 0);
      if (!Number.isFinite(createdSeq) || createdSeq <= 0) {
        milestoneAny.createdSeq = nextSeq++;
      }
      maxSeq = Math.max(maxSeq, Number(milestoneAny.createdSeq ?? 0) || 0);
    });
    const taskAny = task as Task & {
      presetIntervalNextSeq?: number;
      presetIntervalLastMilestoneId?: string | null;
    };
    const presetIntervalNextSeq = Number(taskAny.presetIntervalNextSeq ?? 0);
    const currentNext = Number.isFinite(presetIntervalNextSeq)
      ? Math.max(1, Math.floor(presetIntervalNextSeq))
      : 1;
    taskAny.presetIntervalNextSeq = Math.max(currentNext, maxSeq + 1);
    if (taskAny.presetIntervalLastMilestoneId) {
      const exists = task.milestones.some((milestone) => String(milestone.id || "") === String(taskAny.presetIntervalLastMilestoneId || ""));
      if (!exists) taskAny.presetIntervalLastMilestoneId = null;
    }
  }

  function deriveCheckpointAlertEnabledState(task: Task | null | undefined) {
    const hasEnabledMilestone =
      !!task?.milestonesEnabled &&
      Array.isArray(task.milestones) &&
      task.milestones.some((milestone) => milestone?.alertsEnabled !== false);
    return {
      soundEnabled: hasEnabledMilestone,
      toastEnabled: hasEnabledMilestone,
    };
  }

  function getPresetIntervalValueNum(task: Task | null | undefined) {
    const presetIntervalValue = Number((task as { presetIntervalValue?: number } | null | undefined)?.presetIntervalValue ?? 0);
    return Number.isFinite(presetIntervalValue) ? Math.max(0, presetIntervalValue) : 0;
  }

  function getPresetIntervalNextSeqNum(task: Task | null | undefined) {
    const presetIntervalNextSeq = Number((task as { presetIntervalNextSeq?: number } | null | undefined)?.presetIntervalNextSeq ?? 0);
    return Number.isFinite(presetIntervalNextSeq) ? Math.max(1, Math.floor(presetIntervalNextSeq)) : 1;
  }

  function milestoneUnitSec(task: Task | null | undefined): number {
    if (!task) return 3600;
    if (task.milestoneTimeUnit === "day") return 86400;
    if (task.milestoneTimeUnit === "minute") return 60;
    return 3600;
  }

  function milestoneUnitSuffix(task: Task | null | undefined): string {
    if (!task) return "h";
    if (task.milestoneTimeUnit === "day") return "d";
    if (task.milestoneTimeUnit === "minute") return "m";
    return "h";
  }

  function isCheckpointAtOrAboveTimeGoal(
    checkpointHours: number | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ): boolean {
    const checkpointValue = Number(checkpointHours);
    if (!(checkpointValue > 0)) return false;
    const timeGoalSec = checkpointTimeGoalLimitSec(timeGoalMinutes);
    if (!(timeGoalSec > 0)) return false;
    return checkpointValue * milestoneUnitSeconds >= timeGoalSec;
  }

  function hasCheckpointAtOrAboveTimeGoal(
    milestones: Task["milestones"] | null | undefined,
    milestoneUnitSeconds: number,
    timeGoalMinutes: number | null | undefined
  ): boolean {
    if (!Array.isArray(milestones) || milestones.length === 0) return false;
    return milestones.some((milestone) => isCheckpointAtOrAboveTimeGoal(milestone?.hours, milestoneUnitSeconds, timeGoalMinutes));
  }

  function hasNonPositiveCheckpoint(milestones: Task["milestones"] | null | undefined): boolean {
    if (!Array.isArray(milestones) || milestones.length === 0) return false;
    return milestones.some((milestone) => !(Number(+milestone.hours) > 0));
  }

  function formatCheckpointTimeGoalText(task: Task | null | undefined, opts?: { timeGoalMinutes?: number | null; forEditDraft?: boolean }) {
    const effectiveMinutesRaw =
      opts && Object.prototype.hasOwnProperty.call(opts, "timeGoalMinutes")
        ? Number(opts.timeGoalMinutes)
        : Number(task?.timeGoalMinutes || 0);
    const effectiveMinutes = Number.isFinite(effectiveMinutesRaw) ? Math.max(0, effectiveMinutesRaw) : 0;
    if (!(effectiveMinutes > 0)) return "the current time goal";

    const useEditDraft = !!opts?.forEditDraft;
    const draft = useEditDraft ? ctx.getEditTimeGoalDraft?.() : null;
    const goalUnit = draft ? draft.unit : task?.timeGoalUnit === "minute" ? "minute" : task?.timeGoalUnit === "hour" ? "hour" : null;
    const goalPeriod = draft ? draft.period : task?.timeGoalPeriod === "day" ? "day" : task?.timeGoalPeriod === "week" ? "week" : null;
    const goalValueRaw = draft ? Number(draft.value || 0) : Number(task?.timeGoalValue || 0);
    const goalValue = Number.isFinite(goalValueRaw) ? Math.max(0, goalValueRaw) : 0;

    if (goalUnit && goalPeriod && goalValue > 0) {
      const unitLabel = goalValue === 1 ? goalUnit : `${goalUnit}s`;
      const periodLabel = goalPeriod === "day" ? "per day" : "per week";
      return `${goalValue} ${unitLabel} ${periodLabel}`;
    }

    if (effectiveMinutes % 60 === 0) {
      const hours = effectiveMinutes / 60;
      return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    return `${effectiveMinutes} ${effectiveMinutes === 1 ? "minute" : "minutes"}`;
  }

  return {
    createId: ctx.createId,
    makeTask,
    normalizeLoadedTask,
    ensureMilestoneIdentity,
    deriveCheckpointAlertEnabledState,
    getPresetIntervalValueNum,
    getPresetIntervalNextSeqNum,
    milestoneUnitSec,
    milestoneUnitSuffix,
    hasNonPositiveCheckpoint,
    formatCheckpointTimeGoalText,
    isCheckpointAtOrAboveTimeGoal,
    hasCheckpointAtOrAboveTimeGoal,
  };
}
