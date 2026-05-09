import type { PendingXpAward, XpAwardRectSnapshot } from "./xp-award-animation";

export const TASKTIMER_PENDING_XP_AWARD_EVENT = "tasktimer:pendingXpAward";
export const TASKTIMER_OVERLAY_CLOSED_EVENT = "tasktimer:overlayClosed";

type EventTargetLike = Pick<Window, "dispatchEvent">;

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

export function dispatchOverlayClosedEvent(target: EventTargetLike | null | undefined, overlayIdRaw: string): void {
  const overlayId = String(overlayIdRaw || "").trim();
  if (!target || !overlayId || typeof CustomEvent === "undefined") return;
  target.dispatchEvent(new CustomEvent<{ overlayId: string }>(TASKTIMER_OVERLAY_CLOSED_EVENT, { detail: { overlayId } }));
}
