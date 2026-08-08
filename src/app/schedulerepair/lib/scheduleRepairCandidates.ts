import {
  SCHEDULE_REPAIR_REASON_CODE_VALUES,
  ScheduleRepairGenerationResultSchema,
  type ScheduleRepairAction,
  type ScheduleRepairCapacity,
  type ScheduleRepairRange,
  type ScheduleRepairTask,
} from "./scheduleRepairContract";
import { classifyScheduleRepairTask, validateScheduleRepairTargetDay } from "./scheduleRepairClassification";
import { createNoSafeScheduleRepairResult, evaluateScheduleRepair } from "./scheduleRepairPlanning";
import { generateScheduleRepairSpecialActions } from "./scheduleRepairSpecialActions";

export type ScheduleRepairFutureDay = {
  date: string;
  plannedMinutes: number;
  capacityMax: number;
  available?: boolean;
};

export type ScheduleRepairCandidateConfig = {
  flexibleWeight: number;
  noDeadlineWeight: number;
  lowPriorityWeight: number;
  durationReliefWeight: number;
  dueSoonPenalty: number;
  highPriorityPenalty: number;
  inProgressPenalty: number;
  blockingPenalty: number;
  recentlyMovedPenalty: number;
  targetDayRoomWeight: number;
  maxActions: number;
  maxScheduleHorizonDays: number;
};

export const DEFAULT_SCHEDULE_REPAIR_CANDIDATE_CONFIG: ScheduleRepairCandidateConfig = {
  flexibleWeight: 100,
  noDeadlineWeight: 25,
  lowPriorityWeight: 15,
  durationReliefWeight: 1,
  dueSoonPenalty: 45,
  highPriorityPenalty: 35,
  inProgressPenalty: 80,
  blockingPenalty: 35,
  recentlyMovedPenalty: 25,
  targetDayRoomWeight: 10,
  maxActions: 20,
  maxScheduleHorizonDays: 7,
};

type Candidate = {
  task: ScheduleRepairTask;
  durationMinutes: number;
  score: number;
  targetDay: ScheduleRepairFutureDay | null;
  targetDayRoom: number;
  canRemoveToday: boolean;
  reasonCodes: Array<(typeof SCHEDULE_REPAIR_REASON_CODE_VALUES)[number]>;
};

function safeMinutes(value: unknown) {
  const minutes = Math.floor(Number(value));
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 0;
}

function dayDistance(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function sortedReasonCodes(values: Array<(typeof SCHEDULE_REPAIR_REASON_CODE_VALUES)[number]>) {
  const order = new Map(SCHEDULE_REPAIR_REASON_CODE_VALUES.map((reason, index) => [reason, index]));
  return Array.from(new Set(values)).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function chooseTargetDay(input: {
  task: ScheduleRepairTask;
  localDate: string;
  futureDays: ScheduleRepairFutureDay[];
  maxScheduleHorizonDays: number;
}) {
  return input.futureDays
    .filter((day) => day.available !== false)
    .filter((day) => {
      const distance = dayDistance(input.localDate, day.date);
      return distance != null && distance > 0 && distance <= input.maxScheduleHorizonDays;
    })
    .filter((day) => validateScheduleRepairTargetDay({
      task: input.task,
      localDate: input.localDate,
      targetDate: day.date,
      maxScheduleHorizonDays: input.maxScheduleHorizonDays,
    }).allowed)
    .filter((day) => day.plannedMinutes + safeMinutes(input.task.estimatedMinutes) - safeMinutes(input.task.completedMinutes) <= day.capacityMax)
    .sort((a, b) => a.date.localeCompare(b.date) || (b.capacityMax - b.plannedMinutes) - (a.capacityMax - a.plannedMinutes))[0] || null;
}

function candidateFor(input: {
  task: ScheduleRepairTask;
  localDate: string;
  futureDays: ScheduleRepairFutureDay[];
  config: ScheduleRepairCandidateConfig;
}) : Candidate | null {
  const classification = classifyScheduleRepairTask(input.task, input.localDate);
  if (!classification.movableByDefault || classification.classification === "UNKNOWN" || classification.classification === "FIXED") return null;
  const durationMinutes = Math.max(0, safeMinutes(input.task.estimatedMinutes) - safeMinutes(input.task.completedMinutes));
  if (durationMinutes <= 0) return null;
  const dueDistance = input.task.dueDate ? dayDistance(input.localDate, input.task.dueDate) : null;
  const targetDay = chooseTargetDay({ task: input.task, localDate: input.localDate, futureDays: input.futureDays, maxScheduleHorizonDays: input.config.maxScheduleHorizonDays });
  const canRemoveToday = dueDistance == null || dueDistance > 3;
  const reasonCodes = [...classification.reasonCodes];
  if (targetDay) reasonCodes.push("TARGET_DAY_HAS_ROOM");
  else reasonCodes.push("TARGET_DAY_OVERLOADED");
  let score = 0;
  if (classification.classification === "FLEXIBLE") score += input.config.flexibleWeight;
  if (dueDistance == null) score += input.config.noDeadlineWeight;
  if (input.task.priority === "low") score += input.config.lowPriorityWeight;
  score += durationMinutes * input.config.durationReliefWeight;
  if (dueDistance != null && dueDistance >= 0 && dueDistance <= 3) score -= input.config.dueSoonPenalty;
  if (input.task.priority === "high" || input.task.priority === "urgent") score -= input.config.highPriorityPenalty;
  if (input.task.inProgress) score -= input.config.inProgressPenalty;
  if (input.task.blocksImportantWork) score -= input.config.blockingPenalty;
  if (input.task.recentlyMoved) score -= input.config.recentlyMovedPenalty;
  if (targetDay) score += Math.max(0, targetDay.capacityMax - targetDay.plannedMinutes) * input.config.targetDayRoomWeight / 100;
  return { task: input.task, durationMinutes, score, targetDay, targetDayRoom: targetDay ? targetDay.capacityMax - targetDay.plannedMinutes : 0, canRemoveToday, reasonCodes: sortedReasonCodes(reasonCodes) };
}

function actionFor(candidate: Candidate, localDate: string, selected: boolean): ScheduleRepairAction {
  const taskVersion = candidate.task.taskVersion?.trim() || "unknown";
  const common = {
    id: `${candidate.targetDay ? "move" : "remove"}:${candidate.task.id}`,
    taskId: candidate.task.id,
    taskVersion,
    fromDate: candidate.task.plannedDate || localDate,
    fromMinutes: candidate.durationMinutes,
    reasonCodes: candidate.reasonCodes,
    selected,
    status: "PROPOSED" as const,
  };
  return candidate.targetDay
    ? { ...common, type: "MOVE_TO_LATER_DAY" as const, toDate: candidate.targetDay.date, toMinutes: null }
    : { ...common, type: "REMOVE_FROM_TODAY" as const, toDate: null, toMinutes: null };
}

export function generateScheduleRepairCandidates(input: {
  localDate: string;
  tasks: ScheduleRepairTask[];
  remainingCapacity: ScheduleRepairCapacity;
  futureDays: ScheduleRepairFutureDay[];
  dailyBriefFallbackRange?: ScheduleRepairRange | null;
  config?: Partial<ScheduleRepairCandidateConfig>;
}) {
  const config = { ...DEFAULT_SCHEDULE_REPAIR_CANDIDATE_CONFIG, ...input.config };
  const activeTasks = input.tasks.filter((task) => task.active !== false && !task.completed);
  const knownDurationTaskCount = activeTasks.filter((task) => task.estimatedMinutes != null).length;
  const remainingPlannedMinutes = activeTasks.reduce((sum, task) => sum + Math.max(0, safeMinutes(task.estimatedMinutes) - safeMinutes(task.completedMinutes)), 0);
  const evaluated = evaluateScheduleRepair({
    localDate: input.localDate,
    activeTaskCount: activeTasks.length,
    knownDurationTaskCount,
    remainingPlannedMinutes,
    adaptiveCapacity: input.remainingCapacity,
    dailyBriefFallbackRange: input.dailyBriefFallbackRange,
  });
  if (evaluated.outcome !== "REPAIR_REQUIRED") {
    return ScheduleRepairGenerationResultSchema.parse({ evaluation: evaluated, actions: [], estimatedPlannedMinutesAfter: remainingPlannedMinutes, relievedMinutes: 0 });
  }
  const candidates = activeTasks
    .map((task) => candidateFor({ task, localDate: input.localDate, futureDays: input.futureDays, config }))
    .filter((candidate): candidate is Candidate => candidate != null && (candidate.targetDay != null || candidate.canRemoveToday))
    .sort((a, b) => b.score - a.score || b.durationMinutes - a.durationMinutes || a.task.id.localeCompare(b.task.id));
  const actions: ScheduleRepairAction[] = [];
  let relievedMinutes = 0;
  for (const candidate of candidates) {
    if (actions.length >= config.maxActions || remainingPlannedMinutes - relievedMinutes <= evaluated.remainingCapacity.remainingRange.max) break;
    actions.push(actionFor(candidate, input.localDate, true));
    relievedMinutes += candidate.durationMinutes;
  }
  const specialActions = generateScheduleRepairSpecialActions({
    localDate: input.localDate,
    tasks: activeTasks,
    remainingCapacity: evaluated.remainingCapacity,
    futureDays: input.futureDays,
    selectedTaskIds: actions.map((action) => action.taskId),
    maxScheduleHorizonDays: config.maxScheduleHorizonDays,
  });
  for (const action of specialActions) {
    if (actions.length >= config.maxActions) break;
    actions.push(action);
    if (action.type === "REDUCE_TODAY_TARGET" && action.toMinutes != null && action.fromMinutes != null) relievedMinutes += Math.max(0, action.fromMinutes - action.toMinutes);
  }
  if (!actions.length) {
    const noSafe = createNoSafeScheduleRepairResult(evaluated);
    return ScheduleRepairGenerationResultSchema.parse({ evaluation: noSafe, actions: [], estimatedPlannedMinutesAfter: remainingPlannedMinutes, relievedMinutes: 0 });
  }
  return ScheduleRepairGenerationResultSchema.parse({
    evaluation: evaluated,
    actions,
    estimatedPlannedMinutesAfter: Math.max(0, remainingPlannedMinutes - relievedMinutes),
    relievedMinutes,
  });
}
