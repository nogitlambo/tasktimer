import { RANK_LADDER, type RankDefinition } from "../lib/rewards";
import { startTimeGoalConfetti, stopTimeGoalConfetti } from "./time-goal-confetti";
import type { XpAwardAnimationState } from "./xp-award-animation";

export const RANK_PROMOTION_AUDIO_SRC = "/promotion.mp3";
export const RANK_PROMOTION_OVERLAY_ID = "rankPromotionOverlay";
export const RANK_PROMOTION_CONFETTI_STAGE_ID = "rankPromotionConfettiStage";

export type RankPromotion = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
};

type AudioLike = {
  currentTime: number;
  preload?: string;
  play: () => Promise<unknown> | void;
};

type AudioFactory = (src: string) => AudioLike;

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

export function getRankPromotionConfettiStage(overlay: HTMLElement | null | undefined) {
  return (overlay?.querySelector(`#${RANK_PROMOTION_CONFETTI_STAGE_ID}`) as HTMLElement | null) || null;
}

export function playRankPromotionAudio(audioFactory?: AudioFactory) {
  if (typeof window === "undefined" && !audioFactory) return;
  try {
    const factory = audioFactory || ((src: string) => new Audio(src));
    const audio = factory(RANK_PROMOTION_AUDIO_SRC);
    audio.preload = "auto";
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for the promotion UI.
  }
}

export function startRankPromotionCelebration(documentRef: Pick<Document, "getElementById">, audioFactory?: AudioFactory) {
  const overlay = documentRef.getElementById(RANK_PROMOTION_OVERLAY_ID) as HTMLElement | null;
  if (overlay) overlay.style.display = "flex";
  startTimeGoalConfetti(getRankPromotionConfettiStage(overlay));
  playRankPromotionAudio(audioFactory);
}

export function stopRankPromotionCelebration(documentRef: Pick<Document, "getElementById">) {
  const overlay = documentRef.getElementById(RANK_PROMOTION_OVERLAY_ID) as HTMLElement | null;
  stopTimeGoalConfetti(getRankPromotionConfettiStage(overlay));
  if (overlay) overlay.style.display = "none";
}
