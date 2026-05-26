import { describe, expect, it } from "vitest";
import { getDesktopRailProfileMenuItems, getLatestReplayableXpAward } from "./DesktopAppRail";

describe("DesktopAppRail profile menu", () => {
  it("shows Settings and User Guide in the profile menu", () => {
    const items = getDesktopRailProfileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Settings", "User Guide"]);
    expect(items.map((item) => item.href)).toEqual(["/settings", "/user-guide"]);
  });
});

describe("DesktopAppRail XP replay", () => {
  it("uses the latest positive XP ledger entry", () => {
    const now = Date.now();
    expect(
      getLatestReplayableXpAward({
        totalXp: 40,
        totalXpPrecise: 40,
        currentRankId: "operator",
        completedSessions: 2,
        lastAwardedAt: now,
        awardLedger: [
          { ts: now - 1000, dayKey: "2026-05-01", taskId: "task-1", xp: 7, baseXp: 7, multiplier: 1, eligibleMs: 120000, reason: "session", sourceKey: "a" },
          { ts: now, dayKey: "2026-05-01", taskId: "task-2", xp: 11, baseXp: 11, multiplier: 1, eligibleMs: 120000, reason: "session", sourceKey: "b" },
        ],
      })
    ).toEqual({
      awardedXp: 11,
      fromXp: 29,
      toXp: 40,
      taskId: "task-2",
    });
  });
});
