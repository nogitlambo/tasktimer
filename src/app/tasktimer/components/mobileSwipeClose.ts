export type MobileSwipeCloseState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  consumed: boolean;
};

export type MobileSwipeCloseDirection = "down" | "up";

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

export function getMobileSwipeCloseDragY(state: MobileSwipeCloseState, direction: MobileSwipeCloseDirection = "down") {
  if (!state.active) return 0;
  const deltaY = state.currentY - state.startY;
  return Math.max(0, direction === "up" ? -deltaY : deltaY);
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

export function isMobileSwipeCloseDirectionValid(state: MobileSwipeCloseState, direction: MobileSwipeCloseDirection = "down") {
  if (!state.active) return false;

  const dx = state.currentX - state.startX;
  const dy = state.currentY - state.startY;
  const directionalDy = direction === "up" ? -dy : dy;
  return directionalDy > 0 && directionalDy > Math.abs(dx);
}

export function shouldCloseFromMobileSwipe(
  state: MobileSwipeCloseState,
  thresholdPx: number,
  direction: MobileSwipeCloseDirection = "down"
) {
  return isMobileSwipeCloseDirectionValid(state, direction) && getMobileSwipeCloseDragY(state, direction) >= thresholdPx;
}
