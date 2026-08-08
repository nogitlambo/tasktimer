import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { createFirestoreRecoverySessionRepository } from "@/app/recovery/lib/recoverySessionRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

type RouteContext = { params: Promise<{ recoveryId?: string }> };

function asString(value: unknown, maxLength = 180) {
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
    await enforceUidRateLimit({ namespace: "recovery/complete", uid, windowMs: 60_000, maxEvents: 12, code: "recovery/rate-limited", message: "Please wait before completing another Recovery Mode session." });
    const recoveryId = asString((await context.params).recoveryId);
    const repository = createFirestoreRecoverySessionRepository(db);
    const existing = await repository.loadSession(uid, recoveryId);
    if (!existing || existing.userId !== uid) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Recovery Mode session not found.", code: "recovery/not-found" }, { status: 404 }));
    if (existing.status !== "ACTIVE" && existing.status !== "PARTIALLY_APPLIED") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This Recovery Mode session cannot be completed.", code: "recovery/not-active" }, { status: 409 }));
    const completed = await repository.completeSession(uid, recoveryId, Date.now());
    if (!completed || completed.status !== "COMPLETED") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This Recovery Mode session is no longer active.", code: "recovery/not-active" }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, session: completed }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    const code = asString((error as { code?: unknown })?.code, 120) || "recovery/internal";
    if (safeStatus < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status: safeStatus }));
    console.error("[api/executive-function/recovery/complete] Request failed", { code, status: safeStatus });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not complete Recovery Mode right now.", code: "recovery/internal" }, { status: 500 }));
  }
}
