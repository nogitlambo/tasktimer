import { RANK_LADDER, type RankDefinition } from "../lib/rewards";
import type { XpAwardAnimationState } from "./xp-award-animation";
import { dispatchOverlayClosedEvent } from "./xp-award-events";

export const RANK_PROMOTION_OVERLAY_ID = "rankPromotionOverlay";
export const TASKTIMER_RANK_PROMOTION_EVENT = "tasktimer:rank-promotion";

export type RankPromotion = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
};

function getRankIndex(rankId: string): number {
  const normalizedRankId = String(rankId || "").trim().toLowerCase();
  return RANK_LADDER.findIndex((rank) => rank.id === normalizedRankId);
}

function getRank(rankId: string): RankDefinition | null {
  const index = getRankIndex(rankId);
  return index >= 0 ? RANK_LADDER[index] || null : null;
}

export function getRankPromotion(previousRankId: string | null | undefined, nextRankId: string | null | undefined): RankPromotion | null {
  const previousIndex = getRankIndex(String(previousRankId || ""));
  const nextIndex = getRankIndex(String(nextRankId || ""));
  if (previousIndex < 0 || nextIndex < 0 || nextIndex <= previousIndex) return null;
  const previousRank = getRank(String(previousRankId || ""));
  const nextRank = getRank(String(nextRankId || ""));
  return previousRank && nextRank
    ? {
        previousRankId: previousRank.id,
        previousRankLabel: previousRank.label,
        nextRankId: nextRank.id,
        nextRankLabel: nextRank.label,
      }
    : null;
}

export function buildRankPromotionTestPayload(rankId: string | null | undefined): RankPromotion | null {
  const nextIndex = getRankIndex(String(rankId || ""));
  if (nextIndex < 0) return null;
  const previousRank = RANK_LADDER[Math.max(0, nextIndex - 1)] || null;
  const nextRank = RANK_LADDER[nextIndex] || null;
  return previousRank && nextRank
    ? {
        previousRankId: previousRank.id,
        previousRankLabel: previousRank.label,
        nextRankId: nextRank.id,
        nextRankLabel: nextRank.label,
      }
    : null;
}

export function dispatchRankPromotionEvent(
  windowRef: Pick<Window, "dispatchEvent">,
  promotion: RankPromotion
) {
  windowRef.dispatchEvent(new CustomEvent<RankPromotion>(TASKTIMER_RANK_PROMOTION_EVENT, { detail: promotion }));
}

export function hasBlockingPromotionOverlay(documentRef: Pick<Document, "querySelectorAll">): boolean {
  return Array.from(documentRef.querySelectorAll(".overlay")).some((overlay) => {
    const node = overlay as HTMLElement;
    if (node.id === RANK_PROMOTION_OVERLAY_ID) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node.style.display === "none") return false;
    if (typeof getComputedStyle === "function") return getComputedStyle(node).display !== "none";
    return node.style.display !== "none";
  });
}

export function hasBlockingPromotionXpAnimation(state: XpAwardAnimationState): boolean {
  return !!state.pending || !!state.active;
}

export function startRankPromotionCelebration(documentRef: Pick<Document, "getElementById">) {
  const overlay = documentRef.getElementById(RANK_PROMOTION_OVERLAY_ID) as HTMLElement | null;
  if (overlay) overlay.style.display = "flex";
}

export function stopRankPromotionCelebration(documentRef: Pick<Document, "getElementById">) {
  const overlay = documentRef.getElementById(RANK_PROMOTION_OVERLAY_ID) as HTMLElement | null;
  if (overlay) overlay.style.display = "none";
  if (typeof window !== "undefined") dispatchOverlayClosedEvent(window, RANK_PROMOTION_OVERLAY_ID);
}
