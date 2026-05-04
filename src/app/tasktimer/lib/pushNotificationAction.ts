export type PendingPushActionId = "default" | "launchTask" | "snooze10m" | "postponeNextGap";

export function normalizePendingPushActionId(rawActionId: unknown): PendingPushActionId {
  const actionId = String(rawActionId || "").trim();
  if (actionId === "launchTask" || actionId === "snooze10m" || actionId === "postponeNextGap") {
    return actionId;
  }
  return "default";
}
