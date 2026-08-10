import { generateRecoverySession } from "@/app/recovery/lib/recoveryService";
import { createFirestoreRecoveryPlanningRepository, type RecoveryPlanningRepository } from "@/app/recovery/lib/recoveryPlanningRepository";
import type { RecoveryTriggerCode } from "@/app/recovery/lib/recoveryContract";
import { createFirestoreRecoverySessionRepository, type RecoverySessionRepository } from "@/app/recovery/lib/recoverySessionRepository";
import { generateScheduleRepairProposal } from "@/app/schedulerepair/lib/scheduleRepairService";
import { createFirestoreScheduleRepairRepository, type ScheduleRepairRepository } from "@/app/schedulerepair/lib/scheduleRepairRepository";

type ScheduleRepairCapacityLoader = NonNullable<Parameters<typeof generateScheduleRepairProposal>[0]["capacityLoader"]>;
type ScheduleRepairCapacityLoaderResult = Awaited<ReturnType<ScheduleRepairCapacityLoader>>;
type RecoveryCapacitySnapshot = NonNullable<Parameters<typeof generateRecoverySession>[0]["capacitySnapshot"]>;

export type ScheduleRepairMaintenanceAction = "REGENERATE" | "EXPIRE";
export type RecoveryMaintenanceAction = "CREATE" | "EXPIRE" | "COMPLETE";
type AdapterName = "SCHEDULE_REPAIR" | "RECOVERY_MODE";

type LifecycleRequest = {
  uid: string;
  authenticatedUserId: string | null;
  entityId: string;
  entityVersion: string;
  currentEntityVersion: string | null;
  idempotencyKey: string;
  nowMs: number;
  featureAvailable?: boolean;
  conflict?: boolean;
};

export type ScheduleRepairMaintenanceRequest = LifecycleRequest & {
  action: ScheduleRepairMaintenanceAction;
  repairId?: string;
  localDate: string;
  timezone?: string;
  dailyBriefFallbackRange?: { min: number; max: number } | null;
};

export type RecoveryMaintenanceRequest = LifecycleRequest & {
  action: RecoveryMaintenanceAction;
  sessionId?: string;
  localDate: string;
  timezone: string;
  triggerCodes: RecoveryTriggerCode[];
  capacitySnapshot?: RecoveryCapacitySnapshot | null;
};

export type ScheduleMaintenanceResult =
  | { kind: "REFRESHED"; adapter: AdapterName; entityId: string; sourceVersion: string; referenceId?: string; confirmationRequired?: true }
  | { kind: "REPLAYED"; adapter: AdapterName; entityId: string; sourceVersion: string; referenceId?: string; confirmationRequired?: true }
  | { kind: "SKIPPED"; adapter: AdapterName; entityId: string; reason: "OWNERSHIP_FAILED" | "ENTITY_STALE" | "FEATURE_UNAVAILABLE" | "INVALID_IDEMPOTENCY_KEY" | "ENTITY_NOT_FOUND" | "ENTITY_NOT_ELIGIBLE" | "STALE_REFERENCE" | "CONFLICT_DEFERRED" }
  | { kind: "FAILED"; adapter: AdapterName; entityId: string; reason: "DEPENDENCY_UNAVAILABLE" };

export type TrustedAutomationScheduleDependencies = {
  scheduleRepair?: {
    repository?: ScheduleRepairRepository;
    generate?: typeof generateScheduleRepairProposal;
    capacityLoader?: (input: { uid: string; localDate: string; timezone: string; nowMs: number }) => Promise<ScheduleRepairCapacityLoaderResult>;
  };
  recovery?: {
    sessionRepository?: RecoverySessionRepository;
    planningRepository?: RecoveryPlanningRepository;
    scheduleRepairRepository?: Pick<ScheduleRepairRepository, "loadSourceContext">;
    generate?: typeof generateRecoverySession;
    capacityLoader?: (input: { uid: string; localDate: string; timezone: string; nowMs: number }) => Promise<RecoveryMaintenanceRequest["capacitySnapshot"]>;
  };
};

function validString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function validate(input: LifecycleRequest, adapter: AdapterName): ScheduleMaintenanceResult | null {
  if (!validString(input.uid, 120) || input.authenticatedUserId !== input.uid) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "OWNERSHIP_FAILED" };
  if (!validString(input.entityVersion, 200) || input.currentEntityVersion !== input.entityVersion) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "ENTITY_STALE" };
  if (input.featureAvailable === false) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "FEATURE_UNAVAILABLE" };
  if (!validString(input.idempotencyKey, 240)) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "INVALID_IDEMPOTENCY_KEY" };
  if (input.conflict) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "CONFLICT_DEFERRED" };
  return null;
}

function createRunner() {
  const completed = new Map<string, Extract<ScheduleMaintenanceResult, { kind: "REFRESHED" }>>();
  return async function run(input: LifecycleRequest, adapter: AdapterName, execute: () => Promise<{ sourceVersion: string; referenceId?: string; confirmationRequired?: true }>): Promise<ScheduleMaintenanceResult> {
    const validation = validate(input, adapter);
    if (validation) return validation;
    const key = `${adapter}:${input.uid}:${input.idempotencyKey}`;
    const previous = completed.get(key);
    if (previous) return { ...previous, kind: "REPLAYED" };
    try {
      const result = await execute();
      const refreshed: Extract<ScheduleMaintenanceResult, { kind: "REFRESHED" }> = {
        kind: "REFRESHED",
        adapter,
        entityId: input.entityId,
        sourceVersion: result.sourceVersion,
        ...(result.referenceId ? { referenceId: result.referenceId } : {}),
        ...(result.confirmationRequired ? { confirmationRequired: true } : {}),
      };
      completed.set(key, refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof LifecycleSkipError) return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: error.reason };
      return { kind: "FAILED", adapter, entityId: input.entityId, reason: "DEPENDENCY_UNAVAILABLE" };
    }
  };
}

function dateIsValid(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function createTrustedAutomationScheduleAdapters(dependencies: TrustedAutomationScheduleDependencies = {}) {
  const scheduleRepair = dependencies.scheduleRepair || {};
  const recovery = dependencies.recovery || {};
  const run = createRunner();

  return {
    async maintainScheduleRepair(input: ScheduleRepairMaintenanceRequest): Promise<ScheduleMaintenanceResult> {
      if (!dateIsValid(input.localDate)) return { kind: "SKIPPED", adapter: "SCHEDULE_REPAIR", entityId: input.entityId, reason: "ENTITY_NOT_FOUND" };
      return run(input, "SCHEDULE_REPAIR", async () => {
        const repository = scheduleRepair.repository || createFirestoreScheduleRepairRepository();
        if (input.action === "EXPIRE") {
          const repairId = input.repairId || input.entityId;
          const proposal = await repository.loadProposal(input.uid, repairId);
          if (!proposal || proposal.userId !== input.uid) throw new LifecycleSkipError("ENTITY_NOT_FOUND");
          if (proposal.sourceTaskVersionHash !== input.entityVersion) throw new LifecycleSkipError("STALE_REFERENCE");
          if (!repository.expireProposal) throw new Error("Schedule Repair expiration contract is unavailable.");
          const expired = await repository.expireProposal(input.uid, repairId, input.nowMs);
          if (!expired) throw new LifecycleSkipError("ENTITY_NOT_FOUND");
          return { sourceVersion: proposal.sourceTaskVersionHash, referenceId: proposal.id, confirmationRequired: true as const };
        }
        const source = await repository.loadSourceContext({ uid: input.uid, localDate: input.localDate });
        if (source.sourceTaskVersionHash !== input.entityVersion) throw new LifecycleSkipError("STALE_REFERENCE");
        const result = await (scheduleRepair.generate || generateScheduleRepairProposal)({
          uid: input.uid,
          localDate: input.localDate,
          nowMs: input.nowMs,
          repository,
          proposalId: input.repairId || null,
          forceRefresh: true,
          dailyBriefFallbackRange: input.dailyBriefFallbackRange,
          capacityLoader: scheduleRepair.capacityLoader
            ? () => scheduleRepair.capacityLoader!({ uid: input.uid, localDate: input.localDate, timezone: input.timezone || "UTC", nowMs: input.nowMs })
            : undefined,
        });
        return { sourceVersion: source.sourceTaskVersionHash, referenceId: result.proposal?.id, confirmationRequired: true as const };
      }).catch((error) => error instanceof LifecycleSkipError
        ? { kind: "SKIPPED" as const, adapter: "SCHEDULE_REPAIR" as const, entityId: input.entityId, reason: error.reason }
        : { kind: "FAILED" as const, adapter: "SCHEDULE_REPAIR" as const, entityId: input.entityId, reason: "DEPENDENCY_UNAVAILABLE" as const });
    },

    async maintainRecovery(input: RecoveryMaintenanceRequest): Promise<ScheduleMaintenanceResult> {
      if (!dateIsValid(input.localDate)) return { kind: "SKIPPED", adapter: "RECOVERY_MODE", entityId: input.entityId, reason: "ENTITY_NOT_FOUND" };
      return run(input, "RECOVERY_MODE", async () => {
        const sessionRepository = recovery.sessionRepository || createFirestoreRecoverySessionRepository();
        if (input.action === "EXPIRE" || input.action === "COMPLETE") {
          const session = await sessionRepository.loadSession(input.uid, input.sessionId || input.entityId);
          if (!session || session.userId !== input.uid) throw new LifecycleSkipError("ENTITY_NOT_FOUND");
          if (session.sourceTaskVersionHash !== input.entityVersion) throw new LifecycleSkipError("STALE_REFERENCE");
          const result = input.action === "EXPIRE"
            ? sessionRepository.expireSession ? await sessionRepository.expireSession(input.uid, session.id, input.nowMs) : null
            : await sessionRepository.completeSession(input.uid, session.id, input.nowMs);
          if (!result) throw new Error("Recovery session lifecycle contract is unavailable.");
          return { sourceVersion: session.sourceTaskVersionHash, referenceId: session.id, confirmationRequired: true as const };
        }
        const capacitySnapshot = input.capacitySnapshot || (recovery.capacityLoader ? await recovery.capacityLoader({ uid: input.uid, localDate: input.localDate, timezone: input.timezone, nowMs: input.nowMs }) : null);
        const result = await (recovery.generate || generateRecoverySession)({
          uid: input.uid,
          localDate: input.localDate,
          timezone: input.timezone,
          nowMs: input.nowMs,
          triggerCodes: input.triggerCodes,
          sessionRepository,
          planningRepository: recovery.planningRepository || createFirestoreRecoveryPlanningRepository(),
          scheduleRepairRepository: recovery.scheduleRepairRepository || createFirestoreScheduleRepairRepository(),
          capacitySnapshot,
          sessionId: input.sessionId || input.entityId,
          forceRefresh: true,
        });
        return { sourceVersion: result.session.sourceTaskVersionHash, referenceId: result.session.id, confirmationRequired: true as const };
      }).catch((error) => error instanceof LifecycleSkipError
        ? { kind: "SKIPPED" as const, adapter: "RECOVERY_MODE" as const, entityId: input.entityId, reason: error.reason }
        : { kind: "FAILED" as const, adapter: "RECOVERY_MODE" as const, entityId: input.entityId, reason: "DEPENDENCY_UNAVAILABLE" as const });
    },
  };
}

class LifecycleSkipError extends Error {
  constructor(readonly reason: Extract<ScheduleMaintenanceResult, { kind: "SKIPPED" }>["reason"]) {
    super(reason);
  }
}

export type TrustedAutomationScheduleAdapters = ReturnType<typeof createTrustedAutomationScheduleAdapters>;
