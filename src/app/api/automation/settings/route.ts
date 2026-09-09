import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { createFirestoreAutomationSettingsRepository } from "@/app/trustedautomation/lib/trustedAutomationSettingsRepository";
import { applyAutomationSettingsPatch } from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asErrorCode(error: unknown, fallback: string) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : fallback;
}

function asErrorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function errorResponse(req: Request, error: unknown, fallback: string) {
  const status = asErrorStatus(error);
  return withAuthenticatedApiCors(
    req,
    NextResponse.json(
      {
        success: false,
        error: {
          code: asErrorCode(error, status === 500 ? "automation/internal" : "automation/request-failed"),
          message: status === 500 ? fallback : error instanceof Error ? error.message : fallback,
        },
      },
      { status }
    )
  );
}

async function requireAutomationUser(req: Request, body?: Record<string, unknown> | null) {
  const { uid } = await verifyFirebaseRequestUser(req, body);
  const db = getFirebaseAdminDb();
  await assertExecutiveFunctionAvailableForUser(uid, db);
  if (await isDeletedAccountUid(db, uid)) {
    throw Object.assign(new Error("This account has been deleted."), { status: 410, code: "auth/account-deleted" });
  }
  return { uid, db };
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid, db } = await requireAutomationUser(req);
    const settings = await createFirestoreAutomationSettingsRepository(db).loadOrCreate(uid);
    return withAuthenticatedApiCors(req, NextResponse.json({ success: true, data: { settings } }));
  } catch (error) {
    return errorResponse(req, error, "Trusted Automation settings could not be loaded.");
  }
}

export async function PUT(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { uid, db } = await requireAutomationUser(req, body);
    const repository = createFirestoreAutomationSettingsRepository(db);
    const current = await repository.loadOrCreate(uid);
    const settings = applyAutomationSettingsPatch(current, body);
    await repository.save(uid, settings);
    return withAuthenticatedApiCors(req, NextResponse.json({ success: true, data: { settings } }));
  } catch (error) {
    return errorResponse(req, error, "Trusted Automation settings could not be saved.");
  }
}
