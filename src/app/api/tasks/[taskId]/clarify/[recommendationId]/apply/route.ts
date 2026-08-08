import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  buildTaskClarificationApplyPatch,
  buildTaskClarificationSelectedSubtasks,
  parseTaskClarificationApplyRequest,
} from "@/app/taskclarification/lib/taskClarificationApply";
import { createFirestoreTaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../../../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../../../../shared/cors";

type RouteContext = { params: Promise<{ taskId?: string; recommendationId?: string }> };

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function recommendationReviewPayload(recommendation: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(recommendation).filter(([key]) => key !== "userId" && key !== "auditExpiresAt"));
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const params = await context.params;
    const taskId = asString(params.taskId, 160);
    const recommendationId = asString(params.recommendationId, 160);
    if (!taskId || !recommendationId) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }

    const applyRequest = parseTaskClarificationApplyRequest(body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }

    const repository = createFirestoreTaskClarificationRepository(db);
    const recommendation = await repository.loadRecommendation(uid, recommendationId);
    if (!recommendation || recommendation.userId !== uid || recommendation.taskId !== taskId) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }
    const isIdempotentReplay = recommendation.applyStatus === "APPLIED" && recommendation.applyIdempotencyKey === applyRequest.idempotencyKey;
    if (!isIdempotentReplay && (recommendation.status !== "ACTIVE" || Date.parse(recommendation.expiresAt) <= Date.now())) {
      if (recommendation.status === "ACTIVE" && Date.parse(recommendation.expiresAt) <= Date.now()) {
        await repository.expireRecommendation(uid, recommendationId, Date.now());
      }
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification recommendation has expired.", code: "task-clarification/expired" }, { status: 409 }));
    }

    const result = await repository.applyRecommendation({
      uid,
      recommendationId,
      taskId,
      sourceTaskVersion: recommendation.sourceTaskVersion,
      idempotencyKey: applyRequest.idempotencyKey,
      patch: buildTaskClarificationApplyPatch(applyRequest),
      acceptedFields: applyRequest.acceptedFields,
      rejectedFields: [],
      subtasks: buildTaskClarificationSelectedSubtasks(applyRequest),
      nowMs: Date.now(),
    });
    if (result.kind === "not-found") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }
    if (result.kind === "stale") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "The task has changed. Please prepare a new clarification proposal.", code: "task-clarification/stale-task" }, { status: 409 }));
    }
    if (result.kind === "expired") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification recommendation has expired.", code: "task-clarification/expired" }, { status: 409 }));
    }
    if (result.kind === "already-applied") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification recommendation has already been applied.", code: "task-clarification/already-applied" }, { status: 409 }));
    }
    if (result.kind === "invalid-subtasks") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "One or more selected subtasks are no longer valid.", code: "task-clarification/invalid-subtasks" }, { status: 400 }));
    }
    if (result.kind !== "applied" && result.kind !== "idempotent") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not apply this clarification.", code: "task-clarification/internal" }, { status: 500 }));
    }
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result.kind === "idempotent", recommendation: recommendationReviewPayload(result.recommendation as unknown as Record<string, unknown>) }));
  } catch (error) {
    if (error instanceof ZodError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Choose one supported Task change and provide an idempotency key.", code: "task-clarification/invalid-apply" }, { status: 400 }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "TaskLaunch could not apply this clarification."));
    }
    console.error("[api/task-clarification/apply] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal",
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not apply this clarification.", code: "internal" }, { status: 500 }));
  }
}
