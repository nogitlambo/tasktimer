import {
  SCHEDULE_REPAIR_CLASSIFICATION_VALUES,
  ScheduleRepairConstraintResultSchema,
  ScheduleRepairTaskClassificationSchema,
  type ScheduleRepairConstraint,
  type ScheduleRepairReasonCode,
  type ScheduleRepairTask,
  type ScheduleRepairTaskClassification,
} from "./scheduleRepairContract";

type Classification = (typeof SCHEDULE_REPAIR_CLASSIFICATION_VALUES)[number];

function dayDistance(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function isPlannedToday(task: ScheduleRepairTask, localDate: string) {
  return !task.plannedDate || task.plannedDate === localDate;
}

function pushReason(reasons: ScheduleRepairReasonCode[], reason: ScheduleRepairReasonCode) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function classifyScheduleRepairTask(task: ScheduleRepairTask, localDate: string): ScheduleRepairTaskClassification {
  const reasons: ScheduleRepairReasonCode[] = [];
  const dueDistance = task.dueDate ? dayDistance(localDate, task.dueDate) : null;
  const plannedToday = isPlannedToday(task, localDate);
  const fixed = task.hardDeadline && (dueDistance != null && dueDistance <= 0) || task.pinned && plannedToday || task.inProgress && plannedToday;
  if (task.hardDeadline) pushReason(reasons, "HARD_DEADLINE_PROTECTED");
  if (task.pinned) pushReason(reasons, "TASK_PINNED");
  if (task.inProgress) pushReason(reasons, "TASK_IN_PROGRESS");
  if (task.blocksImportantWork) pushReason(reasons, "TASK_BLOCKING");
  if (task.priority === "high" || task.priority === "urgent") pushReason(reasons, "TASK_FIXED");
  if (dueDistance != null && dueDistance >= 0 && dueDistance <= 3) pushReason(reasons, "TASK_DUE_SOON");
  if (dueDistance == null) pushReason(reasons, "TASK_NO_NEAR_DEADLINE");
  if (task.priority === "low") pushReason(reasons, "TASK_LOW_PRIORITY");

  let classification: Classification = "UNKNOWN";
  if (!task.editable || task.estimatedMinutes == null || task.active === false || task.completed) {
    classification = "UNKNOWN";
  } else if (fixed || (task.priority === "high" && task.hardDeadline) || task.dependencySensitive && plannedToday) {
    classification = "FIXED";
  } else if (task.priority === "high" || task.priority === "urgent" || task.dependencySensitive || task.recentlyMoved || dueDistance != null && dueDistance >= 0 && dueDistance <= 3) {
    classification = "LIMITED";
  } else if (task.flexible === true && !task.pinned && !task.blocksImportantWork && (dueDistance == null || dueDistance > 3)) {
    classification = "FLEXIBLE";
  }
  if (classification === "FIXED") pushReason(reasons, "TASK_FIXED");
  if (classification === "FLEXIBLE") pushReason(reasons, "TASK_FLEXIBLE");
  return ScheduleRepairTaskClassificationSchema.parse({
    taskId: task.id,
    classification,
    movableByDefault: classification === "FLEXIBLE" || classification === "LIMITED",
    reasonCodes: reasons,
  });
}

export function classifyScheduleRepairTasks(tasks: ScheduleRepairTask[], localDate: string) {
  return tasks.map((task) => classifyScheduleRepairTask(task, localDate));
}

export function validateScheduleRepairTargetDay(input: {
  task: ScheduleRepairTask;
  requestingUid?: string | null;
  localDate: string;
  targetDate: string;
  unavailableDates?: readonly string[];
  maxScheduleHorizonDays?: number;
}) {
  const violations: ScheduleRepairConstraint[] = [];
  const task = input.task;
  const targetDistance = dayDistance(input.localDate, input.targetDate);
  if (task.ownerUid && input.requestingUid && task.ownerUid !== input.requestingUid) violations.push("TASK_NOT_OWNED");
  if (task.editable === false) violations.push("TASK_NOT_EDITABLE");
  if (task.completed) violations.push("TASK_COMPLETED");
  if (task.active === false) violations.push("TASK_INACTIVE");
  if (task.hardDeadline && task.dueDate && dayDistance(input.targetDate, task.dueDate) != null && (dayDistance(input.targetDate, task.dueDate) as number) < 0) violations.push("HARD_DEADLINE");
  if (task.pinned && task.plannedDate === input.localDate && input.targetDate !== input.localDate) violations.push("TASK_PINNED");
  if (task.recurrenceLocked && task.plannedDate && task.plannedDate !== input.targetDate) violations.push("RECURRENCE_RULE");
  if (task.allowedTargetDates && !task.allowedTargetDates.includes(input.targetDate)) violations.push("SCHEDULE_EXCLUSION");
  if (input.unavailableDates?.includes(input.targetDate)) violations.push("UNAVAILABLE_DAY");
  const horizon = Number.isInteger(input.maxScheduleHorizonDays) && (input.maxScheduleHorizonDays as number) >= 0 ? input.maxScheduleHorizonDays as number : 7;
  if (targetDistance == null || targetDistance < 0 || targetDistance > horizon) violations.push("SCHEDULE_HORIZON");
  return ScheduleRepairConstraintResultSchema.parse({ allowed: violations.length === 0, violations: Array.from(new Set(violations)) });
}

export function hasScheduleRepairConstraintViolation(input: Parameters<typeof validateScheduleRepairTargetDay>[0]) {
  return !validateScheduleRepairTargetDay(input).allowed;
}
