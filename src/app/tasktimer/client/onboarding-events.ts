import type { DashboardWeekStart } from "../lib/historyChart";
import type { OptimalProductivityDays } from "../lib/productivityPeriod";

export const TASKTIMER_ONBOARDING_PREFERENCES_EVENT = "tasktimer:onboardingPreferences";
export const TASKTIMER_OPEN_ONBOARDING_EVENT = "tasktimer:openOnboarding";

export type TaskTimerOnboardingPreferencePayload = {
  weekStarting?: DashboardWeekStart;
  optimalProductivityDays?: OptimalProductivityDays;
  optimalProductivityStartTime?: string;
  optimalProductivityEndTime?: string;
  pushNotificationsEnabled?: boolean;
};

export type TaskTimerOnboardingPreferenceResult = {
  ok: boolean;
  error?: string;
};

export type TaskTimerOnboardingPreferenceEventDetail = {
  payload: TaskTimerOnboardingPreferencePayload;
  done?: (result: TaskTimerOnboardingPreferenceResult) => void;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  const message = String(error || "").trim();
  return message || fallback;
}

export function saveOnboardingPreferencesViaRuntime(
  payload: TaskTimerOnboardingPreferencePayload
): Promise<TaskTimerOnboardingPreferenceResult> {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, error: "TaskLaunch runtime is not available." });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TaskTimerOnboardingPreferenceResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    window.dispatchEvent(
      new CustomEvent<TaskTimerOnboardingPreferenceEventDetail>(TASKTIMER_ONBOARDING_PREFERENCES_EVENT, {
        detail: {
          payload,
          done: finish,
        },
      })
    );

    window.setTimeout(() => {
      finish({ ok: false, error: "TaskLaunch runtime did not confirm the onboarding update." });
    }, 8000);
  });
}

export function resolveOnboardingPreferenceError(error: unknown) {
  return getErrorMessage(error, "Could not save onboarding settings.");
}

