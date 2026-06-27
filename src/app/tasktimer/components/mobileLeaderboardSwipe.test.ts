import { describe, expect, it } from "vitest";
import {
  getMobileLeaderboardSwipeDirection,
  getNextLeaderboardSwipeView,
  getStartMobileLeaderboardSwipeState,
  getUpdatedMobileLeaderboardSwipeState,
} from "./mobileLeaderboardSwipe";

describe("mobile leaderboard swipe gesture", () => {
  const swipe = (startX: number, startY: number, endX: number, endY: number) =>
    getUpdatedMobileLeaderboardSwipeState(getStartMobileLeaderboardSwipeState(7, startX, startY), 7, endX, endY);

  it("moves left through Global, Weekly, and Rank Rivals", () => {
    const direction = getMobileLeaderboardSwipeDirection(swipe(220, 120, 150, 126));

    expect(direction).toBe("next");
    expect(getNextLeaderboardSwipeView("global", "next")).toBe("weekly");
    expect(getNextLeaderboardSwipeView("weekly", "next")).toBe("rivals");
  });

  it("moves right through Rank Rivals, Weekly, and Global", () => {
    const direction = getMobileLeaderboardSwipeDirection(swipe(150, 120, 220, 126));

    expect(direction).toBe("previous");
    expect(getNextLeaderboardSwipeView("rivals", "previous")).toBe("weekly");
    expect(getNextLeaderboardSwipeView("weekly", "previous")).toBe("global");
  });

  it("clamps at the first and last views", () => {
    expect(getNextLeaderboardSwipeView("global", "previous")).toBe("global");
    expect(getNextLeaderboardSwipeView("rivals", "next")).toBe("rivals");
  });

  it("ignores short horizontal drags", () => {
    expect(getMobileLeaderboardSwipeDirection(swipe(220, 120, 190, 122))).toBeNull();
  });

  it("ignores vertical drags", () => {
    expect(getMobileLeaderboardSwipeDirection(swipe(220, 120, 160, 220))).toBeNull();
  });

  it("ignores events from another active pointer or touch", () => {
    const state = getStartMobileLeaderboardSwipeState(7, 220, 120);
    const updated = getUpdatedMobileLeaderboardSwipeState(state, 8, 140, 120);

    expect(updated).toBe(state);
    expect(getMobileLeaderboardSwipeDirection(updated)).toBeNull();
  });
});
