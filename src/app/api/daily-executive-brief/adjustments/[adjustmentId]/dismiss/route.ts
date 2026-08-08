import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { createFirestoreDailyExecutiveBriefRepository } from "@/app/dailyexecutivebrief/lib/dailyExecutiveBriefRepository";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request, context: { params: Promise<{ adjustmentId: string }> }) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    const date = asString(body.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return withAuthenticatedApiCors(req, NextResponse.json({ error: "A valid brief date is required.", code: "brief/invalid-date" }, { status: 400 }));
    const { adjustmentId } = await context.params;
    const decodedAdjustmentId = decodeURIComponent(asString(adjustmentId, 320));
    const normalizedAdjustmentId = encodeURIComponent(decodedAdjustmentId);
    const result = await createFirestoreDailyExecutiveBriefRepository(db).dismissAdjustment({ uid, date, adjustmentId: normalizedAdjustmentId, nowMs: Date.now() });
    if (result === "not-found") return withAuthenticatedApiCors(req, NextResponse.json({ error: "That adjustment is no longer available.", code: "brief/adjustment-not-found" }, { status: 404 }));
    if (result === "expired") return withAuthenticatedApiCors(req, NextResponse.json({ error: "This brief has expired. Refresh it before reviewing adjustments.", code: "brief/expired" }, { status: 409 }));
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, status: result }));
  } catch {
    return withAuthenticatedApiCors(req, NextResponse.json({ error: "TaskLaunch could not update that adjustment.", code: "brief/internal" }, { status: 500 }));
  }
}
