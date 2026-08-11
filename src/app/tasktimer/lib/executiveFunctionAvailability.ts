export const EXECUTIVE_FUNCTION_DISABLED_CODE = "executive-function/disabled";
export const EXECUTIVE_FUNCTION_DISABLED_MESSAGE = "Executive Function is turned off in Settings.";
export const EXECUTIVE_FUNCTION_DISABLED_STATUS = 403;
export const EXECUTIVE_FUNCTION_PREFERENCE_CHANGED_EVENT = "tasktimer:executive-function-preference-changed";

export type ExecutiveFunctionAvailability = "available" | "plus-required" | "disabled";

export function getExecutiveFunctionLockedActionLabel(message: string | null | undefined, fallback: string) {
  return String(message || "").toLowerCase().includes("upgrade to plus") ? "Upgrade to PLUS" : fallback;
}
