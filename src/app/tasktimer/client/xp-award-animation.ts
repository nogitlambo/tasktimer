export type XpAwardRectSnapshot = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type PendingXpAward = {
  fromXp: number;
  toXp: number;
  awardedXp: number;
  sourceModal: "timeGoalComplete" | "resetConfirm" | "historyEntrySummaryTest";
  sourceTaskId: string | null;
  sourceOverlayId: string;
  sourceElementKey: string;
  sourceRect: XpAwardRectSnapshot | null;
};

export type XpAwardAnimationState = {
  pending: PendingXpAward | null;
  active: PendingXpAward | null;
};

export const XP_AWARD_COUNT_DURATION_MS = 2000;
export const XP_AWARD_FX_DURATION_MS = 1600;

function normalizeAward(input: PendingXpAward): PendingXpAward {
  const fromXp = Math.max(0, Math.floor(Number(input.fromXp) || 0));
  const toXp = Math.max(fromXp, Math.floor(Number(input.toXp) || 0));
  const awardedXp = Math.max(0, Math.floor(Number(input.awardedXp) || 0));
  return {
    ...input,
    fromXp,
    toXp,
    awardedXp,
    sourceTaskId: input.sourceTaskId ? String(input.sourceTaskId).trim() : null,
    sourceOverlayId: String(input.sourceOverlayId || "").trim(),
    sourceElementKey: String(input.sourceElementKey || "").trim(),
    sourceRect: input.sourceRect || null,
  };
}

function mergeAwards(base: PendingXpAward, incoming: PendingXpAward): PendingXpAward {
  const current = normalizeAward(base);
  const next = normalizeAward(incoming);
  return {
    ...current,
    toXp: Math.max(current.toXp, next.toXp),
    awardedXp: Math.max(0, current.awardedXp + next.awardedXp),
  };
}

export function createXpAwardAnimationState(): XpAwardAnimationState {
  return {
    pending: null,
    active: null,
  };
}

export function enqueuePendingXpAward(
  state: XpAwardAnimationState,
  award: PendingXpAward
): XpAwardAnimationState {
  const nextAward = normalizeAward(award);
  if (state.active) {
    return {
      ...state,
      active: mergeAwards(state.active, nextAward),
    };
  }
  return {
    ...state,
    pending: state.pending ? mergeAwards(state.pending, nextAward) : nextAward,
  };
}

export function notifyXpAwardOverlayClosed(
  state: XpAwardAnimationState,
  overlayIdRaw: string | null | undefined
): XpAwardAnimationState {
  const overlayId = String(overlayIdRaw || "").trim();
  if (!overlayId || state.active || !state.pending) return state;
  if (state.pending.sourceOverlayId !== overlayId) return state;
  return {
    pending: null,
    active: state.pending,
  };
}

export function clearActiveXpAward(state: XpAwardAnimationState): XpAwardAnimationState {
  if (!state.active) return state;
  return {
    ...state,
    active: null,
  };
}
