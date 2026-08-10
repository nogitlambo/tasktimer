import { createHash, randomUUID } from "node:crypto";

import { createFirestoreBrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpSessionStore";
import { getBrainDumpAiProvider } from "@/app/brain-dump/lib/brainDumpProvider";
import {
  processTypedBrainDump,
  redactExpiredBrainDumpSession,
  type BrainDumpAiProvider,
  type BrainDumpReviewSession,
  type BrainDumpSessionStore,
} from "@/app/brain-dump/lib/brainDumpProcessing";
import {
  createTaskClarificationRecommendation,
  normalizeTaskClarificationUserInstruction,
  TASK_CLARIFICATION_PROMPT_VERSION,
  type TaskClarificationAIProvider,
  type TaskClarificationRecommendation,
} from "@/app/taskclarification/lib/taskClarification";
import { generateValidatedTaskClarification } from "@/app/taskclarification/lib/taskClarificationGeneration";
import { configuredTaskClarificationOpenAiModel, getTaskClarificationAIProvider } from "@/app/taskclarification/lib/taskClarificationProvider";
import { createFirestoreTaskClarificationRepository, type TaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

export type MaintenanceAdapterName = "BRAIN_DUMP" | "TASK_CLARIFICATION";
export type BrainDumpMaintenanceAction = "EXPIRE" | "REGENERATE";

type MaintenanceRequest = {
  uid: string;
  authenticatedUserId: string | null;
  entityId: string;
  entityVersion: string;
  currentEntityVersion: string | null;
  idempotencyKey: string;
  nowMs: number;
  featureAvailable?: boolean;
};

export type BrainDumpMaintenanceRequest = MaintenanceRequest & {
  action: BrainDumpMaintenanceAction;
  timezone?: string;
};

export type TaskClarificationMaintenanceRequest = MaintenanceRequest & {
  timezone: string;
  userInstruction?: string;
};

export type MaintenanceResult =
  | { kind: "REFRESHED"; adapter: MaintenanceAdapterName; entityId: string; sourceVersion: string; referenceId?: string }
  | { kind: "REPLAYED"; adapter: MaintenanceAdapterName; entityId: string; sourceVersion: string; referenceId?: string }
  | {
      kind: "SKIPPED";
      adapter: MaintenanceAdapterName;
      entityId: string;
      reason: "OWNERSHIP_FAILED" | "ENTITY_STALE" | "FEATURE_UNAVAILABLE" | "INVALID_IDEMPOTENCY_KEY" | "ENTITY_NOT_FOUND" | "ENTITY_NOT_ELIGIBLE" | "STALE_REFERENCE";
    }
  | { kind: "FAILED"; adapter: MaintenanceAdapterName; entityId: string; reason: "DEPENDENCY_UNAVAILABLE" };

type BrainDumpProcessor = typeof processTypedBrainDump;
type TaskClarificationGenerator = typeof generateValidatedTaskClarification;

export type TrustedAutomationMaintenanceDependencies = {
  brainDump?: {
    store?: BrainDumpSessionStore;
    provider?: BrainDumpAiProvider;
    process?: BrainDumpProcessor;
    createId?: () => string;
  };
  taskClarification?: {
    repository?: TaskClarificationRepository;
    provider?: TaskClarificationAIProvider;
    generate?: TaskClarificationGenerator;
    createId?: () => string;
    modelVersion?: string;
    promptVersion?: string;
  };
};

function validString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function commonValidation(input: MaintenanceRequest, adapter: MaintenanceAdapterName): MaintenanceResult | null {
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
  if (!validString(input.entityId, 180)) {
    return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: "ENTITY_NOT_FOUND" };
  }
  return null;
}

function sessionVersion(session: BrainDumpReviewSession) {
  return createHash("sha256")
    .update(JSON.stringify({
      id: session.id,
      ownerUid: session.ownerUid,
      state: session.state,
      createdAtMs: session.createdAtMs,
      expiresAtMs: session.expiresAtMs,
      expiredAtMs: session.expiredAtMs || null,
      itemIds: session.review.items.map((item) => item.id),
      selectedCount: session.review.selectedCount,
    }))
    .digest("hex");
}

function createRunner() {
  const completed = new Map<string, Extract<MaintenanceResult, { kind: "REFRESHED" }>>();

  return async function run(
    input: MaintenanceRequest,
    adapter: MaintenanceAdapterName,
    execute: () => Promise<{ sourceVersion: string; referenceId?: string }>
  ): Promise<MaintenanceResult> {
    const validation = commonValidation(input, adapter);
    if (validation) return validation;
    const key = `${adapter}:${input.uid}:${input.idempotencyKey}`;
    const previous = completed.get(key);
    if (previous) return { ...previous, kind: "REPLAYED" };
    try {
      const result = await execute();
      const refreshed: Extract<MaintenanceResult, { kind: "REFRESHED" }> = {
        kind: "REFRESHED",
        adapter,
        entityId: input.entityId,
        sourceVersion: result.sourceVersion,
        ...(result.referenceId ? { referenceId: result.referenceId } : {}),
      };
      completed.set(key, refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof MaintenanceSkipError) {
        return { kind: "SKIPPED", adapter, entityId: input.entityId, reason: error.reason };
      }
      return { kind: "FAILED", adapter, entityId: input.entityId, reason: "DEPENDENCY_UNAVAILABLE" };
    }
  };
}

export function getBrainDumpMaintenanceSessionVersion(session: BrainDumpReviewSession) {
  return sessionVersion(session);
}

export function createTrustedAutomationMaintenanceAdapters(dependencies: TrustedAutomationMaintenanceDependencies = {}) {
  const brainDump = {
    store: dependencies.brainDump?.store,
    provider: dependencies.brainDump?.provider,
    process: dependencies.brainDump?.process || processTypedBrainDump,
    createId: dependencies.brainDump?.createId || (() => randomUUID()),
  };
  const taskClarification = {
    repository: dependencies.taskClarification?.repository,
    provider: dependencies.taskClarification?.provider,
    generate: dependencies.taskClarification?.generate || generateValidatedTaskClarification,
    createId: dependencies.taskClarification?.createId || (() => randomUUID()),
    modelVersion: dependencies.taskClarification?.modelVersion || configuredTaskClarificationOpenAiModel(),
    promptVersion: dependencies.taskClarification?.promptVersion || TASK_CLARIFICATION_PROMPT_VERSION,
  };
  const run = createRunner();

  return {
    async maintainBrainDump(input: BrainDumpMaintenanceRequest): Promise<MaintenanceResult> {
      return run(input, "BRAIN_DUMP", async () => {
        const store = brainDump.store || createFirestoreBrainDumpSessionStore();
        const session = await store.getSession(input.uid, input.entityId);
        if (!session || session.ownerUid !== input.uid || session.id !== input.entityId) throw new MaintenanceSkipError("ENTITY_NOT_FOUND");
        const currentVersion = sessionVersion(session);
        if (currentVersion !== input.entityVersion) throw new MaintenanceSkipError("STALE_REFERENCE");

        if (input.action === "EXPIRE") {
          if (session.state !== "review") throw new MaintenanceSkipError("ENTITY_NOT_ELIGIBLE");
          await store.saveSession(redactExpiredBrainDumpSession(session, input.nowMs));
          return { sourceVersion: currentVersion };
        }

        if (session.state !== "review" || !session.source.rawText.trim() || session.expiresAtMs <= input.nowMs) {
          if (session.state === "review" && session.expiresAtMs <= input.nowMs) {
            await store.saveSession(redactExpiredBrainDumpSession(session, input.nowMs));
          }
          throw new MaintenanceSkipError("ENTITY_NOT_ELIGIBLE");
        }
        const regenerated = await brainDump.process({
          uid: input.uid,
          text: session.source.rawText,
          timezone: input.timezone,
          provider: brainDump.provider || getBrainDumpAiProvider(),
          store,
          createId: brainDump.createId,
          now: () => input.nowMs,
        });
        return { sourceVersion: sessionVersion(regenerated), referenceId: regenerated.id };
      });
    },

    async requestTaskClarification(input: TaskClarificationMaintenanceRequest): Promise<MaintenanceResult> {
      return run(input, "TASK_CLARIFICATION", async () => {
        const repository = taskClarification.repository || createFirestoreTaskClarificationRepository();
        const task = await repository.loadTask(input.uid, input.entityId);
        if (!task) throw new MaintenanceSkipError("ENTITY_NOT_FOUND");
        if (task.sourceTaskVersion !== input.entityVersion) throw new MaintenanceSkipError("STALE_REFERENCE");
        const timezone = validString(input.timezone, 120) ? input.timezone : "UTC";
        const userInstruction = normalizeTaskClarificationUserInstruction(input.userInstruction);
        const response = await taskClarification.generate(
          {
            taskId: task.taskId,
            title: task.title,
            ...(task.taskType ? { taskType: task.taskType } : {}),
            ...(task.dueDate ? { dueDate: task.dueDate } : {}),
            timezone,
            currentDate: localDateForRecommendationTimezone(timezone, input.nowMs),
            ...(userInstruction ? { userInstruction } : {}),
          },
          task.title,
          taskClarification.provider || getTaskClarificationAIProvider()
        );
        const recommendation: TaskClarificationRecommendation = createTaskClarificationRecommendation({
          id: taskClarification.createId(),
          userId: input.uid,
          task,
          response,
          modelVersion: taskClarification.modelVersion,
          promptVersion: taskClarification.promptVersion,
          userInstruction,
          nowMs: input.nowMs,
        });
        await repository.saveRecommendation(input.uid, recommendation);
        return { sourceVersion: task.sourceTaskVersion, referenceId: recommendation.id };
      });
    },
  };
}

class MaintenanceSkipError extends Error {
  constructor(readonly reason: Extract<MaintenanceResult, { kind: "SKIPPED" }>["reason"]) {
    super(reason);
  }
}

export type TrustedAutomationMaintenanceAdapters = ReturnType<typeof createTrustedAutomationMaintenanceAdapters>;
