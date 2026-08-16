import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreNextBestActionRepository } from "@/app/nextbestaction/lib/nextBestActionRepository";

function asString(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    await assertExecutiveFunctionAvailableForUser(uid, db);
    if (await isDeletedAccountUid(db, uid)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    const completedTaskId = asString(body.completedTaskId);
    if (!completedTaskId) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A completed task is required.", code: "recommendation/invalid-task" }, { status: 400 }));
    const releasedCount = await createFirestoreNextBestActionRepository(db).releaseSuppressionsForCompletedTask({ uid, completedTaskId, nowMs: Date.now() });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, releasedCount }));
  } catch (error) {
    const status = Number((error as { status?: unknown })?.status);
    const code = asString((error as { code?: unknown })?.code, 120) || "recommendation/internal";
    if (Number.isInteger(status) && status >= 400 && status <= 599) return withAuthenticatedApiCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "The request could not be completed.", code }, { status }));
    console.error("[api/next-best-action/release-suppressions] Request failed", { code, status: 500 });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "Could not release Next Best Action suppressions.", code: "recommendation/internal" }, { status: 500 }));
  }
}
