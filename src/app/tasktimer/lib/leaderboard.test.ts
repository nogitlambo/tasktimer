import { describe, expect, it } from "vitest";

import { getLeaderboardResolvedRank, type LeaderboardProfile } from "./leaderboard";

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
      rewardTotalXp: 620,
    });

    expect(getLeaderboardResolvedRank(profile)).toMatchObject({
      id: "engineer",
      label: "Engineer",
    });
  });
});
