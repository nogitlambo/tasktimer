import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertExecutiveFunctionAvailableForUser, assertPlusPlanForExecutiveFunction } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

import { automationError, automationSuccess, readAutomationJsonBody, safeAutomationError } from "../shared";
import { applyAutomationSettingsPatch, AutomationSettingsPatchSchema } from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { createFirestoreAutomationSettingsRepository } from "@/app/trustedautomation/lib/trustedAutomationSettingsRepository";
import { assertTrustedAutomationAccountActive } from "@/app/trustedautomation/lib/trustedAutomationSecurity";

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertPlusPlanForExecutiveFunction(uid);
    await assertTrustedAutomationAccountActive(uid);
    const settings = await createFirestoreAutomationSettingsRepository(getFirebaseAdminDb()).loadOrCreate(uid);
    return automationSuccess(req, { settings });
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}

export async function PUT(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertExecutiveFunctionAvailableForUser(uid);
    await assertTrustedAutomationAccountActive(uid);
    const repository = createFirestoreAutomationSettingsRepository(getFirebaseAdminDb());
    const current = await repository.loadOrCreate(uid);
    const patch = AutomationSettingsPatchSchema.safeParse(await readAutomationJsonBody(req));
    if (!patch.success) return automationError(req, 400, "INVALID_SCHEMA", "Automation settings update is invalid.");
    await enforceUidRateLimit({ namespace: "trusted-automation/settings", uid, windowMs: 60_000, maxEvents: 30, code: "automation/rate-limited", message: "Please wait before trying Trusted Automation again." });
    const next = applyAutomationSettingsPatch(current, patch.data, Date.now());
    await repository.save(uid, next);
    return automationSuccess(req, { settings: next });
  } catch (error) {
    const safe = safeAutomationError(error, "INVALID_SCHEMA");
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
