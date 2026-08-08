import {
  SCHEDULE_REPAIR_REASON_CODE_VALUES,
  type ScheduleRepairAction,
  type ScheduleRepairCapacity,
  type ScheduleRepairTask,
} from "./scheduleRepairContract";
import { classifyScheduleRepairTask, validateScheduleRepairTargetDay } from "./scheduleRepairClassification";
import type { ScheduleRepairFutureDay } from "./scheduleRepairCandidates";

function safeMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0;
}

function sortedReasonCodes(values: Array<(typeof SCHEDULE_REPAIR_REASON_CODE_VALUES)[number]>) {
  const order = new Map(SCHEDULE_REPAIR_REASON_CODE_VALUES.map((reason, index) => [reason, index]));
  return Array.from(new Set(values)).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function hasSafeTargetDay(input: { task: ScheduleRepairTask; localDate: string; futureDays: ScheduleRepairFutureDay[]; maxScheduleHorizonDays: number }) {
  return input.futureDays.some((day) => day.available !== false
    && day.plannedMinutes + Math.max(0, safeMinutes(input.task.estimatedMinutes) - safeMinutes(input.task.completedMinutes)) <= day.capacityMax
    && validateScheduleRepairTargetDay({ task: input.task, localDate: input.localDate, targetDate: day.date, maxScheduleHorizonDays: input.maxScheduleHorizonDays }).allowed);
}

function actionFor(task: ScheduleRepairTask, type: ScheduleRepairAction["type"], localDate: string, reasonCodes: ScheduleRepairAction["reasonCodes"], toMinutes?: number | null): ScheduleRepairAction {
  const durationMinutes = Math.max(0, safeMinutes(task.estimatedMinutes) - safeMinutes(task.completedMinutes));
  return {
    id: `${type.toLowerCase()}:${task.id}`,
    type,
    taskId: task.id,
    taskVersion: task.taskVersion?.trim() || "unknown",
    fromDate: task.plannedDate || localDate,
    toDate: null,
    fromMinutes: durationMinutes,
    toMinutes: toMinutes ?? null,
    reasonCodes: sortedReasonCodes(reasonCodes),
    selected: true,
    status: "PROPOSED",
  };
}

export function generateScheduleRepairSpecialActions(input: {
  localDate: string;
  tasks: ScheduleRepairTask[];
  remainingCapacity: ScheduleRepairCapacity;
  futureDays: ScheduleRepairFutureDay[];
  selectedTaskIds?: readonly string[];
  maxScheduleHorizonDays?: number;
}) {
  const selectedTaskIds = new Set(input.selectedTaskIds || []);
  const maxScheduleHorizonDays = input.maxScheduleHorizonDays ?? 7;
  const actions: ScheduleRepairAction[] = [];
  for (const task of input.tasks) {
    if (selectedTaskIds.has(task.id) || task.active === false || task.completed) continue;
    const durationMinutes = Math.max(0, safeMinutes(task.estimatedMinutes) - safeMinutes(task.completedMinutes));
    const tooLargeForCapacity = durationMinutes > input.remainingCapacity.remainingRange.max;
    const safeTarget = hasSafeTargetDay({ task, localDate: input.localDate, futureDays: input.futureDays, maxScheduleHorizonDays });
    const classification = classifyScheduleRepairTask(task, input.localDate);
    if (task.requiresClarification && (tooLargeForCapacity || !safeTarget || task.estimatedMinutes == null)) {
      actions.push(actionFor(task, "CLARIFY_TASK", input.localDate, ["TASK_FIXED", "NO_SAFE_MOVE_AVAILABLE"]));
      continue;
    }
    if (task.hardDeadline && tooLargeForCapacity && !safeTarget) {
      actions.push(actionFor(task, "REVIEW_DEADLINE", input.localDate, ["HARD_DEADLINE_PROTECTED", "NO_SAFE_MOVE_AVAILABLE"]));
      continue;
    }
    if (task.partialProgressUseful && durationMinutes > 5 && tooLargeForCapacity && classification.classification !== "UNKNOWN") {
      const suggestedMinutes = Math.max(5, Math.min(durationMinutes - 1, input.remainingCapacity.remainingRange.max));
      actions.push(actionFor(task, "REDUCE_TODAY_TARGET", input.localDate, ["PARTIAL_PROGRESS_USEFUL", "LIMITED_REMAINING_CAPACITY"], suggestedMinutes));
    }
  }
  return actions;
}
