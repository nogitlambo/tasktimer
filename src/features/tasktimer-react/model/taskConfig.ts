import { sortMilestones } from "@/app/tasktimer/lib/milestones";
import type { Milestone } from "@/app/tasktimer/lib/types";
import { getElapsedMs } from "./selectors";
import {
  normalizeTask,
  type AddTaskDraft,
  type EditTaskDraft,
  type MainMode,
  type TaskConfigDraftBase,
  type TaskConfigMilestoneDraft,
  type TaskConfigValidation,
  type TaskTimerTask,
} from "./types";

function createMilestoneId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nextMilestoneSequence(milestones: TaskConfigMilestoneDraft[]) {
  return milestones.reduce((maxSeq, milestone) => Math.max(maxSeq, Number(milestone.createdSeq || 0)), 0) + 1;
}

function sanitizeWholeNumberInput(value: string, fallback = "0") {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  const parsed = Math.floor(Number(trimmed));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return fallback;
  return String(Math.max(0, parsed));
}

function sanitizeSixtyRangeInput(value: string) {
  const parsed = Math.floor(Number(String(value || "").trim() || "0"));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return "0";
  return String(Math.min(59, Math.max(0, parsed)));
}

function sanitizeHourPartInput(value: string, milestoneTimeUnit: TaskConfigDraftBase["milestoneTimeUnit"]) {
  const parsed = Math.floor(Number(String(value || "").trim() || "0"));
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return "0";
  const max = milestoneTimeUnit === "day" ? 23 : Number.POSITIVE_INFINITY;
  return String(Math.max(0, Math.min(max, parsed)));
}

function sanitizeMilestoneValueInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "0";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return "0";
  return String(Math.max(0, parsed));
}

function sanitizePresetIntervalInput(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "0";
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return "0";
  return String(Math.max(0, parsed));
}

export function getAddTaskDurationMaxForPeriod(unit: AddTaskDraft["durationUnit"], period: AddTaskDraft["durationPeriod"]) {
  if (unit === "hour") return period === "day" ? 24 : 168;
  return period === "day" ? 1440 : 10080;
}

export function formatAddTaskDurationReadout(draft: AddTaskDraft) {
  if (draft.noTimeGoal) return "No time goal set";
  const value = Math.max(0, Math.floor(Number(draft.durationValue || "0") || 0));
  const unit = draft.durationUnit === "minute" ? (value === 1 ? "minute" : "minutes") : value === 1 ? "hour" : "hours";
  const period = draft.durationPeriod === "day" ? "day" : "week";
  return `${value} ${unit} per ${period}`;
}

export function createTaskConfigMilestoneDraft(
  value = "0",
  description = "",
  createdSeq = 1,
  id = createMilestoneId()
): TaskConfigMilestoneDraft {
  return {
    id,
    createdSeq,
    value: sanitizeMilestoneValueInput(value),
    description: String(description || ""),
  };
}

export function normalizeTaskConfigMilestones(milestones: TaskConfigMilestoneDraft[]) {
  const next = (Array.isArray(milestones) ? milestones : []).map((milestone, index) =>
    createTaskConfigMilestoneDraft(
      String(milestone?.value ?? "0"),
      String(milestone?.description || ""),
      Number.isFinite(Number(milestone?.createdSeq)) && Number(milestone?.createdSeq) > 0
        ? Math.floor(Number(milestone.createdSeq))
        : index + 1,
      String(milestone?.id || "") || createMilestoneId()
    )
  );
  return next.sort((left, right) => {
    const leftValue = Number(left.value || 0);
    const rightValue = Number(right.value || 0);
    if (leftValue !== rightValue) return leftValue - rightValue;
    return left.createdSeq - right.createdSeq;
  });
}

export function createDefaultAddTaskDraft(currentMode: MainMode, defaultTaskTimerFormat: TaskConfigDraftBase["milestoneTimeUnit"]): AddTaskDraft {
  return {
    name: "",
    mode: currentMode,
    durationValue: "5",
    durationUnit: "hour",
    durationPeriod: "week",
    noTimeGoal: false,
    milestonesEnabled: false,
    milestoneTimeUnit: defaultTaskTimerFormat,
    milestones: [],
    checkpointSoundEnabled: false,
    checkpointSoundMode: "once",
    checkpointToastEnabled: false,
    checkpointToastMode: "auto5s",
    presetIntervalsEnabled: false,
    presetIntervalValue: "0",
    finalCheckpointAction: "continue",
  };
}

export function normalizeAddTaskDraft(draft: AddTaskDraft): AddTaskDraft {
  const durationUnit = draft.durationUnit === "minute" ? "minute" : "hour";
  const durationValue = sanitizeWholeNumberInput(draft.durationValue, "0");
  const maxDay = getAddTaskDurationMaxForPeriod(durationUnit, "day");
  const canUseDay = Number(durationValue) <= maxDay;
  return {
    ...draft,
    name: String(draft.name || ""),
    mode: draft.mode,
    durationValue,
    durationUnit,
    durationPeriod: canUseDay && draft.durationPeriod === "day" ? "day" : "week",
    noTimeGoal: !!draft.noTimeGoal,
    milestonesEnabled: !!draft.milestonesEnabled,
    milestoneTimeUnit:
      draft.milestoneTimeUnit === "day" || draft.milestoneTimeUnit === "minute" ? draft.milestoneTimeUnit : "hour",
    milestones: normalizeTaskConfigMilestones(draft.milestones),
    checkpointSoundEnabled: !!draft.checkpointSoundEnabled,
    checkpointSoundMode: draft.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!draft.checkpointToastEnabled,
    checkpointToastMode: draft.checkpointToastMode === "manual" ? "manual" : "auto5s",
    presetIntervalsEnabled: !!draft.presetIntervalsEnabled,
    presetIntervalValue: sanitizePresetIntervalInput(draft.presetIntervalValue),
    finalCheckpointAction:
      draft.finalCheckpointAction === "resetLog" || draft.finalCheckpointAction === "resetNoLog"
        ? draft.finalCheckpointAction
        : "continue",
  };
}

export function createEditTaskDraft(task: TaskTimerTask, nowMs: number): EditTaskDraft {
  const elapsedMs = getElapsedMs(task, nowMs);
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    taskId: task.id,
    name: String(task.name || ""),
    mode: task.mode,
    overrideElapsedEnabled: false,
    elapsedDays: String(days),
    elapsedHours: String(hours),
    elapsedMinutes: String(minutes),
    elapsedSeconds: String(seconds),
    milestonesEnabled: !!task.milestonesEnabled,
    milestoneTimeUnit:
      task.milestoneTimeUnit === "day" || task.milestoneTimeUnit === "minute" ? task.milestoneTimeUnit : "hour",
    milestones: normalizeTaskConfigMilestones(
      (Array.isArray(task.milestones) ? sortMilestones(task.milestones.slice()) : []).map((milestone, index) => ({
        id: String(milestone?.id || "") || createMilestoneId(),
        createdSeq:
          Number.isFinite(Number((milestone as Milestone & { createdSeq?: number }).createdSeq)) &&
          Number((milestone as Milestone & { createdSeq?: number }).createdSeq) > 0
            ? Math.floor(Number((milestone as Milestone & { createdSeq?: number }).createdSeq))
            : index + 1,
        value: String(Number(milestone?.hours || 0)),
        description: String(milestone?.description || ""),
      }))
    ),
    checkpointSoundEnabled: !!task.checkpointSoundEnabled,
    checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!task.checkpointToastEnabled,
    checkpointToastMode: task.checkpointToastMode === "manual" ? "manual" : "auto5s",
    presetIntervalsEnabled: !!task.presetIntervalsEnabled,
    presetIntervalValue: String(Math.max(0, Number(task.presetIntervalValue || 0) || 0)),
    finalCheckpointAction:
      task.finalCheckpointAction === "resetLog" || task.finalCheckpointAction === "resetNoLog"
        ? task.finalCheckpointAction
        : "continue",
  };
}

export function normalizeEditTaskDraft(draft: EditTaskDraft): EditTaskDraft {
  const milestoneTimeUnit =
    draft.milestoneTimeUnit === "day" || draft.milestoneTimeUnit === "minute" ? draft.milestoneTimeUnit : "hour";
  return {
    ...draft,
    name: String(draft.name || ""),
    taskId: draft.taskId,
    mode: draft.mode,
    overrideElapsedEnabled: !!draft.overrideElapsedEnabled,
    elapsedDays: sanitizeWholeNumberInput(draft.elapsedDays),
    elapsedHours: sanitizeHourPartInput(draft.elapsedHours, milestoneTimeUnit),
    elapsedMinutes: sanitizeSixtyRangeInput(draft.elapsedMinutes),
    elapsedSeconds: sanitizeSixtyRangeInput(draft.elapsedSeconds),
    milestonesEnabled: !!draft.milestonesEnabled,
    milestoneTimeUnit,
    milestones: normalizeTaskConfigMilestones(draft.milestones),
    checkpointSoundEnabled: !!draft.checkpointSoundEnabled,
    checkpointSoundMode: draft.checkpointSoundMode === "repeat" ? "repeat" : "once",
    checkpointToastEnabled: !!draft.checkpointToastEnabled,
    checkpointToastMode: draft.checkpointToastMode === "manual" ? "manual" : "auto5s",
    presetIntervalsEnabled: !!draft.presetIntervalsEnabled,
    presetIntervalValue: sanitizePresetIntervalInput(draft.presetIntervalValue),
    finalCheckpointAction:
      draft.finalCheckpointAction === "resetLog" || draft.finalCheckpointAction === "resetNoLog"
        ? draft.finalCheckpointAction
        : "continue",
  };
}

export function appendMilestoneDraft<T extends TaskConfigDraftBase>(draft: T): T {
  const next = normalizeTaskConfigMilestones(draft.milestones);
  if (draft.presetIntervalsEnabled) {
    const interval = Number(draft.presetIntervalValue || 0);
    if (interval > 0) {
      const lastValue = next.length ? Number(next[next.length - 1]?.value || 0) : 0;
      next.push(createTaskConfigMilestoneDraft(String(lastValue + interval), "", nextMilestoneSequence(next)));
      return { ...draft, milestones: normalizeTaskConfigMilestones(next) };
    }
  }
  next.push(createTaskConfigMilestoneDraft("0", "", nextMilestoneSequence(next)));
  return { ...draft, milestones: normalizeTaskConfigMilestones(next) };
}

export function updateMilestoneDraft<T extends TaskConfigDraftBase>(
  draft: T,
  milestoneId: string,
  patch: Partial<Pick<TaskConfigMilestoneDraft, "value" | "description">>
): T {
  return {
    ...draft,
    milestones: normalizeTaskConfigMilestones(
      draft.milestones.map((milestone) =>
        milestone.id === milestoneId
          ? {
              ...milestone,
              value: patch.value != null ? sanitizeMilestoneValueInput(patch.value) : milestone.value,
              description: patch.description != null ? String(patch.description) : milestone.description,
            }
          : milestone
      )
    ),
  };
}

export function removeMilestoneDraft<T extends TaskConfigDraftBase>(draft: T, milestoneId: string): T {
  return {
    ...draft,
    milestones: normalizeTaskConfigMilestones(draft.milestones.filter((milestone) => milestone.id !== milestoneId)),
  };
}

function hasNonPositiveMilestone(draft: TaskConfigDraftBase) {
  return draft.milestones.some((milestone) => !(Number(milestone.value || 0) > 0));
}

export function validateAddTaskStep(draftRaw: AddTaskDraft, step: 1 | 2 | 3): TaskConfigValidation {
  const draft = normalizeAddTaskDraft(draftRaw);
  if (step === 1) {
    if (!draft.name.trim()) {
      return { message: "Task name is required", fields: { name: true } };
    }
    return null;
  }
  if (step === 2) {
    if (draft.noTimeGoal) return null;
    if (!(Number(draft.durationValue || 0) > 0)) {
      return { message: "Enter a time amount greater than 0", fields: { duration: true } };
    }
    const maxWeek = getAddTaskDurationMaxForPeriod(draft.durationUnit, "week");
    if (Number(draft.durationValue || 0) > maxWeek) {
      const unitLabel = draft.durationUnit === "minute" ? "minutes" : "hours";
      return { message: `Enter ${maxWeek} ${unitLabel} or less per week`, fields: { duration: true } };
    }
    return null;
  }
  if (draft.milestonesEnabled && draft.milestones.length === 0) {
    return { message: "Add at least 1 checkpoint when Time Checkpoints is enabled", fields: { checkpoints: true } };
  }
  if (draft.milestonesEnabled && hasNonPositiveMilestone(draft)) {
    return {
      message: "Checkpoint times must be greater than 0",
      fields: { checkpoints: true, checkpointRows: true },
    };
  }
  if (draft.milestonesEnabled && draft.presetIntervalsEnabled && !(Number(draft.presetIntervalValue || 0) > 0)) {
    return { message: "Enter a preset interval greater than 0", fields: { presetInterval: true } };
  }
  return null;
}

export function validateAddTaskDraft(draft: AddTaskDraft): TaskConfigValidation {
  return validateAddTaskStep(draft, 1) || validateAddTaskStep(draft, 2) || validateAddTaskStep(draft, 3);
}

export function validateEditTaskDraft(draftRaw: EditTaskDraft): TaskConfigValidation {
  const draft = normalizeEditTaskDraft(draftRaw);
  if (!draft.name.trim()) {
    return { message: "Task name is required", fields: { name: true } };
  }
  if (draft.milestonesEnabled && draft.milestones.length === 0) {
    return { message: "Add at least 1 timer checkpoint before saving.", fields: { checkpoints: true } };
  }
  if (draft.milestonesEnabled && hasNonPositiveMilestone(draft)) {
    return { message: "Checkpoint times must be greater than 0.", fields: { checkpoints: true, checkpointRows: true } };
  }
  if (draft.milestonesEnabled && draft.presetIntervalsEnabled && !(Number(draft.presetIntervalValue || 0) > 0)) {
    return { message: "Enter a preset interval greater than 0.", fields: { presetInterval: true } };
  }
  return null;
}

function buildPersistedMilestones(draft: TaskConfigDraftBase): Milestone[] {
  return sortMilestones(
    normalizeTaskConfigMilestones(draft.milestones).map((milestone) => ({
      id: milestone.id,
      createdSeq: milestone.createdSeq,
      hours: Math.max(0, Number(milestone.value || 0) || 0),
      description: String(milestone.description || ""),
    }))
  );
}

export function buildTaskFromAddDraft(
  draftRaw: AddTaskDraft,
  tasks: TaskTimerTask[],
  createTaskId: () => string
): TaskTimerTask {
  const draft = normalizeAddTaskDraft(draftRaw);
  const nextOrder = tasks.reduce((maxOrder, task) => Math.max(maxOrder, Number(task.order || 0)), 0) + 1;
  return normalizeTask({
    id: createTaskId(),
    name: draft.name.trim(),
    order: nextOrder,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: draft.milestonesEnabled,
    milestoneTimeUnit: draft.milestoneTimeUnit,
    milestones: buildPersistedMilestones(draft),
    hasStarted: false,
    checkpointSoundEnabled: draft.milestonesEnabled && draft.checkpointSoundEnabled,
    checkpointSoundMode: draft.checkpointSoundMode,
    checkpointToastEnabled: draft.milestonesEnabled && draft.checkpointToastEnabled,
    checkpointToastMode: draft.checkpointToastMode,
    finalCheckpointAction: draft.finalCheckpointAction,
    presetIntervalsEnabled: draft.milestonesEnabled && draft.presetIntervalsEnabled,
    presetIntervalValue: Math.max(0, Number(draft.presetIntervalValue || 0) || 0),
    presetIntervalLastMilestoneId: null,
    presetIntervalNextSeq: nextMilestoneSequence(draft.milestones),
    mode: draft.mode,
  } as TaskTimerTask);
}

export function applyEditDraftToTask(task: TaskTimerTask, draftRaw: EditTaskDraft, nowMs: number): TaskTimerTask {
  const draft = normalizeEditTaskDraft(draftRaw);
  const nextTask = normalizeTask({
    ...task,
    name: draft.name.trim(),
    mode: draft.mode,
    milestonesEnabled: draft.milestonesEnabled,
    milestoneTimeUnit: draft.milestoneTimeUnit,
    milestones: buildPersistedMilestones(draft),
    checkpointSoundEnabled: draft.milestonesEnabled && draft.checkpointSoundEnabled,
    checkpointSoundMode: draft.checkpointSoundMode,
    checkpointToastEnabled: draft.milestonesEnabled && draft.checkpointToastEnabled,
    checkpointToastMode: draft.checkpointToastMode,
    finalCheckpointAction: draft.finalCheckpointAction,
    presetIntervalsEnabled: draft.milestonesEnabled && draft.presetIntervalsEnabled,
    presetIntervalValue: Math.max(0, Number(draft.presetIntervalValue || 0) || 0),
    presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ?? null,
    presetIntervalNextSeq: Math.max(task.presetIntervalNextSeq || 1, nextMilestoneSequence(draft.milestones)),
  } as TaskTimerTask);

  if (!draft.overrideElapsedEnabled) return nextTask;

  const days = Math.max(0, Number(draft.elapsedDays || 0) || 0);
  const hours = Math.max(0, Number(draft.elapsedHours || 0) || 0);
  const minutes = Math.max(0, Number(draft.elapsedMinutes || 0) || 0);
  const seconds = Math.max(0, Number(draft.elapsedSeconds || 0) || 0);
  const accumulatedMs = (days * 86400 + hours * 3600 + minutes * 60 + seconds) * 1000;
  return normalizeTask({
    ...nextTask,
    accumulatedMs,
    startMs: task.running ? nowMs : null,
    xpDisqualifiedUntilReset: true,
  } as TaskTimerTask);
}
