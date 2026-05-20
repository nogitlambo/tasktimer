import { describe, expect, it, vi } from "vitest";
import {
  getFriendProfileOpenUidFromTarget,
  loadGroupsSnapshotForUid,
} from "./groups";
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

describe("friend profile row targets", () => {
  function targetResolvingTo(uid: string | null) {
    return {
      closest: vi.fn(() =>
        uid == null
          ? null
          : {
              getAttribute: vi.fn((name: string) => (name === "data-friend-profile-open" ? uid : null)),
            }
      ),
    };
  }

  it("opens User Summary only for avatar or username controls with the profile hook", () => {
    expect(getFriendProfileOpenUidFromTarget(targetResolvingTo("friend-1"))).toBe("friend-1");
    expect(getFriendProfileOpenUidFromTarget(targetResolvingTo(""))).toBe("");
    expect(getFriendProfileOpenUidFromTarget(targetResolvingTo(null))).toBe("");
    expect(getFriendProfileOpenUidFromTarget({})).toBe("");
  });
});
