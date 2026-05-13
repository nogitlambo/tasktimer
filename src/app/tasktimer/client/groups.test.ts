import { describe, expect, it, vi } from "vitest";
import {
  getSharedTaskReminderStatusMessage,
  loadGroupsSnapshotForUid,
  shouldRenderSharedTaskReminderButton,
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

describe("shared task reminders", () => {
  it("renders reminder controls only for stopped shared tasks", () => {
    expect(shouldRenderSharedTaskReminderButton("stopped")).toBe(true);
    expect(shouldRenderSharedTaskReminderButton("")).toBe(true);
    expect(shouldRenderSharedTaskReminderButton("running")).toBe(false);
    expect(shouldRenderSharedTaskReminderButton("RUNNING")).toBe(false);
  });

  it("maps reminder statuses to user-facing Friends page messages", () => {
    expect(getSharedTaskReminderStatusMessage({ ok: true, status: "sent" })).toEqual({
      message: "Reminder sent.",
      tone: "success",
    });
    expect(getSharedTaskReminderStatusMessage({ ok: false, status: "cooldown" })).toEqual({
      message: "A reminder was sent recently. Try again later.",
      tone: "info",
    });
    expect(getSharedTaskReminderStatusMessage({ ok: false, status: "already-running" })).toEqual({
      message: "That task is already running.",
      tone: "info",
    });
    expect(getSharedTaskReminderStatusMessage({ ok: false, status: "no-devices" })).toEqual({
      message: "No enabled push devices were found for this friend.",
      tone: "error",
    });
  });
});
