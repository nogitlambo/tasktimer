import { randomUUID } from "node:crypto";

import type { DailyCapacitySnapshot } from "@/app/adaptivecapacity/lib/dailyCapacityContract";

import { generateScheduleRepairCandidates } from "./scheduleRepairCandidates";
import { resolveScheduleRepairCapacity } from "./scheduleRepairPlanning";
import type { ScheduleRepairCapacity, ScheduleRepairProposal } from "./scheduleRepairContract";
import type { ScheduleRepairRepository } from "./scheduleRepairRepository";

export const SCHEDULE_REPAIR_TTL_MS = 15 * 60 * 1000;

export async function applyScheduleRepairProposal(input: Parameters<ScheduleRepairRepository["applyProposal"]>[0] & { repository: ScheduleRepairRepository }) {
  const { repository, ...request } = input;
  return repository.applyProposal(request);
}

type CapacityResult = { snapshot: Pick<DailyCapacitySnapshot, "id" | "fullDayRange" | "remainingRange" | "state" | "confidence" | "primarySource" | "manualOverride"> };

export async function generateScheduleRepairProposal(input: {
  uid: string;
  localDate: string;
  nowMs: number;
  repository: ScheduleRepairRepository;
  capacityLoader?: () => Promise<CapacityResult>;
  proposalId?: string | null;
  forceRefresh?: boolean;
  dailyBriefFallbackRange?: { min: number; max: number } | null;
}): Promise<{ proposal: ScheduleRepairProposal | null; outcome: ReturnType<typeof generateScheduleRepairCandidates>; reused: boolean }> {
  const source = await input.repository.loadSourceContext({ uid: input.uid, localDate: input.localDate });
  let capacityResult: CapacityResult | null = null;
  if (input.capacityLoader) {
    try { capacityResult = await input.capacityLoader(); } catch { capacityResult = null; }
  }
  const capacity: ScheduleRepairCapacity = resolveScheduleRepairCapacity({
    adaptiveCapacity: capacityResult?.snapshot || null,
    dailyBriefFallbackRange: input.dailyBriefFallbackRange,
  });
  const capacityMax = capacityResult?.snapshot.fullDayRange.max || capacity.remainingRange.max;
  const outcome = generateScheduleRepairCandidates({
    localDate: input.localDate,
    tasks: source.tasks,
    remainingCapacity: capacity,
    futureDays: source.futureDays.map((day) => ({ ...day, capacityMax })),
    dailyBriefFallbackRange: input.dailyBriefFallbackRange,
  });
  if (!outcome.actions.length) return { proposal: null, outcome, reused: false };
  const proposalId = String(input.proposalId || randomUUID()).trim();
  const createdAt = new Date(input.nowMs).toISOString();
  const proposal: ScheduleRepairProposal = {
    schemaVersion: 1,
    id: proposalId,
    userId: input.uid,
    localDate: input.localDate,
    planHealthBefore: outcome.evaluation.planHealthBefore,
    remainingPlannedMinutesBefore: outcome.evaluation.remainingPlannedMinutesBefore,
    remainingCapacity: outcome.evaluation.remainingCapacity.remainingRange,
    estimatedPlannedMinutesAfter: outcome.estimatedPlannedMinutesAfter,
    actions: outcome.actions,
    sourceTaskVersionHash: source.sourceTaskVersionHash,
    capacitySnapshotId: capacityResult?.snapshot.id || null,
    dailyBriefId: null,
    status: "ACTIVE",
    createdAt,
    expiresAt: new Date(input.nowMs + SCHEDULE_REPAIR_TTL_MS).toISOString(),
    appliedAt: null,
    auditEvents: [{ type: "GENERATED", at: createdAt, actionIds: outcome.actions.map((action) => action.id) }],
  };
  await input.repository.saveProposal(input.uid, proposal);
  return { proposal, outcome, reused: false };
}
