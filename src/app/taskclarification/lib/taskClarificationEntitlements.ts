import type { Firestore } from "firebase-admin/firestore";

import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

export type TaskClarificationPlan = "free" | "plus";

export const DEFAULT_TASK_CLARIFICATION_FREE_QUOTA = 5;
export const DEFAULT_TASK_CLARIFICATION_PLUS_QUOTA = 50;
export const TASK_CLARIFICATION_QUOTA_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function asPositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : fallback;
}

export function getTaskClarificationQuota(plan: TaskClarificationPlan) {
  return plan === "plus"
    ? asPositiveInteger(process.env.TASK_CLARIFICATION_PLUS_QUOTA, DEFAULT_TASK_CLARIFICATION_PLUS_QUOTA)
    : asPositiveInteger(process.env.TASK_CLARIFICATION_FREE_QUOTA, DEFAULT_TASK_CLARIFICATION_FREE_QUOTA);
}

export function normalizeTaskClarificationPlan(value: unknown): TaskClarificationPlan {
  const plan = typeof value === "string" ? value.trim().toLowerCase() : "";
  return plan === "plus" || plan === "plus_lifetime" || plan === "pro" ? "plus" : "free";
}

export async function loadTaskClarificationPlan(uid: string, db: Firestore = getFirebaseAdminDb()): Promise<TaskClarificationPlan> {
  const normalizedUid = typeof uid === "string" ? uid.trim() : "";
  if (!normalizedUid) return "free";
  const userSnap = await db.collection("users").doc(normalizedUid).get();
  return normalizeTaskClarificationPlan(userSnap.exists ? userSnap.get("plan") : null);
}
