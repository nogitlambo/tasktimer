import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreNextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";

type RouteContext = { params: Promise<{ recommendationId?: string }> };
const feedbackCodes = new Set(["wrong_timing", "too_big", "not_important", "blocked", "already_handled", "not_today"]);

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
    if (await isDeletedAccountUid(db, uid)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    const recommendationId = asString((await context.params).recommendationId);
    const feedbackCode = asString(body.feedbackCode, 40) || null;
    if (feedbackCode && !feedbackCodes.has(feedbackCode)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Unsupported dismissal feedback.", code: "recommendation/invalid-feedback" }, { status: 400 }));
    const result = await createFirestoreNextBestActionRepository(db).dismissRecommendation({ uid, recommendationId, nowMs: Date.now(), feedbackCode });
    if (result === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Next Best Action recommendation not found.", code: "recommendation/not-found" }, { status: 404 }));
    if (result === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation has expired.", code: "recommendation/expired" }, { status: 409 }));
    if (result === "not-active") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This recommendation is no longer active.", code: "recommendation/not-active" }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result === "idempotent", status: "DISMISSED" }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const code = asString((error as { code?: unknown })?.code, 120) || "recommendation/internal";
    if (Number.isInteger(status) && status >= 400 && status <= 599) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/recommendations/next-best-action/dismiss] Request failed", { code, status: 500 });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "Could not dismiss the recommendation.", code: "recommendation/internal" }, { status: 500 }));
  }
}
