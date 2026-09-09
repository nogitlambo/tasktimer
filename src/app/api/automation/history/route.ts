import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { createFirestoreAutomationHistoryRepository } from "@/app/trustedautomation/lib/trustedAutomationHistoryRepository";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asErrorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "automation/internal";
}

function asErrorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function normalizeLimit(value: unknown) {
  const limit = Number(value);
  return Number.isInteger(limit) ? Math.min(50, Math.max(1, limit)) : 20;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    const db = getFirebaseAdminDb();
    await assertExecutiveFunctionAvailableForUser(uid, db);
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json({ success: false, error: { code: "auth/account-deleted", message: "This account has been deleted." } }, { status: 410 })
      );
    }
    const url = new URL(req.url);
    const result = await createFirestoreAutomationHistoryRepository(db).list(uid, {
      limit: normalizeLimit(url.searchParams.get("limit")),
      cursor: url.searchParams.get("cursor") || undefined,
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ success: true, data: result }));
  } catch (error) {
    const status = asErrorStatus(error);
    return withAuthenticatedApiCors(
      req,
      NextResponse.json(
        {
          success: false,
          error: {
            code: asErrorCode(error),
            message: status === 500 ? "Automation history could not be loaded." : error instanceof Error ? error.message : "Automation history could not be loaded.",
          },
        },
        { status }
      )
    );
  }
}
