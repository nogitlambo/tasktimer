import { createFirestoreDailyExecutiveBriefRepository, type DailyExecutiveBriefRepository } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefRepository";
import { generateDailyExecutiveBrief } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefService";
import type { DailyExecutiveBriefCapacitySummary } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefContract";
import { resolveDailyBriefNextBestAction } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefNextBestAction";
import { createFirestoreDailyCapacityRepository, type DailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import { createFirestoreNextBestActionRepository, type NextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";

export type PlanningRefreshAdapterName = "DAILY_BRIEF" | "CAPACITY_SNAPSHOT" | "NEXT_BEST_ACTION";

export type PlanningRefreshRequest = {
  uid: string;
  authenticatedUserId: string | null;
  entityId: string;
  entityVersion: string;
  currentEntityVersion: string | null;
  idempotencyKey: string;
  nowMs: number;
  featureAvailable?: boolean;
};

export type DailyBriefRefreshRequest = PlanningRefreshRequest & {
  date: string;
  timezone: string;
  availableMinutes?: number | null;
  forceRefresh?: boolean;
};

export type CapacityRefreshRequest = PlanningRefreshRequest & {
  localDate: string;
  timezone: string;
  availableMinutesCeiling?: number | null;
  forceRefresh?: boolean;
};

export type NextBestActionRefreshRequest = PlanningRefreshRequest & {
  date: string;
  timezone: string;
  remainingCapacityRange?: { min: number; max: number } | null;
};

export type PlanningRefreshResult =
  | { kind: "REFRESHED"; adapter: PlanningRefreshAdapterName; entityId: string; sourceVersion: string; reused: boolean }
  | { kind: "REPLAYED"; adapter: PlanningRefreshAdapterName; entityId: string; sourceVersion: string; reused: boolean }
  | { kind: "SKIPPED"; adapter: PlanningRefreshAdapterName; entityId: string; reason: "OWNERSHIP_FAILED" | "ENTITY_STALE" | "FEATURE_UNAVAILABLE" | "INVALID_IDEMPOTENCY_KEY" | "ENTITY_MISMATCH" }
  | { kind: "FAILED"; adapter: PlanningRefreshAdapterName; entityId: string; reason: "DEPENDENCY_UNAVAILABLE" };

type DailyBriefGenerator = typeof generateDailyExecutiveBrief;
type CapacityGenerator = typeof getDailyCapacity;
type NextBestActionResolver = typeof resolveDailyBriefNextBestAction;

export type PlanningRefreshDependencies = {
  dailyBrief?: {
    generate?: DailyBriefGenerator;
    createRepository?: () => DailyExecutiveBriefRepository;
    capacityLoader?: (input: { uid: string; date: string; timezone: string; nowMs: number; availableMinutes: number | null; forceRefresh: boolean }) => Promise<DailyExecutiveBriefCapacitySummary>;
    nextBestActionLoader?: (input: { uid: string; date: string; timezone: string; nowMs: number; remainingCapacityRange: { min: number; max: number } | null }) => ReturnType<NextBestActionResolver>;
  };
  capacity?: {
    get?: CapacityGenerator;
    createRepository?: () => DailyCapacityRepository;
  };
  nextBestAction?: {
    resolve?: NextBestActionResolver;
    createRepository?: () => NextBestActionRepository;
  };
};

function validString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function commonValidation(input: PlanningRefreshRequest, adapter: PlanningRefreshAdapterName): PlanningRefreshResult | null {
  if (!validString(input.uid, 120) || input.authenticatedUserId !== input.uid) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "OWNERSHIP_FAILED" };
  }
  if (!validString(input.entityVersion, 200) || input.currentEntityVersion !== input.entityVersion) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "ENTITY_STALE" };
  }
  if (input.featureAvailable === false) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "FEATURE_UNAVAILABLE" };
  }
  if (!validString(input.idempotencyKey, 240)) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "INVALID_IDEMPOTENCY_KEY" };
  }
  return null;
}

function dateEntityValidation(input: PlanningRefreshRequest, date: string, adapter: PlanningRefreshAdapterName): PlanningRefreshResult | null {
  if (input.entityId !== date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "ENTITY_MISMATCH" };
  }
  return null;
}

function createGuardedRunner() {
  const completed = new Map<string, Extract<PlanningRefreshResult, { kind: "REFRESHED" }>>();

  return async function run(
    input: PlanningRefreshRequest,
    adapter: PlanningRefreshAdapterName,
    execute: () => Promise<{ sourceVersion: string; reused: boolean }>
  ): Promise<PlanningRefreshResult> {
    const validation = commonValidation(input, adapter);
    if (validation) return validation;
    const key = `${input.uid}:${input.idempotencyKey}`;
    const previous = completed.get(key);
    if (previous) return { ...previous, kind: "REPLAYED" };
    try {
      const result = await execute();
      const refreshed: Extract<PlanningRefreshResult, { kind: "REFRESHED" }> = {
        kind: "REFRESHED",
        adapter,
        entityId: input.entityId,
        sourceVersion: result.sourceVersion,
        reused: result.reused,
      };
      completed.set(key, refreshed);
      return refreshed;
    } catch {
      return { kind: "FAILED", adapter, entityId: input.entityId, reason: "DEPENDENCY_UNAVAILABLE" };
    }
  };
}

function defaultDependencies(): Required<Pick<PlanningRefreshDependencies, "dailyBrief" | "capacity" | "nextBestAction">> {
  return {
    dailyBrief: {
      generate: generateDailyExecutiveBrief,
      createRepository: () => createFirestoreDailyExecutiveBriefRepository(),
      capacityLoader: async ({ uid, date, timezone, nowMs, availableMinutes, forceRefresh }) => {
        const capacity = await getDailyCapacity({
          uid,
          localDate: date,
          timezone,
          nowMs,
          availableMinutesCeiling: availableMinutes,
          forceRefresh,
          repository: createFirestoreDailyCapacityRepository(),
        });
        return {
          fullDayRange: capacity.snapshot.fullDayRange,
          remainingRange: capacity.snapshot.remainingRange,
          state: capacity.snapshot.state,
          confidence: capacity.snapshot.confidence,
          primarySource: capacity.snapshot.primarySource,
          sourceSignals: capacity.snapshot.sourceSignals,
          completedMinutesToday: capacity.snapshot.completedMinutesToday,
          availableMinutesCeiling: capacity.snapshot.availableMinutesCeiling ?? null,
          sourceVersion: capacity.snapshot.sourceVersion,
        };
      },
      nextBestActionLoader: ({ uid, date, timezone, nowMs, remainingCapacityRange }) => resolveDailyBriefNextBestAction({
        uid,
        date,
        timezone,
        nowMs,
        remainingCapacityRange,
        repository: createFirestoreNextBestActionRepository(),
      }),
    },
    capacity: { get: getDailyCapacity, createRepository: () => createFirestoreDailyCapacityRepository() },
    nextBestAction: { resolve: resolveDailyBriefNextBestAction, createRepository: () => createFirestoreNextBestActionRepository() },
  };
}

export function createPlanningRefreshAdapters(dependencies: PlanningRefreshDependencies = {}) {
  const defaults = defaultDependencies();
  const dailyBrief = { ...defaults.dailyBrief, ...dependencies.dailyBrief };
  const capacity = { ...defaults.capacity, ...dependencies.capacity };
  const nextBestAction = { ...defaults.nextBestAction, ...dependencies.nextBestAction };
  const run = createGuardedRunner();

  return {
    async refreshDailyBrief(input: DailyBriefRefreshRequest): Promise<PlanningRefreshResult> {
      const validation = dateEntityValidation(input, input.date, "DAILY_BRIEF");
      if (validation) return validation;
      return run(input, "DAILY_BRIEF", async () => {
        let remainingCapacityRange: { min: number; max: number } | null = null;
        const result = await dailyBrief.generate!({
          uid: input.uid,
          date: input.date,
          repository: dailyBrief.createRepository!(),
          nowMs: input.nowMs,
          forceRefresh: input.forceRefresh ?? true,
          availableMinutes: input.availableMinutes,
          capacityLoader: dailyBrief.capacityLoader
            ? async () => {
              const capacity = await dailyBrief.capacityLoader!({ uid: input.uid, date: input.date, timezone: input.timezone, nowMs: input.nowMs, availableMinutes: input.availableMinutes ?? null, forceRefresh: input.forceRefresh ?? true });
              remainingCapacityRange = capacity.remainingRange;
              return capacity;
            }
            : undefined,
          nextBestActionLoader: dailyBrief.nextBestActionLoader
            ? async () => dailyBrief.nextBestActionLoader!({ uid: input.uid, date: input.date, timezone: input.timezone, nowMs: input.nowMs, remainingCapacityRange })
            : undefined,
        });
        return { sourceVersion: result.snapshot.sourceVersion, reused: result.reused };
      });
    },

    async refreshCapacitySnapshot(input: CapacityRefreshRequest): Promise<PlanningRefreshResult> {
      const validation = dateEntityValidation(input, input.localDate, "CAPACITY_SNAPSHOT");
      if (validation) return validation;
      return run(input, "CAPACITY_SNAPSHOT", async () => {
        const result = await capacity.get!({
          uid: input.uid,
          localDate: input.localDate,
          timezone: input.timezone,
          nowMs: input.nowMs,
          availableMinutesCeiling: input.availableMinutesCeiling,
          forceRefresh: input.forceRefresh ?? true,
          repository: capacity.createRepository!(),
        });
        return { sourceVersion: result.snapshot.sourceVersion, reused: result.reused };
      });
    },

    async refreshNextBestAction(input: NextBestActionRefreshRequest): Promise<PlanningRefreshResult> {
      const validation = dateEntityValidation(input, input.date, "NEXT_BEST_ACTION");
      if (validation) return validation;
      return run(input, "NEXT_BEST_ACTION", async () => {
        const repository = nextBestAction.createRepository!();
        const result = await nextBestAction.resolve!({
          uid: input.uid,
          date: input.date,
          nowMs: input.nowMs,
          timezone: input.timezone,
          remainingCapacityRange: input.remainingCapacityRange ?? null,
          repository,
        });
        if (repository.invalidateActiveRecommendations) {
          await repository.invalidateActiveRecommendations({ uid: input.uid, nowMs: input.nowMs, exceptRecommendationId: result.recommendation?.recommendationId });
        }
        return { sourceVersion: result.recommendation?.sourceTaskVersion || input.entityVersion, reused: false };
      });
    },
  };
}

export type PlanningRefreshAdapters = ReturnType<typeof createPlanningRefreshAdapters>;
