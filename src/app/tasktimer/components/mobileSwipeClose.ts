export type MobileSwipeCloseState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  consumed: boolean;
};

export const MOBILE_SWIPE_CLOSE_INITIAL_STATE: MobileSwipeCloseState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  consumed: false,
};

export function getResetMobileSwipeCloseState(): MobileSwipeCloseState {
  return { ...MOBILE_SWIPE_CLOSE_INITIAL_STATE };
}

export function getStartMobileSwipeCloseState(pointerId: number | null, startX: number, startY: number): MobileSwipeCloseState {
  return {
    active: true,
    pointerId,
    startX,
    startY,
    consumed: false,
  };
}

export function shouldCloseFromMobileSwipe(
  state: MobileSwipeCloseState,
  pointerId: number | null,
  clientX: number,
  clientY: number,
  thresholdPx: number
) {
  if (!state.active || state.consumed || state.pointerId !== pointerId) return false;

  const dx = clientX - state.startX;
  const dy = clientY - state.startY;
  return dy > 0 && dy >= thresholdPx && dy > Math.abs(dx);
}
