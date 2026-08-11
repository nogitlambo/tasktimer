import type { Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import {
  EXECUTIVE_FUNCTION_DISABLED_CODE,
  EXECUTIVE_FUNCTION_DISABLED_MESSAGE,
  EXECUTIVE_FUNCTION_DISABLED_STATUS,
} from "@/app/tasktimer/lib/executiveFunctionAvailability";

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

export class ExecutiveFunctionDisabledError extends Error {
  status = EXECUTIVE_FUNCTION_DISABLED_STATUS;
  code = EXECUTIVE_FUNCTION_DISABLED_CODE;

  constructor() {
    super(EXECUTIVE_FUNCTION_DISABLED_MESSAGE);
    this.name = "ExecutiveFunctionDisabledError";
  }
}

function asUid(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function isFirestoreLike(db: Firestore): db is Firestore & { collection: Firestore["collection"] } {
  return typeof (db as { collection?: unknown }).collection === "function";
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
  if (!isFirestoreLike(db)) return "plus" satisfies ServerTaskTimerPlan;
  const snap = await db.collection("users").doc(normalizedUid).get();
  return normalizeServerTaskTimerPlan(snap.exists ? snap.get("plan") : null);
}

export async function assertPlusPlanForExecutiveFunction(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const plan = await loadUserPlanForEntitlement(uid, db);
  if (!isServerPlusPlan(plan)) throw new PlusPlanRequiredError(plan);
  return plan;
}

export async function isExecutiveFunctionEnabledForUser(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const normalizedUid = asUid(uid);
  if (!normalizedUid) return true;
  if (!isFirestoreLike(db)) return true;
  const userDoc = db.collection("users").doc(normalizedUid);
  if (typeof (userDoc as { collection?: unknown }).collection !== "function") return true;
  const snap = await userDoc.collection("preferences").doc("v1").get();
  if (!snap.exists) return true;
  return snap.get("executiveFunctionEnabled") !== false;
}

export async function assertExecutiveFunctionAvailableForUser(uid: string, db: Firestore = getFirebaseAdminDb()) {
  const plan = await assertPlusPlanForExecutiveFunction(uid, db);
  if (!(await isExecutiveFunctionEnabledForUser(uid, db))) throw new ExecutiveFunctionDisabledError();
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

export function isExecutiveFunctionDisabledError(error: unknown): error is ExecutiveFunctionDisabledError {
  return error instanceof ExecutiveFunctionDisabledError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === EXECUTIVE_FUNCTION_DISABLED_CODE);
}
