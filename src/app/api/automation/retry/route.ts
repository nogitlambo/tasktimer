import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertPlusPlanForExecutiveFunction } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";

import { RetryAutomationRequestSchema } from "@/app/trustedautomation/lib/trustedAutomationDtos";
import { createFirestoreAutomationExecutionRepository } from "@/app/trustedautomation/lib/trustedAutomationExecutionRepository";
import { retryAutomationRequest } from "@/app/trustedautomation/lib/trustedAutomationApiService";
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
    const parsed = RetryAutomationRequestSchema.safeParse(await readAutomationJsonBody(req));
    if (!parsed.success) return automationError(req, 400, "INVALID_SCHEMA", "Retry request is invalid.");
    await enforceUidRateLimit({ namespace: "trusted-automation/retry", uid, windowMs: 60_000, maxEvents: 10, code: "automation/rate-limited", message: "Please wait before trying Trusted Automation again." });
    const repository = createFirestoreAutomationExecutionRepository(getFirebaseAdminDb());
    const execution = await repository.get(uid, parsed.data.executionId);
    if (!execution || execution.state !== "FAILED" || execution.error?.category !== "TRANSIENT") {
      return automationError(req, 409, "RETRY_NOT_ELIGIBLE", "Only transient failed executions can be retried.");
    }
    const result = await retryAutomationRequest({ uid, request: parsed.data });
    return automationSuccess(req, { result });
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
