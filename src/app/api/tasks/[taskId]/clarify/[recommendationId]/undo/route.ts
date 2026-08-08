import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreTaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../../../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../../../../shared/cors";

type RouteContext = { params: Promise<{ taskId?: string; recommendationId?: string }> };
const UndoRequestSchema = z.object({ idempotencyKey: z.string().trim().min(1).max(160) }).strict();

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
    const { idempotencyKey } = UndoRequestSchema.parse(body);
    const params = await context.params;
    const taskId = asString(params.taskId, 160);
    const recommendationId = asString(params.recommendationId, 160);
    if (!taskId || !recommendationId) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    const result = await createFirestoreTaskClarificationRepository(db).undoRecommendation({
      uid,
      recommendationId,
      taskId,
      idempotencyKey,
      nowMs: Date.now(),
    });
    if (result.kind === "not-found") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }
    if (result.kind === "not-reversible" || result.kind === "already-undone") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification application can no longer be undone.", code: "task-clarification/not-reversible" }, { status: 409 }));
    }
    if (result.kind === "expired") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "The undo window has expired.", code: "task-clarification/undo-expired" }, { status: 409 }));
    }
    if (result.kind !== "reversed" && result.kind !== "partially-reversed" && result.kind !== "idempotent") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not undo this clarification.", code: "task-clarification/internal" }, { status: 500 }));
    }
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({
        ok: true,
        idempotent: result.kind === "idempotent",
        partial: result.kind === "partially-reversed",
        recommendation: recommendationReviewPayload(result.recommendation as unknown as Record<string, unknown>),
      })
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Provide an idempotency key to undo this clarification.", code: "task-clarification/invalid-undo" }, { status: 400 }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "TaskLaunch could not undo this clarification."));
    }
    console.error("[api/task-clarification/undo] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal",
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not undo this clarification.", code: "internal" }, { status: 500 }));
  }
}
