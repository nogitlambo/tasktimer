export type MobileSwipeCloseState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  consumed: boolean;
};

export const MOBILE_SWIPE_CLOSE_INITIAL_STATE: MobileSwipeCloseState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
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
    currentX: startX,
    currentY: startY,
    consumed: false,
  };
}

export function getMobileSwipeCloseDragY(state: MobileSwipeCloseState) {
  if (!state.active) return 0;
  return Math.max(0, state.currentY - state.startY);
}

export function getUpdatedMobileSwipeCloseState(
  state: MobileSwipeCloseState,
  pointerId: number | null,
  clientX: number,
  clientY: number
) {
  if (!state.active || state.consumed || state.pointerId !== pointerId) return state;

  return {
    ...state,
    currentX: clientX,
    currentY: clientY,
  };
}

export function isMobileSwipeCloseDirectionValid(state: MobileSwipeCloseState) {
  if (!state.active) return false;

  const dx = state.currentX - state.startX;
  const dy = state.currentY - state.startY;
  return dy > 0 && dy > Math.abs(dx);
}

export function shouldCloseFromMobileSwipe(state: MobileSwipeCloseState, thresholdPx: number) {
  return isMobileSwipeCloseDirectionValid(state) && getMobileSwipeCloseDragY(state) >= thresholdPx;
}
