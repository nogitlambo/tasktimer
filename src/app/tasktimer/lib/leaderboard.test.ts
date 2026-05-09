import { describe, expect, it } from "vitest";

import {
  buildWeeklyLeaderboardRows,
  getLeaderboardResolvedRank,
  isWeeklyLeaderboardPlaceholderProfile,
  type LeaderboardProfile,
} from "./leaderboard";
import { getRankThumbnailDescriptor } from "./rewards";

function createProfile(overrides: Partial<LeaderboardProfile> = {}): LeaderboardProfile {
  return {
    uid: "user-1",
    username: "user",
    displayLabel: "User",
    avatarId: null,
    avatarCustomSrc: null,
    googlePhotoUrl: null,
    rankThumbnailSrc: null,
    rewardCurrentRankId: "unranked",
    rewardTotalXp: 0,
    streakDays: 0,
    totalFocusMs: 0,
    weeklyXpGain: 0,
    memberSinceMs: null,
    schemaVersion: 1,
    ...overrides,
  };
}

describe("getLeaderboardResolvedRank", () => {
  it("derives the displayed rank from XP even when the stored rank id is stale", () => {
    const profile = createProfile({
      rewardCurrentRankId: "unranked",
      rewardTotalXp: 960,
    });

    expect(getLeaderboardResolvedRank(profile)).toMatchObject({
      id: "engineer",
      label: "Engineer",
    });
  });

  it("resolves the rank insignia from XP instead of a stale stored rank id", () => {
    const profile = createProfile({
      rewardCurrentRankId: "unranked",
      rewardTotalXp: 12000,
    });
    const resolvedRank = getLeaderboardResolvedRank(profile);

    expect(resolvedRank.id).toBe("director");
    expect(getRankThumbnailDescriptor(resolvedRank.id)).toMatchObject({
      kind: "image",
      src: "/insignias/008_director.png",
    });
  });

  it("falls back to a placeholder when the configured insignia asset is missing", () => {
    expect(getRankThumbnailDescriptor("unranked")).toMatchObject({
      kind: "placeholder",
      label: "U",
      rankId: "unranked",
    });
  });
});

describe("buildWeeklyLeaderboardRows", () => {
  it("orders weekly leaderboard rows by weekly XP gain", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "low", username: "low", weeklyXpGain: 40 }),
        createProfile({ uid: "high", username: "high", weeklyXpGain: 140 }),
        createProfile({ uid: "mid", username: "mid", weeklyXpGain: 80 }),
      ],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    expect(rows.slice(0, 3).map((row) => row.profile.uid)).toEqual(["high", "mid", "low"]);
    expect(rows.slice(0, 3).map((row) => row.rankLabel)).toEqual(["#1", "#2", "#3"]);
    expect(rows).toHaveLength(10);
    expect(rows.slice(3).every((row) => row.isPlaceholder)).toBe(true);
  });

  it("pins the current user as unranked when they are outside the weekly board with no weekly XP", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 240 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 180 }),
      ],
      currentUserEntry: createProfile({ uid: "me", username: "me", weeklyXpGain: 0 }),
      currentUserWeeklyRank: 12,
    });

    expect(rows[0]).toMatchObject({
      isCurrentUser: true,
      rankLabel: "Unranked",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows).toHaveLength(11);
    expect(rows.slice(1, 3).map((row) => row.profile.uid)).toEqual(["top-1", "top-2"]);
    expect(rows.slice(3).every((row) => row.isPlaceholder)).toBe(true);
  });

  it("does not duplicate the current user when they are already ranked in the weekly top entries", () => {
    const currentUser = createProfile({ uid: "me", username: "me", weeklyXpGain: 120 });
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 240 }),
        currentUser,
        createProfile({ uid: "top-3", username: "top_3", weeklyXpGain: 80 }),
      ],
      currentUserEntry: currentUser,
      currentUserWeeklyRank: 2,
    });

    expect(rows.slice(0, 3).map((row) => row.profile.uid)).toEqual(["top-1", "me", "top-3"]);
    expect(rows[1]).toMatchObject({
      isCurrentUser: true,
      rankLabel: "#2",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows.filter((row) => row.profile.uid === "me")).toHaveLength(1);
  });

  it("backfills an empty weekly board with ten placeholder rows", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.isPlaceholder)).toBe(true);
    expect(rows.map((row) => row.rankLabel)).toEqual([
      "#1",
      "#2",
      "#3",
      "#4",
      "#5",
      "#6",
      "#7",
      "#8",
      "#9",
      "#10",
    ]);
    expect(rows.every((row) => isWeeklyLeaderboardPlaceholderProfile(row.profile))).toBe(true);
  });

  it("fills the weekly table from fourth to tenth place without repeating the podium", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 400 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 320 }),
        createProfile({ uid: "top-3", username: "top_3", weeklyXpGain: 280 }),
        createProfile({ uid: "top-4", username: "top_4", weeklyXpGain: 240 }),
      ],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    const tableRows = rows.filter((row) => !!row.rank && row.rank >= 4 && row.rank <= 10);

    expect(tableRows).toHaveLength(7);
    expect(tableRows.map((row) => row.rankLabel)).toEqual(["#4", "#5", "#6", "#7", "#8", "#9", "#10"]);
    expect(tableRows[0]?.profile.uid).toBe("top-4");
    expect(tableRows.slice(1).every((row) => row.isPlaceholder)).toBe(true);
  });

  it("keeps legitimate weekly entries ahead of placeholder rows", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 260 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 190 }),
      ],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    expect(rows[0]?.isPlaceholder).toBe(false);
    expect(rows[1]?.isPlaceholder).toBe(false);
    expect(rows.slice(2).every((row) => row.isPlaceholder)).toBe(true);
  });
});
