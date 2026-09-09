import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { AUTOMATION_RULE_TYPE_VALUES } from "@/app/trustedautomation/lib/trustedAutomationContract";
import { createFirestoreAutomationHistoryRepository } from "@/app/trustedautomation/lib/trustedAutomationHistoryRepository";
import { createFirestoreAutomationSettingsRepository } from "@/app/trustedautomation/lib/trustedAutomationSettingsRepository";
import { evaluateTrustRecommendation, type TrustObservation } from "@/app/trustedautomation/lib/trustedAutomationTrust";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

function asMillis(value: string) {
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : 0;
}

function toObservation(item: Awaited<ReturnType<ReturnType<typeof createFirestoreAutomationHistoryRepository>["list"]>>["items"][number]): TrustObservation {
  return {
    ruleId: item.ruleId,
    outcome: item.outcome,
    accepted: item.outcome === "SUCCESS" && !item.reasonCodes.includes("CONFIRMATION_REQUIRED"),
    undoUsed: item.reasonCodes.includes("UNDO_USED"),
    staleConflict: item.reasonCodes.includes("STALE") || item.reasonCodes.includes("CONFLICT"),
    rejected: item.reasonCodes.includes("USER_REJECTED"),
    reasonCodes: item.reasonCodes,
    createdAtMs: asMillis(item.createdAt),
    durationMs: item.durationMs,
  };
}

function asErrorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code: string }).code) : "automation/internal";
}

function asErrorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
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

    const [settings, historyPage] = await Promise.all([
      createFirestoreAutomationSettingsRepository(db).loadOrCreate(uid),
      createFirestoreAutomationHistoryRepository(db).list(uid, { limit: 50 }),
    ]);
    const observations = historyPage.items.map(toObservation);
    const recommendations = AUTOMATION_RULE_TYPE_VALUES.map((ruleId) => {
      const rule = settings.rules.find((candidate) => candidate.ruleId === ruleId);
      return evaluateTrustRecommendation({
        ruleId,
        currentTrustLevel: rule?.trustLevel || "ASSISTED",
        observations,
      });
    }).filter((recommendation) => recommendation.kind !== "NONE");

    return withAuthenticatedApiCors(req, NextResponse.json({ success: true, data: { recommendations } }));
  } catch (error) {
    const status = asErrorStatus(error);
    return withAuthenticatedApiCors(
      req,
      NextResponse.json(
        {
          success: false,
          error: {
            code: asErrorCode(error),
            message: status === 500 ? "Trusted Automation trust suggestions could not be loaded." : error instanceof Error ? error.message : "Trusted Automation trust suggestions could not be loaded.",
          },
        },
        { status }
      )
    );
  }
}
