import { getFirebaseAuthClient } from "@/lib/firebaseClient";

const TASKTIMER_STORAGE_KEY = "taskticker_tasks_v1";

export type TaskTimerPlan = "free" | "pro";
export type TaskTimerEntitlement =
  | "advancedHistory"
  | "advancedInsights"
  | "advancedTaskConfig"
  | "advancedBackup"
  | "socialFeatures";

export const TASKTIMER_PLAN_STORAGE_KEY = `${TASKTIMER_STORAGE_KEY}:plan`;
export const TASKTIMER_PLAN_CHANGED_EVENT = "tasktimer:plan-changed";

export type TaskTimerPlanCacheRecord = {
  uid?: string | null;
  plan?: unknown;
};

const PLAN_ENTITLEMENTS: Record<TaskTimerPlan, Record<TaskTimerEntitlement, boolean>> = {
  free: {
    advancedHistory: false,
    advancedInsights: false,
    advancedTaskConfig: false,
    advancedBackup: false,
    socialFeatures: true,
  },
  pro: {
    advancedHistory: true,
    advancedInsights: true,
    advancedTaskConfig: true,
    advancedBackup: true,
    socialFeatures: true,
  },
};

export function normalizeTaskTimerPlan(value: unknown): TaskTimerPlan {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "pro") return raw;
  return "free";
}

export function getTaskTimerEntitlements(plan: TaskTimerPlan) {
  return PLAN_ENTITLEMENTS[plan];
}

export function hasTaskTimerEntitlement(plan: TaskTimerPlan, entitlement: TaskTimerEntitlement) {
  return !!PLAN_ENTITLEMENTS[plan][entitlement];
}

export function readTaskTimerPlanCacheFromStorage(): { uid: string | null; plan: TaskTimerPlan } {
  if (typeof window === "undefined") return { uid: null, plan: "free" };
  try {
    const raw = window.localStorage.getItem(TASKTIMER_PLAN_STORAGE_KEY);
    if (!raw) return { uid: null, plan: "free" };
    try {
      const parsed = JSON.parse(raw) as TaskTimerPlanCacheRecord | null;
      if (parsed && typeof parsed === "object") {
        const cachedUid = String(parsed.uid || "").trim();
        return {
          uid: cachedUid || null,
          plan: normalizeTaskTimerPlan(parsed.plan),
        };
      }
    } catch {
      return { uid: null, plan: normalizeTaskTimerPlan(raw) };
    }
    return { uid: null, plan: "free" };
  } catch {
    return { uid: null, plan: "free" };
  }
}

export function readTaskTimerPlanFromStorage(): TaskTimerPlan {
  const cached = readTaskTimerPlanCacheFromStorage();
  const cachedUid = String(cached.uid || "").trim();
  const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
  if (cachedUid && activeUid && cachedUid !== activeUid) return "free";
  return cached.plan;
}

export function writeTaskTimerPlanToStorage(plan: TaskTimerPlan, opts?: { uid?: string | null }) {
  if (typeof window === "undefined") return;
  const normalizedPlan = normalizeTaskTimerPlan(plan);
  const normalizedUid =
    typeof opts?.uid === "string"
      ? String(opts.uid || "").trim()
      : String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
  try {
    window.localStorage.setItem(
      TASKTIMER_PLAN_STORAGE_KEY,
      JSON.stringify({
        uid: normalizedUid || null,
        plan: normalizedPlan,
      } satisfies TaskTimerPlanCacheRecord)
    );
  } catch {
    // Ignore storage write failures and still emit the change event for the current session.
  }
  window.dispatchEvent(new CustomEvent(TASKTIMER_PLAN_CHANGED_EVENT, { detail: { plan: normalizedPlan } }));
}

export function clearTaskTimerPlanStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TASKTIMER_PLAN_STORAGE_KEY);
  } catch {
    // Ignore storage failures and still emit the change event for the current session.
  }
  window.dispatchEvent(new CustomEvent(TASKTIMER_PLAN_CHANGED_EVENT, { detail: { plan: "free" satisfies TaskTimerPlan } }));
}
