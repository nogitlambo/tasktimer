import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertPlusPlanForExecutiveFunction } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

import { ExecuteAutomationRequestSchema } from "@/app/trustedautomation/lib/trustedAutomationDtos";
import { createFirestoreAutomationSettingsRepository } from "@/app/trustedautomation/lib/trustedAutomationSettingsRepository";
import { executeAutomationRequest } from "@/app/trustedautomation/lib/trustedAutomationApiService";
import { assertTrustedAutomationAccountActive } from "@/app/trustedautomation/lib/trustedAutomationSecurity";
import { automationError, automationSuccess, readAutomationJsonBody, safeAutomationError } from "../shared";

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertPlusPlanForExecutiveFunction(uid);
    await assertTrustedAutomationAccountActive(uid);
    const parsed = ExecuteAutomationRequestSchema.safeParse(await readAutomationJsonBody(req));
    if (!parsed.success) return automationError(req, 400, "INVALID_SCHEMA", "Execute request is invalid.");
    await enforceUidRateLimit({ namespace: "trusted-automation/execute", uid, windowMs: 60_000, maxEvents: 30, code: "automation/rate-limited", message: "Please wait before trying Trusted Automation again." });
    const settings = await createFirestoreAutomationSettingsRepository(getFirebaseAdminDb()).loadOrCreate(uid);
    const result = await executeAutomationRequest({ uid, settings, request: parsed.data });
    return automationSuccess(req, { result });
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
