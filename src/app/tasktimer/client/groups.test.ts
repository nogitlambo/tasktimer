import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveFriendRequest,
  cancelOutgoingFriendRequest,
  deleteFriendship,
  declineFriendRequest,
  loadFriendProfile,
  loadFriendships,
  loadIncomingFriendRequestEmailHints,
  loadIncomingRequests,
  loadOutgoingFriendRequestEmailHints,
  loadOutgoingRequests,
  loadSharedTaskSummariesForOwner,
  loadSharedTaskSummariesForViewer,
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
import type { FriendProfile, FriendRequest, Friendship, SharedTaskSummary } from "../lib/friendsStore";

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

describe("groups friends list shared task counts", () => {
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
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };
  }

  function makeSharedSummary(overrides: Partial<SharedTaskSummary> = {}): SharedTaskSummary {
    return {
      shareDocId: "share-1",
      ownerUid: "friend-b",
      friendUid: "user-a",
      taskId: "task-1",
      taskName: "Deep Work",
      taskColor: null,
      timerState: "stopped",
      focusTrend7dMs: [],
      checkpointScaleMs: null,
      taskCreatedAtMs: null,
      dailyGoalMs: null,
      todayLoggedMs: 0,
      weekLoggedMs: 0,
      weekGoalMs: null,
      avgTimeLoggedThisWeekMs: 0,
      totalTimeLoggedMs: 0,
      sharedAt: null,
      updatedAt: null,
      schemaVersion: 1,
      ...overrides,
    };
  }

  function makeFriendship(friendUid: string, alias: string): Friendship {
    return {
      pairId: `pair:${friendUid}:user-a`,
      users: [friendUid, "user-a"],
      profileByUid: {
        [friendUid]: {
          alias,
          avatarId: null,
          avatarCustomSrc: null,
          googlePhotoUrl: null,
          rankThumbnailSrc: null,
          currentRankId: null,
          totalXp: null,
          completedTaskCount: null,
        },
      },
      createdAt: null,
      createdBy: "user-a",
    };
  }

  function renderFriendsList(
    sharedSummaries: SharedTaskSummary[],
    opts: { currentUid?: string; friendships?: Friendship[] } = {}
  ) {
    const groupsFriendsList = makeElement();
    const groupsFriendsTitle = makeElement();
    const friendships = opts.friendships ?? [makeFriendship("friend-b", "Friend Bee")];

    const ctx = {
      els: {
        commandCenterGroupsAlertBadge: null,
        footerTest2AlertBadge: null,
        friendProfileDeleteBtn: null,
        friendRequestSendBtn: null,
        groupsFriendsTitle,
        groupsFriendsList,
        groupsIncomingRequestsDetails: makeElement(),
        groupsIncomingRequestsList: makeElement(),
        groupsIncomingRequestsTitle: makeElement(),
        groupsOutgoingRequestsDetails: makeElement(),
        groupsOutgoingRequestsList: makeElement(),
        groupsOutgoingRequestsTitle: makeElement(),
        groupsSharedByYouList: makeElement(),
        groupsSharedByYouTitle: makeElement(),
        openFriendRequestModalBtn: null,
      },
      on: vi.fn(),
      getCurrentUid: () => opts.currentUid ?? "user-a",
      getGroupsLoading: () => false,
      getGroupsIncomingRequests: () => [],
      getGroupsOutgoingRequests: () => [],
      getGroupsFriendships: () => friendships,
      getGroupsSharedSummaries: () => sharedSummaries,
      getOwnSharedSummaries: () => [],
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      hasEntitlement: () => true,
      getCurrentPlan: () => "pro",
      getMergedFriendProfile: (_friendUid: string, baseProfile?: FriendProfile | null) => baseProfile || ({ alias: "Friend Bee" } as FriendProfile),
      getFriendAvatarSrc: vi.fn(() => "/friend-row-avatar.webp"),
      escapeHtmlUI: (value: unknown) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
    };

    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).renderGroupsPage();
    return { html: groupsFriendsList.innerHTML, title: groupsFriendsTitle.textContent };
  }

  it("omits the shared count meta when a friend has zero shared tasks", () => {
    const { html } = renderFriendsList([]);

    expect(html).not.toContain("0 tasks shared with you");
    expect(html).not.toContain('class="friendIdentityMeta"');
    expect(html).toContain("No tasks shared with you.");
  });

  it("keeps the shared count meta when a friend has shared tasks", () => {
    const { html } = renderFriendsList([makeSharedSummary()]);

    expect(html).toContain('class="friendIdentityMeta"');
    expect(html).toContain("1 task shared with you");
    expect(html).not.toContain("No tasks shared with you.");
  });

  it("renders the friends title count for zero friends", () => {
    const { title } = renderFriendsList([], { friendships: [] });

    expect(title).toBe("Friends (0)");
  });

  it("renders the friends title count for accepted friendships", () => {
    const { title } = renderFriendsList([], {
      friendships: [makeFriendship("friend-b", "Friend Bee"), makeFriendship("friend-c", "Friend Cee")],
    });

    expect(title).toBe("Friends (2)");
  });

  it("renders zero friends in the title when signed out", () => {
    const { title } = renderFriendsList([], {
      currentUid: "",
      friendships: [makeFriendship("friend-b", "Friend Bee"), makeFriendship("friend-c", "Friend Cee")],
    });

    expect(title).toBe("Friends (0)");
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
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      removeAttribute: vi.fn(),
      setAttribute: vi.fn(),
    };
  }

  function makeGroupsHarness(action: "approve" | "decline" | "cancel") {
    const originalWindow = globalThis.window;
    globalThis.window = {
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis;

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
    };
  }

  async function flushFriendRequestAction() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  function makeRect(overrides: Partial<DOMRect> = {}) {
    const rect = {
      left: 20,
      top: 240,
      right: 220,
      bottom: 284,
      width: 200,
      height: 44,
      x: 20,
      y: 240,
      toJSON: () => ({}),
      ...overrides,
    };
    return rect as DOMRect;
  }

  function makeAnimationHarness(options: { action?: "approve" | "decline"; withTarget?: boolean; hidden?: boolean } = {}) {
    const action = options.action || "approve";
    const originalWindow = globalThis.window;
    const originalDocument = globalThis.document;
    const appendChild = vi.fn();
    type CreatedAnimationElement = {
      tagName: string;
      alt: string;
      classList: {
        add: ReturnType<typeof vi.fn>;
        remove: ReturnType<typeof vi.fn>;
      };
      className: string;
      src: string;
      style: Record<string, string>;
      append: ReturnType<typeof vi.fn>;
      setAttribute: ReturnType<typeof vi.fn>;
      addEventListener: ReturnType<typeof vi.fn>;
      removeEventListener: ReturnType<typeof vi.fn>;
      remove: ReturnType<typeof vi.fn>;
      listeners: Record<string, () => void>;
      textContent?: string;
    };
    const createdElements: CreatedAnimationElement[] = [];
    const createElement = vi.fn((tagName: string) => {
      const listeners: Record<string, () => void> = {};
      const element = {
        tagName,
        alt: "",
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
        },
        className: "",
        src: "",
        style: {} as Record<string, string>,
        append: vi.fn(),
        setAttribute: vi.fn(),
        addEventListener: vi.fn((event: string, handler: () => void) => {
          listeners[event] = handler;
        }),
        removeEventListener: vi.fn(),
        remove: vi.fn(),
        listeners,
      };
      createdElements.push(element);
      return element;
    });
    globalThis.window = {
      setTimeout,
      clearTimeout,
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window & typeof globalThis;
    globalThis.document = {
      hidden: !!options.hidden,
      body: { appendChild },
      createElement,
    } as unknown as Document;

    const request = {
      requestId: "request-1",
      senderUid: "friend-b",
      senderEmail: "friend@example.com",
      senderAvatarId: "toon-1",
      status: "pending",
    } as FriendRequest;
    let incomingRequests: FriendRequest[] = [request];
    let friendships: Friendship[] = [];
    let friendProfiles: Record<string, FriendProfile> = {};

    vi.mocked(loadIncomingRequests).mockImplementation(async () => incomingRequests);
    vi.mocked(loadOutgoingRequests).mockResolvedValue([]);
    vi.mocked(loadIncomingFriendRequestEmailHints).mockResolvedValue([]);
    vi.mocked(loadOutgoingFriendRequestEmailHints).mockResolvedValue([]);
    vi.mocked(loadFriendships).mockImplementation(async () => friendships);
    vi.mocked(loadFriendProfile).mockImplementation(async (uid) => friendProfiles[String(uid)] || null);
    vi.mocked(loadSharedTaskSummariesForViewer).mockResolvedValue([]);
    vi.mocked(loadSharedTaskSummariesForOwner).mockResolvedValue([]);

    const sourceIdentity = {
      getBoundingClientRect: vi.fn(() => makeRect()),
    };
    const sourceRow = {
      querySelector: vi.fn((selector: string) => {
        if (selector === ".friendRequestIdentityRow") return sourceIdentity;
        if (selector === ".friendRequestAvatar") return { src: "/avatar.webp", currentSrc: "/avatar.webp" };
        if (selector === ".friendRequestAlias") return { textContent: "Friend Bee" };
        return null;
      }),
    };
    const button = {
      getAttribute: vi.fn((name: string) =>
        name === "data-request-id" ? "request-1" : name === "data-friend-action" ? action : null
      ),
      closest: vi.fn((selector: string) => (selector === ".groupsIncomingRequestRow" ? sourceRow : null)),
    };
    const event = {
      target: {
        closest: vi.fn((selector: string) => (selector === "[data-friend-action][data-request-id]" ? button : null)),
      },
    };

    const targetIdentity = { getBoundingClientRect: vi.fn(() => makeRect({ top: 80, bottom: 134, height: 54 })) };
    const targetRow = {
      open: false,
      offsetWidth: 320,
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      getAttribute: vi.fn((name: string) => (name === "data-friend-uid" ? "friend-b" : null)),
      querySelector: vi.fn((selector: string) => (selector === ".friendIdentityRow" ? targetIdentity : null)),
      addEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => makeRect({ top: 80, bottom: 134, height: 54 })),
    };

    const incomingList = makeElement();
    const outgoingList = makeElement();
    const friendProfilePanel = {
      ...makeElement(),
      getBoundingClientRect: vi.fn(() => makeRect({ left: 100, top: 100, right: 660, bottom: 520, width: 560, height: 420 })),
      style: {
        removeProperty: vi.fn(),
        setProperty: vi.fn(),
      },
    };
    const friendProfileModal = {
      ...makeElement(),
      querySelector: vi.fn((selector: string) => (selector === ".modal" ? friendProfilePanel : null)),
    };
    const setActiveFriendProfileName = vi.fn();
    const setActiveFriendProfileUid = vi.fn();
    const friendsList = {
      ...makeElement(),
      querySelectorAll: vi.fn((selector: string) =>
        options.withTarget !== false && selector === ".friendSharedTasksDetails[data-friend-uid]" ? [targetRow] : []
      ),
    };
    const eventHandlers: Record<string, (event: FriendRequestClickEvent) => void> = {};
    const showActionConfirmation = vi.fn();

    const ctx = {
      els: {
        commandCenterGroupsAlertBadge: null,
        footerTest2AlertBadge: null,
        friendProfileAvatar: makeElement(),
        friendProfileCloseBtn: null,
        friendProfileCompletedTaskCount: makeElement(),
        friendProfileDeleteBtn: null,
        friendProfileEmail: makeElement(),
        friendProfileMemberSince: makeElement(),
        friendProfileModal,
        friendProfileName: makeElement(),
        friendProfileRank: makeElement(),
        friendProfileRankImage: makeElement(),
        friendProfileRankPlaceholder: makeElement(),
        friendProfileSharedTaskCount: makeElement(),
        friendProfileSharedTime: makeElement(),
        friendProfileXp: makeElement(),
        friendRequestSendBtn: null,
        groupsFriendsList: friendsList,
        groupsIncomingRequestsDetails: makeElement(),
        groupsIncomingRequestsList: incomingList,
        groupsIncomingRequestsTitle: makeElement(),
        groupsOutgoingRequestsDetails: makeElement(),
        groupsOutgoingRequestsList: outgoingList,
        groupsOutgoingRequestsTitle: makeElement(),
        groupsSharedByYouList: makeElement(),
        openFriendRequestModalBtn: null,
      },
      on: (target: unknown, eventName: string, handler: (event: unknown) => void) => {
        if (target === incomingList && eventName === "click") eventHandlers.incoming = handler;
        if (target === outgoingList && eventName === "click") eventHandlers.outgoing = handler;
      },
      getCurrentUid: () => "user-a",
      getGroupsLoading: () => false,
      getGroupsLoadingDepth: () => 0,
      setGroupsLoading: vi.fn(),
      setGroupsLoadingDepth: vi.fn(),
      getGroupsRefreshSeq: () => 0,
      setGroupsRefreshSeq: vi.fn(),
      getGroupsIncomingRequests: () => incomingRequests,
      setGroupsIncomingRequests: vi.fn((value: FriendRequest[]) => {
        incomingRequests = value;
      }),
      getGroupsOutgoingRequests: () => [],
      setGroupsOutgoingRequests: vi.fn(),
      getGroupsFriendships: () => friendships,
      setGroupsFriendships: vi.fn((value: Friendship[]) => {
        friendships = value;
      }),
      getGroupsSharedSummaries: () => [],
      setGroupsSharedSummaries: vi.fn(),
      getOwnSharedSummaries: () => [],
      setOwnSharedSummaries: vi.fn(),
      getFriendProfileCacheByUid: () => friendProfiles,
      setFriendProfileCacheByUid: vi.fn((value: Record<string, FriendProfile>) => {
        friendProfiles = value;
      }),
      getFriendEmailByUid: () => ({}),
      setFriendEmailByUid: vi.fn(),
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getActiveFriendProfileName: () => "",
      getActiveFriendProfileUid: () => null,
      setActiveFriendProfileName,
      setActiveFriendProfileUid,
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
      getFriendAvatarSrcById: vi.fn(() => "/fallback-avatar.webp"),
      buildFriendInitialAvatarDataUrl: vi.fn(() => ""),
      getFriendAvatarSrc: vi.fn(() => "/friend-row-avatar.webp"),
      getMergedFriendProfile: vi.fn((_friendUid: string, baseProfile?: FriendProfile | null) => baseProfile || ({ alias: "Friend Bee" } as FriendProfile)),
      jumpToTaskById: vi.fn(),
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      fillBackgroundForPct: vi.fn(() => ""),
      normalizeHistoryTimestampMs: (value: unknown) => Number(value || 0),
      getCurrentPlan: () => "pro",
    };

    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).registerGroupsEvents();

    return {
      appendChild,
      createdElements,
      event,
      handler: action === "decline" ? eventHandlers.incoming : eventHandlers.incoming,
      restoreWindow: () => {
        globalThis.window = originalWindow;
        globalThis.document = originalDocument;
      },
      setApprovedRefreshData: () => {
        incomingRequests = [];
        friendships = [
          {
            pairId: "pair:friend-b:user-a",
            users: ["friend-b", "user-a"],
            profileByUid: {
              "friend-b": {
                alias: "Friend Bee",
                avatarId: "toon-1",
                avatarCustomSrc: null,
                googlePhotoUrl: null,
                rankThumbnailSrc: null,
                currentRankId: null,
                totalXp: null,
                completedTaskCount: null,
              },
            },
            createdAt: null,
            createdBy: "friend-b",
          },
        ];
      },
      targetRow,
      friendProfileModal,
      friendProfilePanel,
      setActiveFriendProfileName,
      setActiveFriendProfileUid,
      showActionConfirmation,
    };
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
    } finally {
      harness.restoreWindow();
    }
  });

  it("routes failed friend request action messages through the action confirmation overlay", async () => {
    vi.mocked(approveFriendRequest).mockResolvedValue({ ok: false, message: "Request is no longer pending." });

    const harness = makeGroupsHarness("approve");
    try {
      harness.handler(harness.event);
      await flushFriendRequestAction();

      expect(harness.showActionConfirmation).toHaveBeenCalledWith("Request is no longer pending.");
    } finally {
      harness.restoreWindow();
    }
  });

  it("animates a successful accepted request and opens Friend Info from the new friend row", async () => {
    vi.mocked(approveFriendRequest).mockImplementation(async () => {
      harness.setApprovedRefreshData();
      return { ok: true };
    });
    const harness = makeAnimationHarness();
    try {
      harness.handler(harness.event);
      await flushFriendRequestAction();

      expect(harness.showActionConfirmation).toHaveBeenCalledWith("Friend request approved.");
      expect(harness.targetRow.classList.add).toHaveBeenCalledWith("isFriendAcceptLanding");
      expect(harness.appendChild).toHaveBeenCalledTimes(1);
      expect(harness.createdElements[0]?.className).toBe("friendAcceptFloatClone");
      harness.createdElements[0]?.listeners.transitionend?.();
      await flushFriendRequestAction();

      expect(harness.setActiveFriendProfileUid).toHaveBeenCalledWith("friend-b");
      expect(harness.setActiveFriendProfileName).toHaveBeenCalledWith("Friend Bee");
      expect(harness.friendProfileModal.style.display).toBe("flex");
      expect(harness.friendProfilePanel.style.setProperty).toHaveBeenCalledWith("--friend-profile-zoom-origin-x", expect.any(String));
      expect(harness.friendProfilePanel.style.setProperty).toHaveBeenCalledWith("--friend-profile-zoom-origin-y", expect.any(String));
    } finally {
      harness.restoreWindow();
    }
  });

  it("does not animate failed or non-approve request actions", async () => {
    vi.mocked(approveFriendRequest).mockResolvedValue({ ok: false, message: "Request is no longer pending." });
    vi.mocked(declineFriendRequest).mockResolvedValue({ ok: true });

    const failedApprove = makeAnimationHarness();
    try {
      failedApprove.handler(failedApprove.event);
      await flushFriendRequestAction();
      expect(failedApprove.appendChild).not.toHaveBeenCalled();
      expect(failedApprove.targetRow.classList.add).not.toHaveBeenCalledWith("isFriendAcceptLanding");
      expect(failedApprove.friendProfileModal.style.display).not.toBe("flex");
    } finally {
      failedApprove.restoreWindow();
    }

    const decline = makeAnimationHarness({ action: "decline" });
    try {
      decline.handler(decline.event);
      await flushFriendRequestAction();
      expect(decline.appendChild).not.toHaveBeenCalled();
      expect(decline.targetRow.classList.add).not.toHaveBeenCalledWith("isFriendAcceptLanding");
      expect(decline.friendProfileModal.style.display).not.toBe("flex");
    } finally {
      decline.restoreWindow();
    }
  });

  it("skips the float when the accepted friend target row is unavailable", async () => {
    const harness = makeAnimationHarness({ withTarget: false });
    vi.mocked(approveFriendRequest).mockImplementation(async () => {
      harness.setApprovedRefreshData();
      return { ok: true };
    });
    try {
      harness.handler(harness.event);
      await flushFriendRequestAction();

      expect(harness.showActionConfirmation).toHaveBeenCalledWith("Friend request approved.");
      expect(harness.appendChild).not.toHaveBeenCalled();
      expect(harness.targetRow.classList.add).not.toHaveBeenCalledWith("isFriendAcceptLanding");
      expect(harness.friendProfileModal.style.display).not.toBe("flex");
    } finally {
      harness.restoreWindow();
    }
  });
});

describe("friend removal status", () => {
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

  function makeRemoveFriendHarness() {
    const originalWindow = globalThis.window;
    globalThis.window = {
      setTimeout,
      clearTimeout,
    } as unknown as Window & typeof globalThis;

    let friendships: Friendship[] = [
      {
        pairId: "pair:friend-b:user-a",
        users: ["friend-b", "user-a"],
        profileByUid: {
          "friend-b": {
            alias: "Friend Bee",
            avatarId: null,
            avatarCustomSrc: null,
            googlePhotoUrl: null,
            rankThumbnailSrc: null,
            currentRankId: null,
            totalXp: null,
            completedTaskCount: null,
          },
        },
        createdAt: null,
        createdBy: "user-a",
      },
    ];
    const deleteBtn = makeElement();
    const eventHandlers: Record<string, (event: { preventDefault?: () => void }) => void> = {};
    const confirmActions: Array<() => void> = [];
    const showActionConfirmation = vi.fn();

    const ctx = {
      els: {
        commandCenterGroupsAlertBadge: null,
        confirmOverlay: makeElement(),
        footerTest2AlertBadge: null,
        friendProfileDeleteBtn: deleteBtn,
        friendProfileModal: makeElement(),
        friendProfileName: { textContent: "Friend Bee" },
        friendRequestSendBtn: null,
        groupsFriendsList: makeElement(),
        groupsIncomingRequestsDetails: makeElement(),
        groupsIncomingRequestsList: makeElement(),
        groupsIncomingRequestsTitle: makeElement(),
        groupsOutgoingRequestsDetails: makeElement(),
        groupsOutgoingRequestsList: makeElement(),
        groupsOutgoingRequestsTitle: makeElement(),
        groupsSharedByYouList: makeElement(),
        groupsSharedByYouTitle: makeElement(),
        openFriendRequestModalBtn: null,
      },
      on: (target: unknown, event: string, handler: (event: unknown) => void) => {
        if (target === deleteBtn && event === "click") eventHandlers.delete = handler;
      },
      confirm: (_title: string, _text: string, opts: { onOk: () => void }) => {
        confirmActions.push(opts.onOk);
      },
      closeConfirm: vi.fn(),
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
      getGroupsFriendships: () => friendships,
      setGroupsFriendships: (value: Friendship[]) => {
        friendships = value;
      },
      getGroupsSharedSummaries: () => [],
      setGroupsSharedSummaries: vi.fn(),
      getOwnSharedSummaries: () => [],
      setOwnSharedSummaries: vi.fn(),
      getFriendProfileCacheByUid: () => ({ "friend-b": { alias: "Friend Bee" } }),
      setFriendProfileCacheByUid: vi.fn(),
      getFriendEmailByUid: () => ({}),
      setFriendEmailByUid: vi.fn(),
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getActiveFriendProfileName: () => "Friend Bee",
      getActiveFriendProfileUid: () => "friend-b",
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
      getMergedFriendProfile: vi.fn(() => ({ alias: "Friend Bee" })),
      getTasks: () => [],
      jumpToTaskById: vi.fn(),
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      fillBackgroundForPct: vi.fn(() => ""),
      normalizeHistoryTimestampMs: (value: unknown) => Number(value || 0),
      getCurrentPlan: () => "pro",
    };

    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).registerGroupsEvents();
    eventHandlers.delete?.({ preventDefault: vi.fn() });
    confirmActions[0]?.();

    return {
      restoreWindow: () => {
        globalThis.window = originalWindow;
      },
      showActionConfirmation,
    };
  }

  async function flushRemoveFriendAction() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  it("routes friend removal success through the action confirmation overlay", async () => {
    vi.mocked(deleteFriendship).mockResolvedValue({ ok: true });

    const harness = makeRemoveFriendHarness();
    try {
      await flushRemoveFriendAction();

      expect(harness.showActionConfirmation).toHaveBeenCalledWith("Friend Bee was removed from your friends.");
    } finally {
      harness.restoreWindow();
    }
  });

  it("routes friend removal failure through the action confirmation overlay", async () => {
    vi.mocked(deleteFriendship).mockResolvedValue({ ok: false, message: "Could not remove friend." });

    const harness = makeRemoveFriendHarness();
    try {
      await flushRemoveFriendAction();

      expect(harness.showActionConfirmation).toHaveBeenCalledWith("Could not remove friend.");
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
    const setActiveFriendProfileName = vi.fn();
    const setActiveFriendProfileUid = vi.fn();
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
      setActiveFriendProfileName,
      setActiveFriendProfileUid,
      hasEntitlement: () => true,
      getGroupsIncomingRequests: () => [],
      getGroupsOutgoingRequests: () => [],
      getGroupsLoading: () => false,
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getOwnSharedSummaries: () => [],
      getFriendProfileCacheByUid: () => ({}),
      getCurrentPlan: () => "pro",
    };

    const api = createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext);
    api.openFriendProfileModal("friend-b");

    return { api, emailEl, memberSinceEl, modal, nameEl, setActiveFriendProfileName, setActiveFriendProfileUid };
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

  it("zooms Friend Info out before hiding and clearing active friend state", () => {
    const originalWindow = globalThis.window;
    const closeTimers: Array<() => void> = [];
    globalThis.window = {
      setTimeout: vi.fn((handler: () => void) => {
        closeTimers.push(handler);
        return 1;
      }),
      clearTimeout: vi.fn(),
      requestAnimationFrame: vi.fn((handler: FrameRequestCallback) => {
        handler(0);
        return 1;
      }),
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window & typeof globalThis;

    const harness = makeFriendInfoHarness({});
    try {
      harness.api.closeFriendProfileModal();

      expect(harness.modal.classList.add).toHaveBeenCalledWith("isFriendProfileZoomingOut");
      expect(harness.modal.style.display).toBe("flex");
      expect(harness.setActiveFriendProfileUid).not.toHaveBeenCalledWith(null);

      const runCloseTimer = closeTimers[0];
      expect(runCloseTimer).toBeTruthy();
      runCloseTimer?.();

      expect(harness.modal.style.display).toBe("none");
      expect(harness.setActiveFriendProfileUid).toHaveBeenCalledWith(null);
      expect(harness.setActiveFriendProfileName).toHaveBeenCalledWith("");
    } finally {
      globalThis.window = originalWindow;
    }
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
