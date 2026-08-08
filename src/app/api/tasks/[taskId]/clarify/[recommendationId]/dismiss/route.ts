import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreTaskClarificationRepository } from "@/app/taskclarification/lib/taskClarificationRepository";
import { createApiAuthErrorResponse, verifyFirebaseRequestUser } from "../../../../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../../../../shared/cors";

type RouteContext = { params: Promise<{ taskId?: string; recommendationId?: string }> };

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
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
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    const result = await createFirestoreTaskClarificationRepository(db).dismissRecommendation(uid, recommendationId, taskId, Date.now());
    if (result === "not-found") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Clarification recommendation not found.", code: "task-clarification/not-found" }, { status: 404 }));
    }
    if (result === "expired") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification recommendation has expired.", code: "task-clarification/expired" }, { status: 409 }));
    }
    if (result === "not-active") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This clarification recommendation is no longer active.", code: "task-clarification/not-active" }, { status: 409 }));
    }
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result === "idempotent", status: "DISMISSED" }));
  } catch (error) {
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "TaskLaunch could not dismiss this clarification."));
    }
    console.error("[api/task-clarification/dismiss] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal",
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not dismiss this clarification.", code: "internal" }, { status: 500 }));
  }
}
