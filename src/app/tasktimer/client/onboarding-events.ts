import type { DashboardWeekStart } from "../lib/historyChart";
import type { OptimalProductivityDays } from "../lib/productivityPeriod";

export const TASKTIMER_ONBOARDING_PREFERENCES_EVENT = "tasktimer:onboardingPreferences";
export const TASKTIMER_ONBOARDING_TASK_DEFAULTS_EVENT = "tasktimer:onboardingTaskDefaults";
export const TASKTIMER_ONBOARDING_CREATE_TASK_EVENT = "tasktimer:onboardingCreateTask";
export const TASKTIMER_OPEN_ONBOARDING_EVENT = "tasktimer:openOnboarding";

export type TaskTimerOnboardingTaskType = "recurring" | "once-off";
export type TaskTimerOnboardingTimeGoalUnit = "minute" | "hour";
export type TaskTimerOnboardingTimeGoalPeriod = "day" | "week";

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

export type TaskTimerOnboardingTaskDefaultsPayload = {
  taskType: TaskTimerOnboardingTaskType;
  timeGoalValue: number;
  timeGoalUnit: TaskTimerOnboardingTimeGoalUnit;
  timeGoalPeriod: TaskTimerOnboardingTimeGoalPeriod;
  optimalProductivityStartTime?: string;
  optimalProductivityEndTime?: string;
};

export type TaskTimerOnboardingTaskDefaultsResult = {
  ok: boolean;
  plannedStartTime?: string;
  error?: string;
};

export type TaskTimerOnboardingTaskDefaultsEventDetail = {
  payload: TaskTimerOnboardingTaskDefaultsPayload;
  done?: (result: TaskTimerOnboardingTaskDefaultsResult) => void;
};

export type TaskTimerOnboardingCreateTaskPayload = TaskTimerOnboardingTaskDefaultsPayload & {
  name: string;
  plannedStartTime: string;
};

export type TaskTimerOnboardingCreateTaskResult = {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
};

export type TaskTimerOnboardingCreateTaskEventDetail = {
  payload: TaskTimerOnboardingCreateTaskPayload;
  done?: (result: TaskTimerOnboardingCreateTaskResult) => void;
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

export function getOnboardingTaskDefaultsViaRuntime(
  payload: TaskTimerOnboardingTaskDefaultsPayload
): Promise<TaskTimerOnboardingTaskDefaultsResult> {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, error: "TaskLaunch runtime is not available." });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TaskTimerOnboardingTaskDefaultsResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    window.dispatchEvent(
      new CustomEvent<TaskTimerOnboardingTaskDefaultsEventDetail>(TASKTIMER_ONBOARDING_TASK_DEFAULTS_EVENT, {
        detail: {
          payload,
          done: finish,
        },
      })
    );

    window.setTimeout(() => {
      finish({ ok: false, error: "TaskLaunch runtime did not return onboarding task defaults." });
    }, 8000);
  });
}

export function createOnboardingTaskViaRuntime(
  payload: TaskTimerOnboardingCreateTaskPayload
): Promise<TaskTimerOnboardingCreateTaskResult> {
  if (typeof window === "undefined") return Promise.resolve({ ok: false, error: "TaskLaunch runtime is not available." });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TaskTimerOnboardingCreateTaskResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    window.dispatchEvent(
      new CustomEvent<TaskTimerOnboardingCreateTaskEventDetail>(TASKTIMER_ONBOARDING_CREATE_TASK_EVENT, {
        detail: {
          payload,
          done: finish,
        },
      })
    );

    window.setTimeout(() => {
      finish({ ok: false, error: "TaskLaunch runtime did not confirm task creation." });
    }, 8000);
  });
}

export function resolveOnboardingPreferenceError(error: unknown) {
  return getErrorMessage(error, "Could not save onboarding settings.");
}

export function resolveOnboardingCreateTaskError(error: unknown) {
  return getErrorMessage(error, "Could not create onboarding task.");
}

