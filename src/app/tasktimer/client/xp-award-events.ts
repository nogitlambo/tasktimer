import type { PendingXpAward, XpAwardRectSnapshot } from "./xp-award-animation";

export const TASKTIMER_PENDING_XP_AWARD_EVENT = "tasktimer:pendingXpAward";
export const TASKTIMER_OVERLAY_CLOSED_EVENT = "tasktimer:overlayClosed";
export const TASKTIMER_REPLAY_TIME_GOAL_COMPLETE_XP_EVENT = "tasktimer:replayTimeGoalCompleteXp";
export const TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT = "tasktimer:claimTimeGoalCompleteXp";
export const TASKTIMER_TIME_GOAL_COMPLETE_XP_CLAIM_DELIVERED_EVENT = "tasktimer:timeGoalCompleteXpClaimDelivered";
export const TASKTIMER_CLAIM_DAILY_REWARD_XP_EVENT = "tasktimer:claimDailyRewardXp";
export const TASKTIMER_DAILY_REWARD_XP_CLAIM_DELIVERED_EVENT = "tasktimer:dailyRewardXpClaimDelivered";

type EventTargetLike = Pick<Window, "dispatchEvent">;

export type TimeGoalCompleteXpReplayRequest = {
  taskId: string | null;
  fromXp: number;
  toXp: number;
  awardedXp: number;
  sourceTaskId: string | null;
  sourceElementKey: string;
  sourceRect: XpAwardRectSnapshot | null;
};

export type TimeGoalCompleteXpClaimRequest = {
  overlayId: string;
  awardedXp: number;
  sourceElementKey: string;
  sourceRect: XpAwardRectSnapshot | null;
};

export type DailyRewardXpClaimRequest = {
  overlayId: string;
  awardedXp: number;
  sourceElementKey: string;
  sourceRect: XpAwardRectSnapshot | null;
};

export function captureXpAwardRectSnapshot(element: Element | null | undefined): XpAwardRectSnapshot | null {
  if (!element || typeof (element as HTMLElement).getBoundingClientRect !== "function") return null;
  const rect = (element as HTMLElement).getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function dispatchPendingXpAwardEvent(target: EventTargetLike | null | undefined, award: PendingXpAward): void {
  if (!target || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent<PendingXpAward>(TASKTIMER_PENDING_XP_AWARD_EVENT, { detail: award }));
}

export function dispatchTimeGoalCompleteXpReplayEvent(
  target: EventTargetLike | null | undefined,
  replay: TimeGoalCompleteXpReplayRequest
): void {
  if (!target || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent<TimeGoalCompleteXpReplayRequest>(TASKTIMER_REPLAY_TIME_GOAL_COMPLETE_XP_EVENT, {
    detail: replay,
  }));
}

export function dispatchTimeGoalCompleteXpClaimEvent(
  target: EventTargetLike | null | undefined,
  claim: TimeGoalCompleteXpClaimRequest
): boolean {
  if (!target || typeof CustomEvent === "undefined") return false;
  const event = new CustomEvent<TimeGoalCompleteXpClaimRequest>(TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT, {
    cancelable: true,
    detail: claim,
  });
  return target.dispatchEvent(event);
}

export function dispatchDailyRewardXpClaimEvent(
  target: EventTargetLike | null | undefined,
  claim: DailyRewardXpClaimRequest
): boolean {
  if (!target || typeof CustomEvent === "undefined") return false;
  const event = new CustomEvent<DailyRewardXpClaimRequest>(TASKTIMER_CLAIM_DAILY_REWARD_XP_EVENT, {
    cancelable: true,
    detail: claim,
  });
  return target.dispatchEvent(event);
}

export function dispatchOverlayClosedEvent(target: EventTargetLike | null | undefined, overlayIdRaw: string): void {
  const overlayId = String(overlayIdRaw || "").trim();
  if (!target || !overlayId || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent<{ overlayId: string }>(TASKTIMER_OVERLAY_CLOSED_EVENT, { detail: { overlayId } }));
}
