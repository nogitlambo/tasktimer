import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { assertPlusPlanForExecutiveFunction } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { assertTrustedAutomationAccountActive } from "@/app/trustedautomation/lib/trustedAutomationSecurity";

import { AutomationHistoryOutcomeSchema } from "@/app/trustedautomation/lib/trustedAutomationPersistence";
import { createFirestoreAutomationHistoryRepository } from "@/app/trustedautomation/lib/trustedAutomationHistoryRepository";
import { automationError, automationSuccess, safeAutomationError } from "../shared";

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    await assertPlusPlanForExecutiveFunction(uid);
    await assertTrustedAutomationAccountActive(uid);
    const url = new URL(req.url);
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit == null ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return automationError(req, 400, "INVALID_SCHEMA", "History limit must be an integer between 1 and 50.");
    }
    const rawOutcome = url.searchParams.get("outcome") || undefined;
    if (rawOutcome && !AutomationHistoryOutcomeSchema.safeParse(rawOutcome).success) {
      return automationError(req, 400, "INVALID_ENUM", "History outcome is not supported.");
    }
    const page = await createFirestoreAutomationHistoryRepository(getFirebaseAdminDb()).list(uid, {
      limit,
      cursor: url.searchParams.get("cursor") || undefined,
      outcome: rawOutcome as never,
    });
    return automationSuccess(req, page);
  } catch (error) {
    const safe = safeAutomationError(error);
    return automationError(req, safe.status, safe.code, safe.message);
  }
}
