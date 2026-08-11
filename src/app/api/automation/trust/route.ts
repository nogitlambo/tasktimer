import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { createFirestoreAutomationHistoryRepository } from "@/app/trustedautomation/lib/trustedAutomationHistoryRepository";
import { createFirestoreAutomationSettingsRepository } from "@/app/trustedautomation/lib/trustedAutomationSettingsRepository";
import { assertTrustedAutomationAccountActive } from "@/app/trustedautomation/lib/trustedAutomationSecurity";
import { buildPrivacySafeTrustAnalyticsEvent, evaluateTrustRecommendation, type TrustObservation } from "@/app/trustedautomation/lib/trustedAutomationTrust";
import { automationError, automationSuccess, safeAutomationError } from "../shared";

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

function toObservation(item: Awaited<ReturnType<ReturnType<typeof createFirestoreAutomationHistoryRepository>["list"]>>["items"][number]): TrustObservation {
  const reasonCodes = item.reasonCodes;
  return {
    ruleId: item.ruleId,
    outcome: item.outcome,
    accepted: item.trigger === "USER_REQUESTED",
    undoUsed: reasonCodes.includes("UNDO_USED"),
    staleConflict: reasonCodes.includes("STALE") || reasonCodes.includes("CONFLICT"),
    rejected: reasonCodes.includes("USER_REJECTED"),
    reasonCodes,
    createdAtMs: Date.parse(item.createdAt),
    durationMs: item.durationMs,
  };
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertTrustedAutomationAccountActive(uid);
    await enforceUidRateLimit({ namespace: "trusted-automation/trust", uid, windowMs: 60_000, maxEvents: 20, code: "automation/rate-limited", message: "Please wait before trying Trusted Automation again." });
    const db = getFirebaseAdminDb();
    await assertExecutiveFunctionAvailableForUser(uid, db);
    const [settings, history] = await Promise.all([
      createFirestoreAutomationSettingsRepository(db).loadOrCreate(uid),
      createFirestoreAutomationHistoryRepository(db).list(uid, { limit: 50 }),
    ]);
    const observations = history.items.map(toObservation);
    const recommendations = settings.rules
      .map((rule) => evaluateTrustRecommendation({
        ruleId: rule.ruleId,
        currentTrustLevel: rule.trustLevel,
        observations,
      }))
      .filter((recommendation) => recommendation.kind !== "NONE");
    const analytics = recommendations.map((recommendation) => buildPrivacySafeTrustAnalyticsEvent({
      eventName: "trusted_automation_recommendation_shown",
      ruleCategory: recommendation.ruleId,
      count: recommendation.acceptedSuccessCount,
      reasonCodes: recommendation.reasonCodes.includes("SUCCESS_THRESHOLD_MET") ? ["SUCCESS"] : ["FAILURE"],
    }));
    return automationSuccess(req, { recommendations, analytics });
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
