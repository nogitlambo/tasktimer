import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { createFirestoreRecoveryApplyRepository } from "@/app/recovery/lib/recoveryApplyRepository";
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
    await enforceUidRateLimit({ namespace: "recovery/undo", uid, windowMs: 60_000, maxEvents: 6, code: "recovery/rate-limited", message: "Please wait before undoing another Recovery Mode change." });
    const recoveryId = asString((await context.params).recoveryId);
    const idempotencyKey = asString(body.idempotencyKey);
    if (!recoveryId || !idempotencyKey) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A recovery id and undo idempotency key are required.", code: "recovery/invalid-undo" }, { status: 400 }));
    const result = await createFirestoreRecoveryApplyRepository(db).undoSession({ uid, recoveryId, idempotencyKey, nowMs: Date.now() });
    if (result.kind === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Recovery Mode session not found.", code: "recovery/not-found" }, { status: 404 }));
    if (result.kind === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "The Recovery Mode undo window has expired.", code: "recovery/undo-expired", session: result.session || null, results: result.results || [] }, { status: 409 }));
    if (result.kind === "conflict") return withAuthenticatedApiCors(req, NextResponse.json({ error: "Recovery Mode cannot undo a task that changed afterward.", code: "recovery/undo-conflict", session: result.session || null, results: result.results || [] }, { status: 409 }));
    if (result.kind === "invalid") return withAuthenticatedApiCors(req, NextResponse.json({ error: "These Recovery Mode changes cannot be undone.", code: "recovery/invalid-undo", session: result.session || null, results: result.results || [] }, { status: 409 }));
    if (result.results?.some((entry) => entry.outcome === "STALE")) return withAuthenticatedApiCors(req, NextResponse.json({ error: "Recovery Mode could not undo every change because a task changed afterward.", code: "recovery/undo-conflict", session: result.session || null, results: result.results || [] }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, idempotent: result.kind === "idempotent", session: result.session || null, results: result.results || [] }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
    const code = asString((error as { code?: unknown })?.code, 120) || "recovery/internal";
    if (safeStatus < 500) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status: safeStatus }));
    console.error("[api/executive-function/recovery/undo] Request failed", { code, status: safeStatus });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not undo the Recovery Mode changes right now.", code: "recovery/internal" }, { status: 500 }));
  }
}
