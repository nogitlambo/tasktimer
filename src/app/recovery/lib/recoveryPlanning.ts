import type { NextBestActionCandidate, RankedNextBestActionCandidate } from "@/app/nextbestaction/lib/nextBestActionRanking";
import { rankNextBestActionCandidates } from "@/app/nextbestaction/lib/nextBestActionRanking";

import {
  RECOVERY_REASON_CODE_VALUES,
  RecoveryBacklogPlanSchema,
  RecoveryTaskClassificationSchema,
  type RecoveryBacklogPlan,
  type RecoveryClassification,
  type RecoveryReasonCode,
  type RecoveryTaskClassification,
  type RecoveryVisibleTaskLimits,
} from "./recoveryContract";

export type RecoveryBacklogTask = {
  taskId: string;
  taskVersion: string;
  title: string;
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent" | null;
  hardDeadline: boolean;
  pinned: boolean;
  inProgress: boolean;
  blocksImportantWork: boolean;
  flexible: boolean;
  stale: boolean;
  requiresClarification: boolean;
  carriedOver: boolean;
  recentlyMoved: boolean;
  postponementCount: number;
  nextBestActionCandidate: NextBestActionCandidate | null;
};

export type RecoveryPlanningConfig = RecoveryVisibleTaskLimits & {
  shortRestartMinutes: number;
};

export const DEFAULT_RECOVERY_PLANNING_CONFIG: RecoveryPlanningConfig = {
  attention: 3,
  flexible: 3,
  shortRestartMinutes: 20,
};

function dayDistance(fromDate: string, toDate: string) {
  const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
  const toMs = Date.parse(`${toDate}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return null;
  return Math.round((toMs - fromMs) / 86_400_000);
}

function priorityRank(priority: RecoveryBacklogTask["priority"]) {
  return priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : priority === "low" ? 1 : 0;
}

function pushReason(reasons: RecoveryReasonCode[], reason: RecoveryReasonCode) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function sortedReasonCodes(reasons: RecoveryReasonCode[]) {
  const order = new Map(RECOVERY_REASON_CODE_VALUES.map((reason, index) => [reason, index]));
  return Array.from(new Set(reasons)).sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function taskIsUrgent(task: RecoveryBacklogTask, dueDistance: number | null) {
  return dueDistance != null && dueDistance <= 1 || task.hardDeadline && dueDistance != null && dueDistance <= 3;
}

function taskIsImportant(task: RecoveryBacklogTask, dueDistance: number | null) {
  return task.priority === "urgent" || task.priority === "high" || task.blocksImportantWork || dueDistance != null && dueDistance >= 0 && dueDistance <= 3;
}

export function classifyRecoveryTask(task: RecoveryBacklogTask, localDate: string): RecoveryTaskClassification {
  const dueDistance = task.dueDate ? dayDistance(localDate, task.dueDate) : null;
  const reasons: RecoveryReasonCode[] = [];
  if (dueDistance != null && dueDistance < 0 && task.hardDeadline) pushReason(reasons, "OVERDUE_HARD_DEADLINE");
  if (dueDistance === 0) pushReason(reasons, "DUE_TODAY");
  if (dueDistance != null && dueDistance > 0 && dueDistance <= 3) pushReason(reasons, "DUE_SOON");
  if (task.priority === "high" || task.priority === "urgent") pushReason(reasons, "HIGH_PRIORITY");
  if (task.blocksImportantWork) pushReason(reasons, "BLOCKING_OTHER_WORK");
  if (task.stale || task.postponementCount >= 3) {
    pushReason(reasons, "REPEATEDLY_POSTPONED");
    pushReason(reasons, "TASK_STALE");
  }
  if (task.requiresClarification || !task.title.trim()) pushReason(reasons, "TASK_NEEDS_CLARIFICATION");

  let classification: RecoveryClassification;
  if (taskIsUrgent(task, dueDistance)) {
    classification = "URGENT";
  } else if (task.requiresClarification || !task.title.trim()) {
    classification = "UNCLEAR";
  } else if (task.stale || task.postponementCount >= 3) {
    classification = "STALE";
  } else if (taskIsImportant(task, dueDistance) || task.pinned || task.inProgress) {
    classification = "IMPORTANT";
  } else if (task.flexible && !task.hardDeadline && !task.pinned && !task.inProgress && !task.blocksImportantWork && (dueDistance == null || dueDistance > 3)) {
    classification = "FLEXIBLE";
    pushReason(reasons, "FLEXIBLE_BACKLOG");
    pushReason(reasons, "SAFE_TO_DEFER");
  } else {
    classification = "IMPORTANT";
  }
  const movableByDefault = classification === "FLEXIBLE" && !task.hardDeadline && !task.pinned && !task.inProgress && !task.blocksImportantWork;
  return RecoveryTaskClassificationSchema.parse({ taskId: task.taskId, classification, movableByDefault, reasonCodes: sortedReasonCodes(reasons) });
}

function compareTasks(a: RecoveryBacklogTask, b: RecoveryBacklogTask, localDate: string, classifications: Map<string, RecoveryTaskClassification>) {
  const classRank: Record<RecoveryClassification, number> = { URGENT: 0, IMPORTANT: 1, UNCLEAR: 2, STALE: 3, FLEXIBLE: 4 };
  const aClass = classifications.get(a.taskId)?.classification || "IMPORTANT";
  const bClass = classifications.get(b.taskId)?.classification || "IMPORTANT";
  if (classRank[aClass] !== classRank[bClass]) return classRank[aClass] - classRank[bClass];
  const aDue = a.dueDate ? Date.parse(`${a.dueDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? Date.parse(`${b.dueDate}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  if (priorityRank(a.priority) !== priorityRank(b.priority)) return priorityRank(b.priority) - priorityRank(a.priority);
  return a.taskId.localeCompare(b.taskId);
}

function rankRestartCandidates(input: {
  userId: string;
  localDate: string;
  availableMinutes: number | null;
  remainingCapacityRange: { min: number; max: number } | null;
  tasks: RecoveryBacklogTask[];
}) {
  const candidates = input.tasks.map((task) => task.nextBestActionCandidate).filter((candidate): candidate is NextBestActionCandidate => candidate != null);
  return rankNextBestActionCandidates({
    userId: input.userId,
    nowMs: Date.parse(`${input.localDate}T12:00:00.000Z`),
    todayDate: input.localDate,
    availableMinutes: input.availableMinutes,
    remainingCapacityRange: input.remainingCapacityRange,
    candidates,
  });
}

function fitsCapacity(candidate: RankedNextBestActionCandidate, input: { availableMinutes: number | null; remainingCapacityRange: { min: number; max: number } | null }) {
  const ceiling = input.availableMinutes ?? input.remainingCapacityRange?.max ?? null;
  return ceiling == null || candidate.durationMinutes <= ceiling;
}

function chooseRestartCandidate(input: {
  userId: string;
  localDate: string;
  availableMinutes: number | null;
  remainingCapacityRange: { min: number; max: number } | null;
  tasks: RecoveryBacklogTask[];
  classifications: Map<string, RecoveryTaskClassification>;
  shortRestartMinutes: number;
}) {
  const ranked = rankRestartCandidates(input);
  const classificationByTaskId = input.classifications;
  const findFirst = (predicate: (candidate: RankedNextBestActionCandidate) => boolean) => ranked.candidates.find(predicate) || null;
  const urgent = findFirst((candidate) => classificationByTaskId.get(candidate.taskId)?.classification === "URGENT" && fitsCapacity(candidate, input));
  if (urgent) return { candidate: urgent, needsClarification: false };
  const importantWithFirstAction = findFirst((candidate) =>
    classificationByTaskId.get(candidate.taskId)?.classification === "IMPORTANT" &&
    !!candidate.firstAction &&
    fitsCapacity(candidate, input)
  );
  if (importantWithFirstAction) return { candidate: importantWithFirstAction, needsClarification: false };
  const shortAction = findFirst((candidate) =>
    ["URGENT", "IMPORTANT", "FLEXIBLE"].includes(classificationByTaskId.get(candidate.taskId)?.classification || "") &&
    candidate.durationMinutes <= input.shortRestartMinutes &&
    fitsCapacity(candidate, input)
  );
  if (shortAction) return { candidate: shortAction, needsClarification: false };
  const clarificationTask = input.tasks
    .filter((task) => classificationByTaskId.get(task.taskId)?.classification === "UNCLEAR")
    .sort((a, b) => a.taskId.localeCompare(b.taskId))[0];
  return clarificationTask ? { candidate: null, taskId: clarificationTask.taskId, needsClarification: true } : { candidate: null, taskId: null, needsClarification: false };
}

export function buildRecoveryBacklogPlan(input: {
  userId: string;
  localDate: string;
  availableMinutes?: number | null;
  remainingCapacityRange?: { min: number; max: number } | null;
  tasks: RecoveryBacklogTask[];
  config?: Partial<RecoveryPlanningConfig>;
}): RecoveryBacklogPlan & { restartCandidate: RankedNextBestActionCandidate | null } {
  const config = { ...DEFAULT_RECOVERY_PLANNING_CONFIG, ...input.config };
  const tasks = [...input.tasks].sort((a, b) => a.taskId.localeCompare(b.taskId));
  const classifications = tasks.map((task) => classifyRecoveryTask(task, input.localDate));
  const classificationByTaskId = new Map(classifications.map((classification) => [classification.taskId, classification]));
  const attentionTaskIds = tasks
    .filter((task) => ["URGENT", "IMPORTANT"].includes(classificationByTaskId.get(task.taskId)?.classification || ""))
    .sort((a, b) => compareTasks(a, b, input.localDate, classificationByTaskId))
    .slice(0, config.attention)
    .map((task) => task.taskId);
  const restart = chooseRestartCandidate({
    userId: input.userId,
    localDate: input.localDate,
    availableMinutes: input.availableMinutes == null ? null : Math.max(1, Math.floor(input.availableMinutes)),
    remainingCapacityRange: input.remainingCapacityRange || null,
    tasks,
    classifications: classificationByTaskId,
    shortRestartMinutes: Math.max(1, Math.floor(config.shortRestartMinutes)),
  });
  const restartTaskId = restart.candidate?.taskId || ("taskId" in restart ? restart.taskId : null);
  const flexibleTaskIds = tasks
    .filter((task) => classificationByTaskId.get(task.taskId)?.classification === "FLEXIBLE" && task.taskId !== restartTaskId)
    .sort((a, b) => compareTasks(a, b, input.localDate, classificationByTaskId))
    .slice(0, config.flexible)
    .map((task) => task.taskId);
  const visibleTaskIds = Array.from(new Set([...attentionTaskIds, ...(restartTaskId ? [restartTaskId] : []), ...flexibleTaskIds]));
  const plan = RecoveryBacklogPlanSchema.parse({
    classifications,
    restartTaskId,
    restartNeedsClarification: restart.needsClarification,
    attentionTaskIds,
    flexibleTaskIds,
    visibleTaskIds,
    visibleLimits: { attention: config.attention, flexible: config.flexible },
  });
  return { ...plan, restartCandidate: restart.candidate || null };
}
