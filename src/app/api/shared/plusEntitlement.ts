import type { Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export const PLUS_REQUIRED_CODE = "plan/plus-required";
export const PLUS_REQUIRED_MESSAGE = "Upgrade to PLUS to use executive function features.";
export const PLUS_REQUIRED_STATUS = 402;

export type ServerTaskTimerPlan = "free" | "plus" | "plus_lifetime";

export class PlusPlanRequiredError extends Error {
  status = PLUS_REQUIRED_STATUS;
  code = PLUS_REQUIRED_CODE;
  plan: ServerTaskTimerPlan;

  constructor(plan: ServerTaskTimerPlan = "free") {
    super(PLUS_REQUIRED_MESSAGE);
    this.name = "PlusPlanRequiredError";
    this.plan = plan;
  }
}

function asUid(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

export function normalizeServerTaskTimerPlan(value: unknown): ServerTaskTimerPlan {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "plus" || raw === "pro") return "plus";
  if (raw === "plus_lifetime") return "plus_lifetime";
  return "free";
}

export function isServerPlusPlan(plan: unknown) {
  const normalized = normalizeServerTaskTimerPlan(plan);
  return normalized === "plus" || normalized === "plus_lifetime";
}

export async function loadUserPlanForEntitlement(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedUid = asUid(uid);
  if (!normalizedUid) return "free" satisfies ServerTaskTimerPlan;
  const snap = await db.collection("users").doc(normalizedUid).get();
  return normalizeServerTaskTimerPlan(snap.exists ? snap.get("plan") : null);
}

export async function assertPlusPlanForExecutiveFunction(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const plan = await loadUserPlanForEntitlement(uid, db);
  if (!isServerPlusPlan(plan)) throw new PlusPlanRequiredError(plan);
  return plan;
}

export function createPlusPlanRequiredResponse() {
  return Response.json(
    {
      error: PLUS_REQUIRED_MESSAGE,
      code: PLUS_REQUIRED_CODE,
    },
    { status: PLUS_REQUIRED_STATUS }
  );
}

export function isPlusPlanRequiredError(error: unknown): error is PlusPlanRequiredError {
  return error instanceof PlusPlanRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === PLUS_REQUIRED_CODE);
}
