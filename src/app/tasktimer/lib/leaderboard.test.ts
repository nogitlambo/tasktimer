import { describe, expect, it } from "vitest";

import { getLeaderboardResolvedRank, type LeaderboardProfile } from "./leaderboard";
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
});
