import type { Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export class TrustedAutomationSecurityError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.name = "TrustedAutomationSecurityError";
    this.code = code;
    this.status = status;
  }
}

export async function assertTrustedAutomationAccountActive(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedUid = typeof uid === "string" ? uid.trim().slice(0, 120) : "";
  if (!normalizedUid) throw new TrustedAutomationSecurityError("AUTOMATION_OWNERSHIP_FAILED", "Automation ownership could not be verified.");
  const marker = await db.collection("deletedAccountUids").doc(normalizedUid).get();
  if (marker.exists) {
    throw new TrustedAutomationSecurityError("AUTOMATION_ACCOUNT_DELETED", "Automation is unavailable for this account.");
  }
}

export function safeAutomationFailureMessage(category: string, code: string) {
  if (code === "DEPENDENCY_UNAVAILABLE" || category === "DEPENDENCY") return "Automation dependency unavailable.";
  if (code === "TIMEOUT" || category === "TIMEOUT") return "Automation timed out before completion.";
  if (category === "VALIDATION") return "Automation validation failed.";
  if (category === "AUTHORIZATION") return "Automation authorization failed.";
  if (category === "CONFLICT") return "Automation could not run because the state changed.";
  return "Automation execution failed.";
}
