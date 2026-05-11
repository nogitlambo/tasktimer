import { describe, expect, it, vi } from "vitest";
import { loadGroupsSnapshotForUid } from "./groups";
import type { FriendProfile, Friendship } from "../lib/friendsStore";

describe("loadGroupsSnapshotForUid", () => {
  it("keeps added friends visible when non-critical friends page loads fail", async () => {
    const friendship = {
      pairId: "friendship:a:b",
      users: ["user-a", "user-b"],
      profileByUid: {
        "user-b": {
          alias: "B Friend",
          avatarId: "toon",
          avatarCustomSrc: "",
          googlePhotoUrl: "",
          rankThumbnailSrc: "",
          currentRankId: "bronze",
          totalXp: 25,
        },
      },
      createdAt: null,
      createdBy: "user-a",
    } satisfies Friendship;
    const profile = {
      alias: "B Friend",
      avatarId: "toon",
      avatarCustomSrc: "",
      googlePhotoUrl: "",
      rankThumbnailSrc: "",
      currentRankId: "bronze",
      totalXp: 25,
    } satisfies FriendProfile;

    const snapshot = await loadGroupsSnapshotForUid("user-a", {
      loadIncomingRequests: vi.fn(async () => {
        throw new Error("incoming request query failed");
      }),
      loadOutgoingRequests: vi.fn(async () => []),
      loadFriendships: vi.fn(async () => [friendship]),
      loadFriendProfile: vi.fn(async () => profile),
      loadSharedTaskSummariesForViewer: vi.fn(async () => {
        throw new Error("shared task query failed");
      }),
      loadSharedTaskSummariesForOwner: vi.fn(async () => []),
    });

    expect(snapshot.incoming).toEqual([]);
    expect(snapshot.friendships).toEqual([friendship]);
    expect(snapshot.friendProfileCache["user-b"]).toEqual(profile);
    expect(snapshot.sharedSummaries).toEqual([]);
  });
});
