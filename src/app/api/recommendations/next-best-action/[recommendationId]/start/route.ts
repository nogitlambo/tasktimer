import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreNextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";

type RouteContext = { params: Promise<{ recommendationId?: string }> };

function asString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    const recommendationId = asString((await context.params).recommendationId);
    if (!recommendationId) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Next Best Action recommendation not found.", code: "recommendation/not-found" }, { status: 404 }));
    }
    const result = await createFirestoreNextBestActionRepository(db).startRecommendation({ uid, recommendationId, nowMs: Date.now() });
    if (result.kind === "not-found") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Next Best Action recommendation not found.", code: "recommendation/not-found" }, { status: 404 }));
    }
    if (result.kind === "expired") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation has expired. Refresh to choose again.", code: "recommendation/expired" }, { status: 409 }));
    }
    if (result.kind === "stale") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation is out of date. Refresh to choose again.", code: "recommendation/stale" }, { status: 409 }));
    }
    if (result.kind === "ineligible") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This task is no longer eligible to start. Refresh to choose again.", code: "recommendation/ineligible" }, { status: 409 }));
    }
    if (result.kind !== "started" && result.kind !== "idempotent") {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation can no longer be started. Refresh to choose again.", code: "recommendation/not-active" }, { status: 409 }));
    }
    return withAuthenticatedApiCors(req, NextResponse.json({
      ok: true,
      idempotent: result.kind === "idempotent",
      recommendation: {
        recommendationId: result.recommendation.id,
        type: result.recommendation.type,
        taskId: result.recommendation.taskId,
        status: result.recommendation.status,
        startedAt: result.recommendation.startedAt,
      },
    }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const code = asString((error as { code?: unknown })?.code, 120) || "recommendation/internal";
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    }
    console.error("[api/recommendations/next-best-action/start] Request failed", { code, status: 500 });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "Could not start the recommended task.", code: "recommendation/internal" }, { status: 500 }));
  }
}
