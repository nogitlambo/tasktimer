import { createHash } from "node:crypto";

import type { ScheduleRepairAction } from "@/app/schedulerepair/lib/scheduleRepairContract";

import {
  RECOVERY_SCHEMA_VERSION,
  RecoverySessionSchema,
  type RecoveryAction,
  type RecoveryBacklogPlan,
  type RecoveryCapacityRange,
  type RecoverySession,
  type RecoveryTriggerCode,
} from "./recoveryContract";
import type { RecoveryBacklogTask } from "./recoveryPlanning";

export const RECOVERY_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashRecoveryTaskVersions(tasks: RecoveryBacklogTask[]) {
  return createHash("sha256")
    .update(JSON.stringify(tasks.map((task) => ({ taskId: task.taskId, taskVersion: task.taskVersion })).sort((a, b) => a.taskId.localeCompare(b.taskId))))
    .digest("hex");
}

function actionFor(input: {
  task: RecoveryBacklogTask;
  classification: RecoveryBacklogPlan["classifications"][number];
  localDate: string;
  scheduleRepairAction: ScheduleRepairAction | null;
}): RecoveryAction {
  const scheduleAction = input.scheduleRepairAction;
  const common = {
    taskId: input.task.taskId,
    taskVersion: input.task.taskVersion,
    classification: input.classification.classification,
    fromDate: input.localDate,
    reasonCodes: input.classification.reasonCodes,
    selected: false,
    status: "PROPOSED" as const,
  };
  if (scheduleAction?.type === "MOVE_TO_LATER_DAY" && scheduleAction.toDate) {
    return { ...common, id: `defer:${input.task.taskId}`, type: "DEFER_TO_LATER_DAY", toDate: scheduleAction.toDate, reasonCodes: Array.from(new Set([...common.reasonCodes, "SAFE_TO_DEFER"])) };
  }
  if (scheduleAction?.type === "REMOVE_FROM_TODAY") {
    return { ...common, id: `remove:${input.task.taskId}`, type: "REMOVE_FROM_TODAY" };
  }
  if (input.classification.classification === "UNCLEAR") return { ...common, id: `clarify:${input.task.taskId}`, type: "CLARIFY_TASK" };
  if (input.classification.classification === "STALE") return { ...common, id: `review:${input.task.taskId}`, type: "MARK_FOR_LATER_REVIEW" };
  if (input.classification.classification === "FLEXIBLE") return { ...common, id: `review:${input.task.taskId}`, type: "MARK_FOR_LATER_REVIEW" };
  return { ...common, id: `keep:${input.task.taskId}`, type: "KEEP_ACTIVE" };
}

export function buildRecoverySession(input: {
  id: string;
  userId: string;
  localDate: string;
  nowMs: number;
  triggerCodes: RecoveryTriggerCode[];
  remainingCapacity: RecoveryCapacityRange | null;
  targetDayCapacityMax?: number | null;
  tasks: RecoveryBacklogTask[];
  plan: RecoveryBacklogPlan & { restartCandidate?: unknown };
  scheduleRepairActions?: ScheduleRepairAction[];
  sourceTaskVersionHash: string;
}): RecoverySession {
  const classificationByTaskId = new Map(input.plan.classifications.map((classification) => [classification.taskId, classification]));
  const scheduleActionByTaskId = new Map((input.scheduleRepairActions || []).map((action) => [action.taskId, action]));
  const actions = input.tasks
    .slice()
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
    .map((task) => actionFor({
      task,
      classification: classificationByTaskId.get(task.taskId) || {
        taskId: task.taskId,
        classification: "IMPORTANT",
        movableByDefault: false,
        reasonCodes: [],
      },
      localDate: input.localDate,
      scheduleRepairAction: scheduleActionByTaskId.get(task.taskId) || null,
    }));
  const counts = input.plan.classifications.reduce((result, classification) => {
    if (classification.classification === "URGENT") result.urgentCount += 1;
    if (classification.classification === "FLEXIBLE") result.flexibleCount += 1;
    if (classification.classification === "STALE") result.staleCount += 1;
    return result;
  }, { urgentCount: 0, flexibleCount: 0, staleCount: 0 });
  return RecoverySessionSchema.parse({
    schemaVersion: RECOVERY_SCHEMA_VERSION,
    id: input.id,
    userId: input.userId,
    localDate: input.localDate,
    triggerCodes: input.triggerCodes,
    backlogCount: input.tasks.length,
    overdueCount: input.tasks.filter((task) => task.dueDate != null && task.dueDate < input.localDate).length,
    urgentCount: counts.urgentCount,
    flexibleCount: counts.flexibleCount,
    staleCount: counts.staleCount,
    remainingCapacity: input.remainingCapacity,
    targetDayCapacityMax: input.targetDayCapacityMax == null ? null : Math.max(0, Math.floor(input.targetDayCapacityMax)),
    restartTaskId: input.plan.restartTaskId,
    nextBestActionRecommendationId: null,
    actions,
    sourceTaskVersionHash: input.sourceTaskVersionHash,
    status: "ACTIVE",
    createdAt: new Date(input.nowMs).toISOString(),
    expiresAt: new Date(input.nowMs + RECOVERY_SESSION_TTL_MS).toISOString(),
    completedAt: null,
  });
}
