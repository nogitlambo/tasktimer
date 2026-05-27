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
  return rows.filter((row) => (row.rank && row.rank >= 4 && row.rank <= 10) || (row.isCurrentUser && (!row.rank || row.rank > 10)));
}

function expectDummyTableRows(rows: WeeklyLeaderboardRow[], metric: "weeklyXpGain" | "rewardTotalXp", cap: number) {
  const dummyRows = tableRows(rows).filter((row) => row.isDummy);

  expect(dummyRows).toHaveLength(7);
  expect(dummyRows.every((row) => !row.isPlaceholder && !row.isCurrentUser)).toBe(true);
  expect(dummyRows.every((row) => row.playerLabel && row.profile.username === row.playerLabel)).toBe(true);
  expect(dummyRows.every((row) => row.profile[metric] < cap)).toBe(true);
  expect(dummyRows.map((row) => row.profile[metric])).toEqual(
    dummyRows
      .map((row) => row.profile[metric])
      .slice()
      .sort((left, right) => right - left)
  );
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
    expectDummyTableRows(rows, "weeklyXpGain", 40);
  });

  it("pins the current user with their ladder rank when they are outside the weekly board with no weekly XP", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 240 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 180 }),
      ],
      currentUserEntry: createProfile({ uid: "me", username: "me", weeklyXpGain: 0 }),
      currentUserWeeklyRank: 12,
    });

    expect(rows.find((row) => row.isCurrentUser)).toMatchObject({
      isCurrentUser: true,
      rankLabel: "#12",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows).toHaveLength(11);
    expect(rows.filter((row) => !row.isPlaceholder && !row.isDummy && !row.isCurrentUser).map((row) => row.profile.uid)).toEqual(["top-1", "top-2"]);
  });

  it("keeps an out-of-top-ten current user available for the weekly table", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", weeklyXpGain: 0 }),
      currentUserWeeklyRank: 12,
    });
    const rowsForTable = tableRows(rows);

    expect(rowsForTable).toHaveLength(8);
    expect(rowsForTable.filter((row) => row.isDummy)).toHaveLength(7);
    expect(rowsForTable.find((row) => row.isCurrentUser)).toMatchObject({
      isCurrentUser: true,
      rankLabel: "#12",
      playerLabel: "You",
    });
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

  it("keeps podium slots blank and fills table slots with dummy rows on an empty weekly board", () => {
    const rows = buildWeeklyLeaderboardRows({
      weeklyEntries: [],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    });

    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 3).every((row) => row.isPlaceholder && !row.isDummy)).toBe(true);
    expect(rows.slice(3).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
    expect(rows.map((row) => row.rankLabel)).toEqual(["#1", "#2", "#3", "#4", "#5", "#6", "#7", "#8", "#9", "#10"]);
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
    expect(tableRows.slice(1).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
    expect(tableRows.slice(1).every((row) => row.profile.weeklyXpGain < 280)).toBe(true);
  });

  it("pads partial weekly boards", () => {
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
    expect(rows[2]?.isPlaceholder).toBe(true);
    expect(rows).toHaveLength(10);
    expect(rows.slice(3).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
  });

  it("generates stable dummy weekly rows below the lowest available podium XP", () => {
    const input = {
      weeklyEntries: [
        createProfile({ uid: "top-1", username: "top_1", weeklyXpGain: 260 }),
        createProfile({ uid: "top-2", username: "top_2", weeklyXpGain: 190 }),
      ],
      currentUserEntry: null,
      currentUserWeeklyRank: null,
    };

    const firstRows = buildWeeklyLeaderboardRows(input);
    const secondRows = buildWeeklyLeaderboardRows(input);

    expect(tableRows(firstRows).map((row) => [row.profile.uid, row.playerLabel, row.profile.weeklyXpGain])).toEqual(
      tableRows(secondRows).map((row) => [row.profile.uid, row.playerLabel, row.profile.weeklyXpGain])
    );
    expect(firstRows[2]).toMatchObject({ rankLabel: "#3", isPlaceholder: true, isDummy: false });
    expectDummyTableRows(firstRows, "weeklyXpGain", 190);
  });
});

describe("buildGlobalLeaderboardRows", () => {
  it("keeps podium slots blank and fills table slots with dummy rows on an empty global board", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [],
      currentUserEntry: null,
      currentUserRank: null,
    });

    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 3).every((row) => row.isPlaceholder && !row.isDummy)).toBe(true);
    expect(rows.slice(3).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
  });

  it("pads partial global boards", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [
        createProfile({ uid: "top-1", username: "top_1", rewardTotalXp: 900 }),
        createProfile({ uid: "top-2", username: "top_2", rewardTotalXp: 700 }),
      ],
      currentUserEntry: null,
      currentUserRank: null,
    });

    expect(rows).toHaveLength(10);
    expect(rows.slice(0, 2).map((row) => row.profile.uid)).toEqual(["top-1", "top-2"]);
    expect(rows[0]?.isPlaceholder).toBe(false);
    expect(rows[1]?.isPlaceholder).toBe(false);
    expect(rows[2]?.isPlaceholder).toBe(true);
    expect(rows.slice(3).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
    expect(rows.slice(3).every((row) => row.profile.rewardTotalXp < 700)).toBe(true);
  });

  it("pins the current user with their global rank when outside the top board", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [createProfile({ uid: "top-1", username: "top_1", rewardTotalXp: 900 })],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 200 }),
      currentUserRank: 42,
    });

    expect(rows.find((row) => row.isCurrentUser)).toMatchObject({
      isCurrentUser: true,
      rankLabel: "#42",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows).toHaveLength(11);
  });

  it("keeps an out-of-top-ten current user available for the global table", () => {
    const rows = buildGlobalLeaderboardRows({
      topEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 200 }),
      currentUserRank: 42,
    });
    const rowsForTable = tableRows(rows);

    expect(rowsForTable).toHaveLength(8);
    expect(rowsForTable.filter((row) => row.isDummy)).toHaveLength(7);
    expect(rowsForTable.find((row) => row.isCurrentUser)).toMatchObject({
      isCurrentUser: true,
      rankLabel: "#42",
      playerLabel: "You",
    });
    expectDummyTableRows(rows, "rewardTotalXp", 900);
  });

  it("generates stable dummy global rows below the lowest podium XP", () => {
    const input = {
      topEntries: [
        createProfile({ uid: "top-1", username: "top_1", rewardTotalXp: 900 }),
        createProfile({ uid: "top-2", username: "top_2", rewardTotalXp: 700 }),
      ],
      currentUserEntry: null,
      currentUserRank: null,
    };

    const firstRows = buildGlobalLeaderboardRows(input);
    const secondRows = buildGlobalLeaderboardRows(input);

    expect(tableRows(firstRows).map((row) => [row.profile.uid, row.playerLabel, row.profile.rewardTotalXp])).toEqual(
      tableRows(secondRows).map((row) => [row.profile.uid, row.playerLabel, row.profile.rewardTotalXp])
    );
    expect(firstRows[2]).toMatchObject({ rankLabel: "#3", isPlaceholder: true, isDummy: false });
    expectDummyTableRows(firstRows, "rewardTotalXp", 700);
  });
});

describe("buildRivalLeaderboardRows", () => {
  it("returns only the current user when rival rank is unavailable and there are no rivals", () => {
    const rows = buildRivalLeaderboardRows({
      rivalEntries: [],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 1200 }),
      currentUserRivalRank: null,
    });

    expect(rows[0]).toMatchObject({
      isCurrentUser: true,
      rank: 1,
      rankLabel: "#1",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows).toHaveLength(10);
    expect(rows.slice(1, 3).every((row) => row.isPlaceholder && !row.isDummy)).toBe(true);
    expect(rows.slice(3).every((row) => row.isDummy && !row.isPlaceholder)).toBe(true);
    expectDummyTableRows(rows, "rewardTotalXp", 1200);
  });

  it("keeps the current user on their numeric rival ladder rank when outside the visible board", () => {
    const rows = buildRivalLeaderboardRows({
      rivalEntries: [createProfile({ uid: "rival-1", username: "rival_1", rewardTotalXp: 1600 })],
      currentUserEntry: createProfile({ uid: "me", username: "me", rewardTotalXp: 900 }),
      currentUserRivalRank: 14,
    });

    expect(rows.find((row) => row.isCurrentUser)).toMatchObject({
      isCurrentUser: true,
      rank: 14,
      rankLabel: "#14",
      playerLabel: "You",
      isPlaceholder: false,
    });
    expect(rows.filter((row) => row.profile.uid === "me")).toHaveLength(1);
    expect(tableRows(rows).filter((row) => row.isDummy)).toHaveLength(7);
    expectDummyTableRows(rows, "rewardTotalXp", 1600);
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
