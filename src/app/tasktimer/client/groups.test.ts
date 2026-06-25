import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveFriendRequest,
  cancelOutgoingFriendRequest,
  declineFriendRequest,
} from "../lib/friendsStore";
import {
  computeSharedTaskTimingMetrics,
  deriveFriendEmailByUid,
  formatSharedTaskWeekPercent,
  createTaskTimerGroups,
  getFriendRequestActionCompleteStatus,
  getFriendProfileOpenUidFromTarget,
  getSharedTaskGoalMetrics,
  loadGroupsSnapshotForUid,
  renderSharedTaskMetricRows,
} from "./groups";
import type { TaskTimerGroupsContext } from "./context";
import type { FriendProfile, Friendship } from "../lib/friendsStore";

vi.mock("../lib/friendsStore", () => ({
  approveFriendRequest: vi.fn(),
  cancelOutgoingFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  deleteFriendship: vi.fn(),
  deleteSharedTaskSummary: vi.fn(),
  loadFriendProfile: vi.fn(),
  loadFriendships: vi.fn(),
  loadIncomingFriendRequestEmailHints: vi.fn(),
  loadIncomingRequests: vi.fn(),
  loadOutgoingFriendRequestEmailHints: vi.fn(),
  loadOutgoingRequests: vi.fn(),
  loadSharedTaskSummariesForOwner: vi.fn(),
  loadSharedTaskSummariesForViewer: vi.fn(),
  sendFriendRequest: vi.fn(),
  upsertSharedTaskSummary: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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
          completedTaskCount: 7,
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
      completedTaskCount: 7,
    } satisfies FriendProfile;

    const snapshot = await loadGroupsSnapshotForUid("user-a", {
      loadIncomingRequests: vi.fn(async () => {
        throw new Error("incoming request query failed");
      }),
      loadOutgoingRequests: vi.fn(async () => []),
      loadIncomingFriendRequestEmailHints: vi.fn(async () => []),
      loadOutgoingFriendRequestEmailHints: vi.fn(async () => []),
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

  it("derives friend email hints from approved incoming and outgoing request records only", async () => {
    const friendEmailByUid = deriveFriendEmailByUid(
      "user-a",
      [
        { senderUid: "friend-in", senderEmail: "incoming@example.com", status: "approved" },
        { senderUid: "friend-pending", senderEmail: "pending@example.com", status: "pending" },
        { senderUid: "friend-empty", senderEmail: "", status: "approved" },
      ],
      [
        { receiverUid: "friend-out", receiverEmail: "outgoing@example.com", status: "approved" },
        { receiverUid: "friend-declined", receiverEmail: "declined@example.com", status: "declined" },
        { receiverUid: "friend-null", receiverEmail: null, status: "approved" },
      ]
    );

    expect(friendEmailByUid).toEqual({
      "friend-in": "incoming@example.com",
      "friend-out": "outgoing@example.com",
    });
  });

  it("includes approved friend request email hints in the groups snapshot", async () => {
    const snapshot = await loadGroupsSnapshotForUid("user-a", {
      loadIncomingRequests: vi.fn(async () => []),
      loadOutgoingRequests: vi.fn(async () => []),
      loadIncomingFriendRequestEmailHints: vi.fn(async () => [
        {
          senderUid: "friend-in",
          senderEmail: "incoming@example.com",
          status: "approved",
        } as never,
      ]),
      loadOutgoingFriendRequestEmailHints: vi.fn(async () => [
        {
          receiverUid: "friend-out",
          receiverEmail: "outgoing@example.com",
          status: "approved",
        } as never,
      ]),
      loadFriendships: vi.fn(async () => []),
      loadFriendProfile: vi.fn(async () => null as never),
      loadSharedTaskSummariesForViewer: vi.fn(async () => []),
      loadSharedTaskSummariesForOwner: vi.fn(async () => []),
    });

    expect(snapshot.friendEmailByUid).toEqual({
      "friend-in": "incoming@example.com",
      "friend-out": "outgoing@example.com",
    });
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

describe("friend request action status", () => {
  type FriendRequestClickEvent = {
    target?: {
      closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null;
    };
  };

  function makeElement() {
    return {
      className: "",
      disabled: false,
      innerHTML: "",
      style: {} as Record<string, string>,
      textContent: "",
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
      },
      querySelectorAll: vi.fn(() => []),
      setAttribute: vi.fn(),
    };
  }

  function makeGroupsHarness(action: "approve" | "decline" | "cancel") {
    const originalWindow = globalThis.window;
    globalThis.window = {
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis;

    const statusEl = makeElement();
    const incomingList = makeElement();
    const outgoingList = makeElement();
    const eventHandlers: Record<string, (event: FriendRequestClickEvent) => void> = {};
    const showActionConfirmation = vi.fn();

    const ctx = {
      els: {
        commandCenterGroupsAlertBadge: null,
        footerTest2AlertBadge: null,
        friendProfileDeleteBtn: null,
        friendRequestSendBtn: null,
        groupsFriendRequestStatus: statusEl,
        groupsFriendsList: makeElement(),
        groupsIncomingRequestsDetails: makeElement(),
        groupsIncomingRequestsList: incomingList,
        groupsIncomingRequestsTitle: makeElement(),
        groupsOutgoingRequestsDetails: makeElement(),
        groupsOutgoingRequestsList: outgoingList,
        groupsOutgoingRequestsTitle: makeElement(),
        groupsSharedByYouList: makeElement(),
        openFriendRequestModalBtn: null,
      },
      on: (target: unknown, event: string, handler: (event: unknown) => void) => {
        if (target === incomingList && event === "click") eventHandlers.incoming = handler;
        if (target === outgoingList && event === "click") eventHandlers.outgoing = handler;
      },
      getCurrentUid: () => "user-a",
      getGroupsLoading: () => false,
      getGroupsLoadingDepth: () => 0,
      setGroupsLoading: vi.fn(),
      setGroupsLoadingDepth: vi.fn(),
      getGroupsRefreshSeq: () => 0,
      setGroupsRefreshSeq: vi.fn(),
      getGroupsIncomingRequests: () => [],
      setGroupsIncomingRequests: vi.fn(),
      getGroupsOutgoingRequests: () => [],
      setGroupsOutgoingRequests: vi.fn(),
      getGroupsFriendships: () => [],
      setGroupsFriendships: vi.fn(),
      getGroupsSharedSummaries: () => [],
      setGroupsSharedSummaries: vi.fn(),
      getOwnSharedSummaries: () => [],
      setOwnSharedSummaries: vi.fn(),
      getFriendProfileCacheByUid: () => ({}),
      setFriendProfileCacheByUid: vi.fn(),
      getFriendEmailByUid: () => ({}),
      setFriendEmailByUid: vi.fn(),
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getActiveFriendProfileName: () => "",
      getActiveFriendProfileUid: () => null,
      setActiveFriendProfileName: vi.fn(),
      setActiveFriendProfileUid: vi.fn(),
      getShareTaskIndex: () => null,
      setShareTaskIndex: vi.fn(),
      getShareTaskMode: () => "share",
      setShareTaskMode: vi.fn(),
      getShareTaskTaskId: () => null,
      setShareTaskTaskId: vi.fn(),
      hasEntitlement: () => true,
      showActionConfirmation,
      showUpgradePrompt: vi.fn(),
      showWorkingIndicator: vi.fn(() => 1),
      hideWorkingIndicator: vi.fn(),
      getFriendAvatarSrcById: vi.fn(() => ""),
      buildFriendInitialAvatarDataUrl: vi.fn(() => ""),
      getFriendAvatarSrc: vi.fn(() => ""),
      getMergedFriendProfile: vi.fn(() => ({ alias: "Friend" })),
      jumpToTaskById: vi.fn(),
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      fillBackgroundForPct: vi.fn(() => ""),
      normalizeHistoryTimestampMs: (value: unknown) => Number(value || 0),
      getCurrentPlan: () => "pro",
    };

    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).registerGroupsEvents();

    const button = {
      getAttribute: vi.fn((name: string) =>
        name === "data-request-id" ? "request-1" : name === "data-friend-action" ? action : null
      ),
    };
    const event = {
      target: {
        closest: vi.fn((selector: string) => (selector === "[data-friend-action][data-request-id]" ? button : null)),
      },
    };

    return {
      event,
      handler: action === "cancel" ? eventHandlers.outgoing : eventHandlers.incoming,
      restoreWindow: () => {
        globalThis.window = originalWindow;
      },
      showActionConfirmation,
      statusEl,
    };
  }

  async function flushFriendRequestAction() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  it.each([
    ["approve", "Friend request approved."],
    ["decline", "Friend request declined."],
    ["cancel", "Friend request cancelled."],
  ] as const)("routes %s success through the action confirmation overlay", async (action, message) => {
    vi.mocked(approveFriendRequest).mockResolvedValue({ ok: true });
    vi.mocked(declineFriendRequest).mockResolvedValue({ ok: true });
    vi.mocked(cancelOutgoingFriendRequest).mockResolvedValue({ ok: true });

    const harness = makeGroupsHarness(action);
    try {
      harness.handler(harness.event);
      await flushFriendRequestAction();

      expect(getFriendRequestActionCompleteStatus(action)).toBe(message);
      expect(harness.showActionConfirmation).toHaveBeenCalledWith(message);
      expect(harness.statusEl.textContent).toBe("");
      expect(harness.statusEl.style.display).toBe("none");
    } finally {
      harness.restoreWindow();
    }
  });

  it("keeps failed friend request action messages inline", async () => {
    vi.mocked(approveFriendRequest).mockResolvedValue({ ok: false, message: "Request is no longer pending." });

    const harness = makeGroupsHarness("approve");
    try {
      harness.handler(harness.event);
      await flushFriendRequestAction();

      expect(harness.showActionConfirmation).not.toHaveBeenCalled();
      expect(harness.statusEl.textContent).toBe("Request is no longer pending.");
      expect(harness.statusEl.style.display).toBe("block");
    } finally {
      harness.restoreWindow();
    }
  });
});

describe("friend info modal email", () => {
  function makeElement() {
    return {
      alt: "",
      className: "",
      disabled: false,
      innerHTML: "",
      src: "",
      style: {} as Record<string, string>,
      textContent: "",
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
        toggle: vi.fn(),
      },
      querySelectorAll: vi.fn(() => []),
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };
  }

  function makeFriendInfoHarness(emailByUid: Record<string, string>) {
    const modal = makeElement();
    const emailEl = makeElement();
    const nameEl = makeElement();
    const memberSinceEl = makeElement();
    const friendship = {
      pairId: "pair:friend-b:user-a",
      users: ["friend-b", "user-a"],
      profileByUid: {
        "friend-b": {
          alias: "Friend Bee",
          avatarId: "toon",
          avatarCustomSrc: null,
          googlePhotoUrl: null,
          rankThumbnailSrc: null,
          currentRankId: "bronze",
          totalXp: 250,
          completedTaskCount: 12,
        },
      },
      createdAt: { toMillis: () => new Date("2026-05-01T00:00:00Z").getTime() } as unknown as Friendship["createdAt"],
      createdBy: "user-a",
    } satisfies Friendship;
    const ctx = {
      els: {
        friendProfileAvatar: makeElement(),
        friendProfileCompletedTaskCount: makeElement(),
        friendProfileEmail: emailEl,
        friendProfileMemberSince: memberSinceEl,
        friendProfileModal: modal,
        friendProfileName: nameEl,
        friendProfileRank: makeElement(),
        friendProfileRankImage: makeElement(),
        friendProfileRankPlaceholder: makeElement(),
        friendProfileSharedTaskCount: makeElement(),
        friendProfileSharedTime: makeElement(),
        friendProfileXp: makeElement(),
      },
      on: vi.fn(),
      getCurrentUid: () => "user-a",
      getGroupsFriendships: () => [friendship],
      getGroupsSharedSummaries: () => [],
      getFriendEmailByUid: () => emailByUid,
      getMergedFriendProfile: (_friendUid: string, baseProfile?: FriendProfile | null) => baseProfile || ({} as FriendProfile),
      getFriendAvatarSrc: vi.fn(() => "/avatar.webp"),
      setActiveFriendProfileName: vi.fn(),
      setActiveFriendProfileUid: vi.fn(),
      hasEntitlement: () => true,
      getGroupsIncomingRequests: () => [],
      getGroupsOutgoingRequests: () => [],
      getGroupsLoading: () => false,
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getOwnSharedSummaries: () => [],
      getFriendProfileCacheByUid: () => ({}),
      getCurrentPlan: () => "pro",
    };

    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).openFriendProfileModal("friend-b");

    return { emailEl, memberSinceEl, modal, nameEl };
  }

  it("shows a friend's email between username and member since when available", () => {
    const harness = makeFriendInfoHarness({ "friend-b": "friend@example.com" });

    expect(harness.nameEl.textContent).toBe("Friend Bee");
    expect(harness.emailEl.textContent).toBe("friend@example.com");
    expect(harness.emailEl.style.display).toBe("block");
    expect(harness.memberSinceEl.textContent).toContain("Member since");
    expect(harness.modal.style.display).toBe("flex");
  });

  it("hides the friend email row when no email hint is available", () => {
    const harness = makeFriendInfoHarness({});

    expect(harness.emailEl.textContent).toBe("");
    expect(harness.emailEl.style.display).toBe("none");
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
