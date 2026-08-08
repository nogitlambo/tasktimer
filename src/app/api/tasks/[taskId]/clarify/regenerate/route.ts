import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  createTaskClarificationRecommendation,
  normalizeTaskClarificationUserInstruction,
  TASK_CLARIFICATION_PROMPT_VERSION,
  TaskClarificationInputError,
} from "@/app/taskclarification/lib/taskClarification";
import { generateValidatedTaskClarification } from "@/app/taskclarification/lib/taskClarificationGeneration";
import {
  configuredTaskClarificationOpenAiModel,
  TaskClarificationProviderError,
  TaskClarificationProviderUnavailableError,
} from "@/app/taskclarification/lib/taskClarificationProvider";
import {
  getTaskClarificationQuota,
  loadTaskClarificationPlan,
  TASK_CLARIFICATION_QUOTA_WINDOW_MS,
} from "@/app/taskclarification/lib/taskClarificationEntitlements";
import { createFirestoreTaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../../../shared/cors";
import { ApiRateLimitError, enforceUidRateLimit } from "../../../../shared/rateLimit";

const REGENERATION_FAILURE_MESSAGE = "TaskLaunch could not prepare a reliable regeneration. Your task has not been changed.";

type RouteContext = { params: Promise<{ taskId?: string }> };

class RegenerationContractError extends Error {
  constructor(
    message: string,
    public readonly status: 404 | 409,
    public readonly code: string
  ) {
    super(message);
  }
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeTimezone(value: unknown) {
  const candidate = asString(value, 120) || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

function localDateForTimezone(timezone: string, nowMs: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function recommendationReviewPayload(recommendation: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(recommendation).filter(([key]) => key !== "userId" && key !== "auditExpiresAt"));
}

function errorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal";
}

function errorStatus(error: unknown) {
  return Number.isFinite(Number((error as { status?: unknown })?.status)) ? Number((error as { status?: unknown }).status) : 500;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request, context: RouteContext) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const { taskId: rawTaskId } = await context.params;
    const taskId = asString(rawTaskId, 160);
    const recommendationId = asString(body.recommendationId, 160);
    if (!taskId || !recommendationId) {
      throw new RegenerationContractError("Clarification recommendation not found.", 404, "task-clarification/not-found");
    }

    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }

    const repository = createFirestoreTaskClarificationRepository(db);
    const source = await repository.loadRecommendation(uid, recommendationId);
    if (!source || source.taskId !== taskId || source.userId !== uid) {
      throw new RegenerationContractError("Clarification recommendation not found.", 404, "task-clarification/not-found");
    }
    const nowMs = Date.now();
    if (source.status === "ACTIVE" && Date.parse(source.expiresAt) <= nowMs) {
      await repository.expireRecommendation(uid, source.id, nowMs);
      throw new RegenerationContractError("This clarification recommendation can no longer be regenerated.", 409, "task-clarification/regeneration-used");
    }
    if (source.status !== "ACTIVE" || source.regenerationCount > 0 || source.sourceRecommendationId) {
      throw new RegenerationContractError("This clarification recommendation can no longer be regenerated.", 409, "task-clarification/regeneration-used");
    }

    const task = await repository.loadTask(uid, taskId);
    if (!task) throw new RegenerationContractError("Task not found.", 404, "task/not-found");
    if (task.sourceTaskVersion !== source.sourceTaskVersion) {
      throw new RegenerationContractError("The task has changed. Please prepare a new clarification proposal.", 409, "task-clarification/stale-task");
    }

    const plan = await loadTaskClarificationPlan(uid, db);
    await enforceUidRateLimit({
      namespace: "task-clarification-generation",
      uid,
      windowMs: TASK_CLARIFICATION_QUOTA_WINDOW_MS,
      maxEvents: getTaskClarificationQuota(plan),
      code: "task-clarification/rate-limited",
      message: "You have reached your task clarification limit. Please try again later.",
    });

    const userInstruction = normalizeTaskClarificationUserInstruction(body.instruction);
    const timezone = normalizeTimezone(body.timezone);
    const claimedSource = await repository.claimRecommendationRegeneration(uid, source.id);
    if (!claimedSource) {
      throw new RegenerationContractError("This clarification recommendation can no longer be regenerated.", 409, "task-clarification/regeneration-used");
    }
    const validatedResponse = await generateValidatedTaskClarification(
      {
        taskId: task.taskId,
        title: task.title,
        ...(task.taskType ? { taskType: task.taskType } : {}),
        ...(task.dueDate ? { dueDate: task.dueDate } : {}),
        timezone,
        currentDate: localDateForTimezone(timezone, nowMs),
        ...(userInstruction ? { userInstruction } : {}),
      },
      task.title
    );
    const recommendation = createTaskClarificationRecommendation({
      id: randomUUID(),
      userId: uid,
      task,
      response: validatedResponse,
      modelVersion: configuredTaskClarificationOpenAiModel(),
      promptVersion: TASK_CLARIFICATION_PROMPT_VERSION,
      userInstruction,
      sourceRecommendationId: claimedSource.id,
      regenerationCount: claimedSource.regenerationCount + 1,
      nowMs,
    });
    await repository.saveRecommendation(uid, recommendation);
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, recommendation: recommendationReviewPayload(recommendation as unknown as Record<string, unknown>) }));
  } catch (error) {
    if (error instanceof RegenerationContractError || error instanceof TaskClarificationInputError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    if (error instanceof ApiRateLimitError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    if (error instanceof TaskClarificationProviderUnavailableError || error instanceof TaskClarificationProviderError || error instanceof ZodError || errorCode(error) === "task-clarification/provider-invalid") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: REGENERATION_FAILURE_MESSAGE, code: errorCode(error) }, { status: 502 }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, REGENERATION_FAILURE_MESSAGE));
    }
    console.error("[api/task-clarification/regenerate] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: errorCode(error),
      status: errorStatus(error),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: REGENERATION_FAILURE_MESSAGE, code: "internal" }, { status: 500 }));
  }
}
