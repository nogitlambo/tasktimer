export type LeaderboardSwipeView = "global" | "weekly" | "rivals";

export type LeaderboardSwipeDirection = "next" | "previous";

export type MobileLeaderboardSwipeState = {
  active: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  consumed: boolean;
};

export const MOBILE_LEADERBOARD_SWIPE_INITIAL_STATE: MobileLeaderboardSwipeState = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  consumed: false,
};

export const LEADERBOARD_SWIPE_THRESHOLD_PX = 48;
export const LEADERBOARD_SWIPE_MOBILE_QUERY = "(max-width: 720px)";

export function getResetMobileLeaderboardSwipeState(): MobileLeaderboardSwipeState {
  return { ...MOBILE_LEADERBOARD_SWIPE_INITIAL_STATE };
}

export function getStartMobileLeaderboardSwipeState(pointerId: number | null, startX: number, startY: number): MobileLeaderboardSwipeState {
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

export function getUpdatedMobileLeaderboardSwipeState(
  state: MobileLeaderboardSwipeState,
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

export function getMobileLeaderboardSwipeDirection(
  state: MobileLeaderboardSwipeState,
  thresholdPx = LEADERBOARD_SWIPE_THRESHOLD_PX
): LeaderboardSwipeDirection | null {
  if (!state.active || state.consumed) return null;

  const dx = state.currentX - state.startX;
  const dy = state.currentY - state.startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < thresholdPx || absDx <= absDy * 1.25) return null;

  return dx < 0 ? "next" : "previous";
}

export function getNextLeaderboardSwipeView(currentView: LeaderboardSwipeView, direction: LeaderboardSwipeDirection): LeaderboardSwipeView {
  if (direction === "next") {
    if (currentView === "global") return "weekly";
    if (currentView === "weekly") return "rivals";
    return "rivals";
  }

  if (currentView === "rivals") return "weekly";
  if (currentView === "weekly") return "global";
  return "global";
}

export function isMobileLeaderboardSwipeViewport() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") return window.matchMedia(LEADERBOARD_SWIPE_MOBILE_QUERY).matches;
  return window.innerWidth <= 720;
}
