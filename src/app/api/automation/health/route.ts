import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

import { assertTrustedAutomationAccountActive } from "@/app/trustedautomation/lib/trustedAutomationSecurity";
import { buildTrustedAutomationHealth, loadTrustedAutomationOperationalConfig, TRUSTED_AUTOMATION_ALERT_CODES } from "@/app/trustedautomation/lib/trustedAutomationOperations";
import { automationError, automationSuccess, safeAutomationError } from "../shared";

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertTrustedAutomationAccountActive(uid);
    await enforceUidRateLimit({ namespace: "trusted-automation/health", uid, windowMs: 60_000, maxEvents: 30, code: "automation/rate-limited", message: "Please wait before checking Trusted Automation health again." });
    const db = getFirebaseAdminDb();
    await assertExecutiveFunctionAvailableForUser(uid, db);
    let firestore: "ok" | "failed" = "ok";
    try {
      await db.collection("users").doc(uid).collection("automationSettings").doc("settings").get();
    } catch {
      firestore = "failed";
    }
    const health = buildTrustedAutomationHealth({ firestore, queue: "ok", dependencies: "ok" });
    return automationSuccess(req, {
      ...health,
      config: loadTrustedAutomationOperationalConfig(),
      alertCodes: TRUSTED_AUTOMATION_ALERT_CODES,
      contentSafe: true,
    });
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
