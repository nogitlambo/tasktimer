import { describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => {
  const getDocs = vi.fn();
  const getDoc = vi.fn();
  return {
    collection: vi.fn((_db, path: string) => ({ path })),
    doc: vi.fn((_db, path: string, id: string) => ({ path, id })),
    getDoc,
    getDocs,
    limit: vi.fn((value: number) => ({ type: "limit", value })),
    orderBy: vi.fn((field: string, direction?: string) => ({ type: "orderBy", field, direction })),
    query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
    serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
    setDoc: vi.fn(() => Promise.resolve()),
    updateDoc: vi.fn(() => Promise.resolve()),
    where: vi.fn((field: string, op: string, value: unknown) => ({ type: "where", field, op, value })),
  };
});

vi.mock("firebase/firestore", () => firestoreMocks);
vi.mock("@/lib/firebaseClient", () => ({
  getFirebaseAuthClient: vi.fn(() => ({ currentUser: { uid: "uid-1", photoURL: null, metadata: {} } })),
}));
vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: vi.fn(() => ({})),
}));
vi.mock("./accountProfileStorage", () => ({
  findStoredCustomAvatarUploadSrc: vi.fn(() => ""),
  googleAvatarIdForUid: vi.fn((uid: string) => `google/profile-photo:${uid}`),
  isCustomAvatarIdForUid: vi.fn(() => false),
  readStoredAvatarId: vi.fn(() => ""),
  readStoredCustomAvatarSrc: vi.fn(() => ""),
}));

import {
  buildLeaderboardMetricsSnapshot,
  buildGlobalLeaderboardRows,
  buildRivalLeaderboardRows,
  buildWeeklyLeaderboardRows,
  getLeaderboardAvatarSrc,
  getLeaderboardResolvedRank,
  loadLeaderboardScreenData,
  saveLeaderboardProfile,
  type LeaderboardProfile,
  type WeeklyLeaderboardRow,
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
    weeklyFocusMs: 0,
    weeklyXpGain: 0,
    memberSinceMs: null,
    schemaVersion: 1,
    ...overrides,
  };
}

function docSnap(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
    get: (key: string) => data[key],
    exists: () => true,
  };
}

function querySnap(docs: Array<ReturnType<typeof docSnap>>) {
  return {
    docs,
    size: docs.length,
  };
}

function tableRows(rows: WeeklyLeaderboardRow[]): WeeklyLeaderboardRow[] {
  return rows.filter((row) => (row.rank && row.rank >= 4 && row.rank <= 10) || (row.isPinnedCurrentUser && (!row.rank || row.rank > 10)));
}

function expectPinnedCurrentRank(
  rows: WeeklyLeaderboardRow[],
  expectedRank: number,
  uid = "me"
) {
  const currentRow = rows.find((row) => row.isCurrentUser && row.profile.uid === uid);
  expect(currentRow).toBeTruthy();

  expect(currentRow).toMatchObject({
    isCurrentUser: true,
    isPinnedCurrentUser: true,
    rank: expectedRank,
    rankLabel: `#${expectedRank}`,
    playerLabel: "You",
    isPlaceholder: false,
  });
  expect(rows.at(-1)).toBe(currentRow);
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

describe("getLeaderboardAvatarSrc", () => {
  it("maps legacy direct bundled avatar paths to WebP", () => {
    expect(
      getLeaderboardAvatarSrc(
        createProfile({
          avatarId: "/avatars/toons/toonHead-male.svg",
        })
      )
    ).toBe("/avatars/toons/toonHead-male.webp");
    expect(
      getLeaderboardAvatarSrc(
        createProfile({
          avatarId: "/avatars/action-heroes/commando.svg",
        })
      )
    ).toBe("/avatars/action-heroes/commando.webp");
    expect(
      getLeaderboardAvatarSrc(
        createProfile({
          avatarId: "/tasklaunch/avatars/bottts/bottts-1777441132037.svg",
        })
      )
    ).toBe("/tasklaunch/avatars/bottts/bottts-1777441132037.webp");
  });

  it("maps legacy custom bundled avatar paths to WebP", () => {
    expect(
      getLeaderboardAvatarSrc(
        createProfile({
          avatarCustomSrc: "/avatars/toons/Bugs-Bunny.jpg",
        })
      )
    ).toBe("/avatars/toons/Bugs-Bunny.webp");
    expect(
      getLeaderboardAvatarSrc(
        createProfile({
          avatarCustomSrc: "/avatars/bottts/bottts-1777442377436.svg",
        })
      )
    ).toBe("/avatars/bottts/bottts-1777442377436.webp");
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
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => !row.isDummy && !row.isPlaceholder)).toBe(true);
  });

  it("pins the current user with their actual rank when they are outside the weekly board", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 240 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 180 }),
      ],
      currentUserEntry: createProfile({ uid: "me", username: "me", weeklyXpGain: 0 }),
      currentUserWeeklyRank: 12,
    });

    expectPinnedCurrentRank(rows, 12);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => !row.isPlaceholder && !row.isDummy && !row.isCurrentUser).map((row) => row.profile.uid)).toEqual(["top-1", "top-2"]);
  });

  it("keeps an out-of-top-ten current user available for the weekly table", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", weeklyXpGain: 0 }),
      currentUserWeeklyRank: 12,
    });
    const rowsForTable = tableRows(rows);

    expect(rowsForTable).toHaveLength(1);
    expect(rowsForTable.filter((row) => row.isDummy)).toHaveLength(0);
    expectPinnedCurrentRank(rows, 12);
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

  it("returns no rows on an empty weekly board", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    expect(rows).toEqual([]);
  });

  it("keeps partial weekly boards partial", () => {
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
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !row.isDummy && !row.isPlaceholder)).toBe(true);
  });
});

describe("buildGlobalLeaderboardRows", () => {
  it("returns no rows on an empty global board", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [],
      currentUserEntry: null,
      currentUserRank: null,
    });

    expect(rows).toEqual([]);
  });

  it("keeps partial global boards partial", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [
        createProfile({ uid: "top-1", username: "top_1", rewardTotalXp: 900 }),
        createProfile({ uid: "top-2", username: "top_2", rewardTotalXp: 700 }),
      ],
      currentUserEntry: null,
      currentUserRank: null,
    });

    expect(rows).toHaveLength(2);
    expect(rows.slice(0, 2).map((row) => row.profile.uid)).toEqual(["top-1", "top-2"]);
    expect(rows[0]?.isPlaceholder).toBe(false);
    expect(rows[1]?.isPlaceholder).toBe(false);
    expect(rows.every((row) => !row.isDummy && !row.isPlaceholder)).toBe(true);
  });

  it("pins the current user with their actual global rank when outside the top board", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [createProfile({ uid: "top-1", username: "top_1", rewardTotalXp: 900 })],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 200 }),
      currentUserRank: 42,
    });

    expectPinnedCurrentRank(rows, 42);
    expect(rows).toHaveLength(2);
  });

  it("keeps an out-of-top-ten current user available for the global table", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 200 }),
      currentUserRank: 42,
    });
    const rowsForTable = tableRows(rows);

    expect(rowsForTable).toHaveLength(1);
    expect(rowsForTable.filter((row) => row.isDummy)).toHaveLength(0);
    expectPinnedCurrentRank(rows, 42);
  });
});

describe("buildRivalLeaderboardRows", () => {
  it("keeps a visible rank one current user in the rivals podium", () => {
    const rows = buildRivalLeaderboardRows({
      rivalEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 1200 }),
      currentUserRivalRank: 1,
    });

    expect(rows[0]).toMatchObject({
      profile: expect.objectContaining({ uid: "me" }),
      isCurrentUser: true,
      rank: 1,
      rankLabel: "#1",
      playerLabel: "You",
      isPlaceholder: false,
      isDummy: false,
    });
    expect(tableRows(rows).some((row) => row.isCurrentUser)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(rows.every((row) => !row.isDummy && !row.isPlaceholder)).toBe(true);
  });

  it("keeps the current user pinned on their actual rival rank when outside the visible board", () => {
    const rows = buildRivalLeaderboardRows({
      rivalEntries: [createProfile({ uid: "rival-1", username: "rival_1", rewardTotalXp: 1600 })],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 900 }),
      currentUserRivalRank: 14,
    });

    expectPinnedCurrentRank(rows, 14);
    expect(rows.filter((row) => row.profile.uid === "me")).toHaveLength(1);
    expect(tableRows(rows).filter((row) => row.isDummy)).toHaveLength(0);
  });

  it("filters rank rivals to the current user's resolved rank", () => {
    const rows = buildRivalLeaderboardRows({
      rivalEntries: [
        createProfile({ uid: "same-1", username: "same_1", rewardTotalXp: 1400, rewardCurrentRankId: "engineer" }),
        createProfile({ uid: "lower-1", username: "lower_1", rewardTotalXp: 700, rewardCurrentRankId: "engineer" }),
        createProfile({ uid: "higher-1", username: "higher_1", rewardTotalXp: 3200, rewardCurrentRankId: "engineer" }),
      ],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 1200 }),
      currentUserRivalRank: 2,
    });

    const realNonCurrentRows = rows.filter((row) => !row.isCurrentUser && !row.isPlaceholder && !row.isDummy);
    expect(realNonCurrentRows.map((row) => row.profile.uid)).toEqual(["same-1"]);
    expect(rows.find((row) => row.isCurrentUser)).toMatchObject({ rank: 2, rankLabel: "#2" });
    expect(rows.every((row) => !row.isDummy && !row.isPlaceholder)).toBe(true);
  });
});

describe("loadLeaderboardScreenData", () => {
  it("returns available leaderboard data when optional rivals queries need missing indexes", async () => {
    const currentProfile = createProfile({
      uid: "uid-1",
      username: "pilot",
      displayLabel: "pilot",
      rewardCurrentRankId: "initiate",
      rewardTotalXp: 120,
      streakDays: 2,
      totalFocusMs: 60_000,
      weeklyXpGain: 20,
    });
    const peerProfile = createProfile({
      uid: "uid-2",
      username: "peer",
      displayLabel: "peer",
      rewardCurrentRankId: "initiate",
      rewardTotalXp: 220,
      streakDays: 3,
      totalFocusMs: 120_000,
      weeklyXpGain: 30,
    });
    const currentDoc = docSnap("uid-1", currentProfile);
    const peerDoc = docSnap("uid-2", peerProfile);

    firestoreMocks.getDoc.mockReset();
    firestoreMocks.getDocs.mockReset();
    firestoreMocks.getDoc
      .mockResolvedValueOnce({ exists: () => false, get: vi.fn() })
      .mockResolvedValueOnce(currentDoc);
    firestoreMocks.getDocs
      .mockResolvedValueOnce(querySnap([peerDoc, currentDoc]))
      .mockResolvedValueOnce(querySnap([peerDoc]))
      .mockResolvedValueOnce(querySnap([peerDoc, currentDoc]))
      .mockResolvedValueOnce(querySnap([peerDoc]))
      .mockResolvedValueOnce(querySnap([peerDoc]))
      .mockRejectedValueOnce(new Error("missing index"))
      .mockRejectedValueOnce(new Error("missing index"))
      .mockResolvedValueOnce(querySnap([peerDoc]));

    const result = await loadLeaderboardScreenData("uid-1");

    expect(result.topEntries.map((entry) => entry.uid)).toEqual(["uid-2", "uid-1"]);
    expect(result.weeklyEntries.map((entry) => entry.uid)).toEqual(["uid-2", "uid-1"]);
    expect(result.currentUserEntry?.uid).toBe("uid-1");
    expect(result.rivalEntries).toEqual([]);
    expect(result.currentUserRank).toBe(2);
    expect(result.currentUserRivalRank).toBeNull();
    expect(result.currentUserWeeklyRank).toBe(2);
  });
});

describe("saveLeaderboardProfile", () => {
  it("persists the weekly focus metric used by leaderboard profile rules", async () => {
    firestoreMocks.getDoc.mockReset();
    firestoreMocks.setDoc.mockClear();
    firestoreMocks.getDoc.mockResolvedValueOnce({ exists: () => false, get: vi.fn() });

    await saveLeaderboardProfile("uid-1", {
      rewardCurrentRankId: "initiate",
      rewardTotalXp: 120,
      streakDays: 2,
      totalFocusMs: 60_000,
      weeklyFocusMs: 15_000,
      weeklyXpGain: 20,
    });

    expect(firestoreMocks.setDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uid: "uid-1",
        totalFocusMs: 60_000,
        weeklyFocusMs: 15_000,
        weeklyXpGain: 20,
        schemaVersion: 1,
      }),
      { merge: true }
    );
  });
});

describe("buildLeaderboardMetricsSnapshot", () => {
  it("tracks current-week focus time separately from lifetime focus time", () => {
    const nowMs = Date.parse("2026-05-20T12:00:00.000Z");
    const weekEntryTs = Date.parse("2026-05-19T09:00:00.000Z");
    const olderEntryTs = Date.parse("2026-05-10T09:00:00.000Z");

    const snapshot = buildLeaderboardMetricsSnapshot({
      historyByTaskId: {
        a: [
          { ts: weekEntryTs, ms: 25 * 60 * 1000, name: "This week" },
          { ts: olderEntryTs, ms: 40 * 60 * 1000, name: "Older" },
        ],
      },
      liveSessionsByTaskId: {},
      rewards: null,
      nowMs,
      weekStarting: "mon",
    });

    expect(snapshot.totalFocusMs).toBe(65 * 60 * 1000);
    expect(snapshot.weeklyFocusMs).toBe(25 * 60 * 1000);
  });
});
