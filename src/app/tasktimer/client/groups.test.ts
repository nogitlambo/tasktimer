import { describe, expect, it, vi } from "vitest";
import {
  computeSharedTaskTimingMetrics,
  formatSharedTaskWeekPercent,
  getFriendProfileOpenUidFromTarget,
  getSharedTaskGoalMetrics,
  loadGroupsSnapshotForUid,
  renderSharedTaskMetricRows,
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

describe("shared task info metrics", () => {
  const escapeHtmlUI = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  it("formats daily and weekly goals as daily-equivalent shared card rows without Created", () => {
    expect(getSharedTaskGoalMetrics({ timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 60 })).toEqual({
      dailyGoalMs: 60 * 60_000,
      weekGoalMs: 7 * 60 * 60_000,
    });
    expect(getSharedTaskGoalMetrics({ timeGoalEnabled: true, timeGoalPeriod: "week", timeGoalMinutes: 7 * 60 })).toEqual({
      dailyGoalMs: 60 * 60_000,
      weekGoalMs: 7 * 60 * 60_000,
    });

    const html = renderSharedTaskMetricRows(
      {
        dailyGoalMs: 60 * 60_000,
        todayLoggedMs: 30 * 60_000,
        weekLoggedMs: 2 * 60 * 60_000,
        weekGoalMs: 7 * 60 * 60_000,
        avgTimeLoggedThisWeekMs: 20 * 60_000,
        totalTimeLoggedMs: 5 * 60 * 60_000,
      },
      escapeHtmlUI
    );

    expect(html).toContain("Goal: 01h");
    expect(html).toContain("Today: 30m");
    expect(html).toContain("This Week: 29%");
    expect(html).toContain("Daily avg: 20m");
    expect(html).toContain("Total logged: 05h");
    expect(html).not.toContain("Created:");
  });

  it("includes running time in Today and This Week and respects the configured week start", () => {
    const nowMs = new Date("2026-05-29T12:00:00").getTime();
    const metrics = computeSharedTaskTimingMetrics({
      task: {
        timeGoalEnabled: true,
        timeGoalPeriod: "week",
        timeGoalMinutes: 420,
        running: true,
        startMs: nowMs - 15 * 60_000,
      },
      entries: [
        { ts: new Date("2026-05-29T09:00:00").getTime(), ms: 30 * 60_000 },
        { ts: new Date("2026-05-25T09:00:00").getTime(), ms: 60 * 60_000 },
        { ts: new Date("2026-05-24T09:00:00").getTime(), ms: 10 * 60_000 },
      ],
      nowMs,
      weekStarting: "mon",
      normalizeHistoryTimestampMs: (value) => Number(value || 0),
    });

    expect(metrics.todayLoggedMs).toBe(45 * 60_000);
    expect(metrics.weekLoggedMs).toBe(105 * 60_000);
    expect(metrics.dailyGoalMs).toBe(60 * 60_000);
    expect(metrics.weekGoalMs).toBe(420 * 60_000);
  });

  it("caps weekly progress at 100% and shows no-goal fallbacks", () => {
    expect(formatSharedTaskWeekPercent({ weekLoggedMs: 150, weekGoalMs: 100 })).toBe("100%");
    expect(formatSharedTaskWeekPercent({ weekLoggedMs: 50, weekGoalMs: null })).toBe("No goal");

    const html = renderSharedTaskMetricRows(
      {
        dailyGoalMs: null,
        todayLoggedMs: 0,
        weekLoggedMs: 0,
        weekGoalMs: null,
        avgTimeLoggedThisWeekMs: 0,
        totalTimeLoggedMs: 0,
      },
      escapeHtmlUI
    );

    expect(html).toContain("Goal: No goal");
    expect(html).toContain("This Week: No goal");
  });
});
