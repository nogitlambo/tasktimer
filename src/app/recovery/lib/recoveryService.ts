import { randomUUID } from "node:crypto";

import type { DailyCapacitySnapshot } from "@/app/adaptivecapacity/lib/dailyCapacityContract";
import { generateScheduleRepairCandidates } from "@/app/schedulerepair/lib/scheduleRepairCandidates";
import { resolveScheduleRepairCapacity } from "@/app/schedulerepair/lib/scheduleRepairPlanning";
import type { ScheduleRepairAction } from "@/app/schedulerepair/lib/scheduleRepairContract";
import type { ScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";

import type { RecoverySession, RecoveryTriggerCode } from "./recoveryContract";
import { buildRecoveryBacklogPlan } from "./recoveryPlanning";
import type { RecoveryPlanningRepository } from "./recoveryPlanningRepository";
import { buildRecoverySession, hashRecoveryTaskVersions } from "./recoverySessionPlanning";
import type { RecoverySessionRepository } from "./recoverySessionRepository";

type CapacitySnapshot = Pick<DailyCapacitySnapshot, "remainingRange"> & Partial<Pick<DailyCapacitySnapshot, "fullDayRange" | "state" | "confidence" | "primarySource" | "manualOverride">>;

export async function generateRecoverySession(input: {
  uid: string;
  localDate: string;
  timezone: string;
  nowMs: number;
  triggerCodes: RecoveryTriggerCode[];
  sessionRepository: RecoverySessionRepository;
  planningRepository: RecoveryPlanningRepository;
  scheduleRepairRepository?: Pick<ScheduleRepairRepository, "loadSourceContext">;
  capacitySnapshot?: CapacitySnapshot | null;
  sessionId?: string | null;
  forceRefresh?: boolean;
}): Promise<{ session: RecoverySession; reused: boolean }> {
  const existing = input.sessionId ? await input.sessionRepository.loadSession(input.uid, input.sessionId) : null;
  if (existing && existing.userId === input.uid && !input.forceRefresh && existing.status === "ACTIVE" && Date.parse(existing.expiresAt) > input.nowMs) {
    return { session: existing, reused: true };
  }
  const tasks = await input.planningRepository.loadBacklog({ uid: input.uid, localDate: input.localDate, timezone: input.timezone, nowMs: input.nowMs });
  const remainingCapacityRange = input.capacitySnapshot?.remainingRange || null;
  const plan = buildRecoveryBacklogPlan({
    userId: input.uid,
    localDate: input.localDate,
    remainingCapacityRange,
    tasks,
  });
  let scheduleRepairActions: ScheduleRepairAction[] = [];
  if (input.scheduleRepairRepository) {
    const source = await input.scheduleRepairRepository.loadSourceContext({ uid: input.uid, localDate: input.localDate });
    const capacity = resolveScheduleRepairCapacity({ adaptiveCapacity: input.capacitySnapshot || null });
    const capacityMax = input.capacitySnapshot?.fullDayRange?.max || capacity.remainingRange.max;
    const scheduleOutcome = generateScheduleRepairCandidates({
      localDate: input.localDate,
      tasks: source.tasks,
      remainingCapacity: capacity,
      futureDays: source.futureDays.map((day) => ({ ...day, capacityMax })),
    });
    const taskIds = new Set(tasks.map((task) => task.taskId));
    scheduleRepairActions = scheduleOutcome.actions.filter((action) => taskIds.has(action.taskId));
  }
  const session = buildRecoverySession({
    id: existing?.id || input.sessionId || randomUUID(),
    userId: input.uid,
    localDate: input.localDate,
    nowMs: input.nowMs,
    triggerCodes: input.triggerCodes,
    remainingCapacity: remainingCapacityRange,
    targetDayCapacityMax: input.capacitySnapshot?.fullDayRange?.max ?? remainingCapacityRange?.max ?? null,
    tasks,
    plan,
    scheduleRepairActions,
    sourceTaskVersionHash: hashRecoveryTaskVersions(tasks),
  });
  await input.sessionRepository.saveSession(input.uid, session);
  return { session, reused: false };
}
