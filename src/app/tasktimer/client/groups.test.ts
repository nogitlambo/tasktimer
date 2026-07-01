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
  renderSharedTaskWeeklyChart,
} from "./groups";
import type { TaskTimerGroupsContext } from "./context";
import type { FriendProfile, FriendRequest, Friendship, SharedTaskImportConfig, SharedTaskSummary } from "../lib/friendsStore";
import type { Task } from "../lib/types";

vi.mock("../lib/friendsStore", () => ({
  approveFriendRequest: vi.fn(),
  buildSharedTaskImportConfig: vi.fn(() => null),
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
  function makeElement(id = "") {
    return {
      id,
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
      importConfig: null,
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

  function makeImportConfig(overrides: Partial<SharedTaskImportConfig> = {}): SharedTaskImportConfig {
    return {
      name: "Deep Work",
      color: null,
      taskType: "recurring",
      onceOffDay: null,
      plannedStartTime: "09:00",
      plannedStartByDay: { mon: "09:00" },
      plannedStartOpenEnded: false,
      plannedStartPushRemindersEnabled: true,
      splitAcrossProductivityDays: true,
      timeGoalEnabled: true,
      timeGoalValue: 1,
      timeGoalUnit: "hour",
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: true,
      checkpointToastMode: "auto5s",
      timeGoalAction: "confirmModal",
      finalCheckpointAction: "confirmModal",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
      presetIntervalLastMilestoneId: null,
      presetIntervalNextSeq: 1,
      ...overrides,
    };
  }

  function renderFriendsList(
    sharedSummaries: SharedTaskSummary[],
    opts: {
      currentUid?: string;
      friendships?: Friendship[];
      incomingRequests?: Array<Partial<FriendRequest>>;
      outgoingRequests?: Array<Partial<FriendRequest>>;
      ownSharedSummaries?: SharedTaskSummary[];
      tasks?: Partial<Task>[];
    } = {}
  ) {
    const groupsFriendsList = makeElement();
    const groupsFriendsTitle = makeElement();
    const groupsIncomingRequestsTitle = makeElement();
    const groupsOutgoingRequestsTitle = makeElement();
    const groupsSharedByYouTitle = makeElement();
    const friendships = opts.friendships ?? [makeFriendship("friend-b", "Friend Bee")];
    const incomingRequests = opts.incomingRequests ?? [];
    const outgoingRequests = opts.outgoingRequests ?? [];
    const ownSharedSummaries = opts.ownSharedSummaries ?? [];

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
        groupsIncomingRequestsTitle,
        groupsOutgoingRequestsDetails: makeElement(),
        groupsOutgoingRequestsList: makeElement(),
        groupsOutgoingRequestsTitle,
        groupsSharedByYouList: makeElement(),
        groupsSharedByYouTitle,
        openFriendRequestModalBtn: null,
      },
      on: vi.fn(),
      getCurrentUid: () => opts.currentUid ?? "user-a",
      getGroupsLoading: () => false,
      getGroupsIncomingRequests: () => incomingRequests,
      getGroupsOutgoingRequests: () => outgoingRequests,
      getGroupsFriendships: () => friendships,
      getGroupsSharedSummaries: () => sharedSummaries,
      getOwnSharedSummaries: () => ownSharedSummaries,
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getFriendProfileCacheByUid: () => ({}),
      getFriendAvatarSrcById: vi.fn(() => "/incoming-avatar.webp"),
      buildFriendInitialAvatarDataUrl: vi.fn(() => "/outgoing-avatar.webp"),
      getTasks: () => opts.tasks ?? [{ id: "task-1", color: null }],
      getWeekStarting: () => "mon",
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
    return {
      html: groupsFriendsList.innerHTML,
      title: groupsFriendsTitle.textContent,
      incomingTitle: groupsIncomingRequestsTitle.textContent,
      outgoingTitle: groupsOutgoingRequestsTitle.textContent,
      sharedByYouTitle: groupsSharedByYouTitle.textContent,
    };
  }

  function setupGroupsEvents(
    sharedSummaries: SharedTaskSummary[],
    opts: { tasks?: Partial<Task>[]; mergedFriendProfile?: FriendProfile | null } = {}
  ) {
    const handlers = new Map<string, (event: unknown) => void>();
    const groupsFriendsList = makeElement("groupsFriendsList");
    const sharedTaskSummaryModal = makeElement("sharedTaskSummaryModal");
    sharedTaskSummaryModal.style.display = "none";
    const sharedTaskSummaryTitle = makeElement("sharedTaskSummaryTitle");
    const sharedTaskSummaryBody = makeElement("sharedTaskSummaryBody");
    const sharedTaskSummaryCloseBtn = makeElement("sharedTaskSummaryCloseBtn");
    const tasks: Partial<Task>[] = opts.tasks ?? [{ id: "task-1", color: null }];
    const ctx = {
      els: {
        commandCenterGroupsAlertBadge: null,
        footerTest2AlertBadge: null,
        friendProfileCloseBtn: null,
        friendProfileDeleteBtn: null,
        friendProfileModal: null,
        friendRequestCancelBtn: null,
        friendRequestEmailInput: null,
        friendRequestModal: null,
        friendRequestSendBtn: null,
        groupsFriendsList,
        groupsIncomingRequestsList: null,
        groupsOutgoingRequestsList: null,
        groupsSharedByYouList: null,
        openFriendRequestModalBtn: null,
        shareTaskCancelBtn: null,
        shareTaskConfirmBtn: null,
        shareTaskModal: null,
        shareTaskScopeSelect: null,
        sharedTaskSummaryBody,
        sharedTaskSummaryCloseBtn,
        sharedTaskSummaryModal,
        sharedTaskSummaryTitle,
      },
      on: (el: { id?: string } | null, event: string, handler: (event: unknown) => void) => {
        if (!el?.id) return;
        handlers.set(`${el.id}:${event}`, handler);
      },
      sharedTasks: {
        createId: () => "new-id",
        makeTask: (name: string, order: number) => ({
          id: "new-task",
          name,
          order,
          accumulatedMs: 0,
          running: false,
          startMs: null,
          collapsed: false,
          milestonesEnabled: false,
          milestones: [],
          hasStarted: false,
        }),
        ensureMilestoneIdentity: vi.fn(),
      },
      getCurrentUid: () => "user-a",
      getGroupsLoading: () => false,
      getGroupsIncomingRequests: () => [],
      getGroupsOutgoingRequests: () => [],
      getGroupsFriendships: () => [makeFriendship("friend-b", "Friend Bee")],
      getGroupsSharedSummaries: () => sharedSummaries,
      getOwnSharedSummaries: () => [],
      getOpenFriendSharedTaskUids: () => new Set<string>(),
      getFriendProfileCacheByUid: () => ({}),
      getTasks: () => tasks,
      setTasks: (value: Partial<Task>[]) => {
        tasks.splice(0, tasks.length, ...value);
      },
      getWeekStarting: () => "mon",
      getOptimalProductivityDays: () => ["mon"],
      getOptimalProductivityStartTime: () => "09:00",
      getOptimalProductivityEndTime: () => "17:00",
      getCurrentPlan: () => "pro",
      hasEntitlement: () => true,
      getMergedFriendProfile: (_friendUid: string, baseProfile?: FriendProfile | null) =>
        opts.mergedFriendProfile !== undefined ? (opts.mergedFriendProfile as FriendProfile) : baseProfile || ({ alias: "Friend Bee" } as FriendProfile),
      getFriendAvatarSrc: vi.fn(() => "/friend-row-avatar.webp"),
      getFriendAvatarSrcById: vi.fn(() => "/incoming-avatar.webp"),
      buildFriendInitialAvatarDataUrl: vi.fn(() => "/outgoing-avatar.webp"),
      escapeHtmlUI: (value: unknown) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;"),
      render: vi.fn(),
      save: vi.fn(),
      showActionConfirmation: vi.fn(),
      jumpToTaskAndHighlight: vi.fn(),
      jumpToTaskById: vi.fn(),
      applyAppPage: vi.fn(),
      applyMainMode: vi.fn(),
      closeConfirm: vi.fn(),
      confirm: vi.fn(),
      getDynamicColorsEnabled: () => true,
      fillBackgroundForPct: () => "",
      normalizeHistoryTimestampMs: (value: unknown) => Number(value) || 0,
      showWorkingIndicator: () => 1,
      hideWorkingIndicator: vi.fn(),
      setGroupsIncomingRequests: vi.fn(),
      setGroupsOutgoingRequests: vi.fn(),
      setGroupsFriendships: vi.fn(),
      setGroupsSharedSummaries: vi.fn(),
      setOwnSharedSummaries: vi.fn(),
      getGroupsRefreshSeq: () => 0,
      setGroupsRefreshSeq: vi.fn(),
      setGroupsLoading: vi.fn(),
      getGroupsLoadingDepth: () => 0,
      setGroupsLoadingDepth: vi.fn(),
      getActiveFriendProfileUid: () => null,
      setActiveFriendProfileUid: vi.fn(),
      getActiveFriendProfileName: () => "",
      setActiveFriendProfileName: vi.fn(),
      setFriendProfileCacheByUid: vi.fn(),
      getFriendEmailByUid: () => ({}),
      setFriendEmailByUid: vi.fn(),
      getShareTaskIndex: () => null,
      setShareTaskIndex: vi.fn(),
      getShareTaskMode: () => "share",
      setShareTaskMode: vi.fn(),
      getShareTaskTaskId: () => null,
      setShareTaskTaskId: vi.fn(),
      showUpgradePrompt: vi.fn(),
    };
    createTaskTimerGroups(ctx as unknown as TaskTimerGroupsContext).registerGroupsEvents();
    return { handlers, sharedTaskSummaryModal, sharedTaskSummaryTitle, sharedTaskSummaryBody, sharedTaskSummaryCloseBtn, ctx };
  }

  it("renders the shared count meta when a friend has zero shared tasks", () => {
    const { html } = renderFriendsList([]);

    expect(html).toContain('class="friendIdentityMeta"');
    expect(html).toContain("Sharing 0 tasks");
    expect(html).toContain("No tasks shared with you.");
  });

  it("keeps the shared count meta when a friend has shared tasks", () => {
    const { html } = renderFriendsList([makeSharedSummary()]);

    expect(html).toContain('class="friendIdentityMeta"');
    expect(html).toContain("Sharing 1 tasks");
    expect(html).not.toContain("No tasks shared with you.");
  });

  it("renders shared task cards as keyboard-openable summary buttons", () => {
    const { html } = renderFriendsList([makeSharedSummary()]);

    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-shared-task-summary-id="share-1"');
    expect(html).toContain("Open shared task summary for Deep Work");
  });

  it("hides Import this task for legacy shared task records without import config", () => {
    const { html } = renderFriendsList([makeSharedSummary({ importConfig: null })]);

    expect(html).not.toContain("Import this task");
    expect(html).not.toContain('data-friend-action="import-shared-task"');
  });

  it("renders Import this task for importable shared task records", () => {
    const { html } = renderFriendsList([
      makeSharedSummary({
        importConfig: makeImportConfig(),
      }),
    ]);

    expect(html).toContain("Import this task");
    expect(html).toContain('class="btn btn-accent small"');
    expect(html).toContain('data-friend-action="import-shared-task"');
    expect(html).toContain('data-share-doc-id="share-1"');
  });

  it("disables the import button when the shared source has already been added", () => {
    const { html } = renderFriendsList([
      makeSharedSummary({
        importConfig: makeImportConfig(),
      }),
    ], {
      tasks: [{ id: "local-copy", color: null, sharedSourceOwnerUid: "friend-b", sharedSourceTaskId: "task-1" }],
    });

    expect(html).toContain("Added");
    expect(html).toContain('disabled aria-disabled="true"');
  });

  it("opens and populates the shared task summary modal from a card click", () => {
    const { handlers, sharedTaskSummaryModal, sharedTaskSummaryTitle, sharedTaskSummaryBody } = setupGroupsEvents([
      makeSharedSummary({ importConfig: makeImportConfig(), dailyGoalMs: 60 * 60_000, todayLoggedMs: 30 * 60_000 }),
    ]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === '[data-friend-action="import-shared-task"]' ? null : selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryModal.style.display).toBe("flex");
    expect(sharedTaskSummaryTitle.textContent).toBe("Shared Task Summary");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Owner:");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Friend Bee");
    expect(sharedTaskSummaryBody.innerHTML.indexOf("Owner:")).toBeLessThan(sharedTaskSummaryBody.innerHTML.indexOf("Status:"));
    expect(sharedTaskSummaryBody.innerHTML).toContain("Status:");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Goal:");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Today:");
    expect(sharedTaskSummaryBody.innerHTML).toContain("This Week:");
    expect(sharedTaskSummaryBody.innerHTML).toContain("friendSharedTaskChart");
    expect(sharedTaskSummaryBody.innerHTML).toContain("sharedTaskImportPrompt");
    expect(sharedTaskSummaryBody.innerHTML).toContain(
      "Import this task to your list, and TaskLaunch will automatically schedule it into an available time slot based on your optimal productivity preferences."
    );
    expect(sharedTaskSummaryBody.innerHTML).toContain("Import this task");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Task Settings");
    expect(sharedTaskSummaryBody.innerHTML.indexOf("sharedTaskSettingsMilestoneGroup")).toBeLessThan(
      sharedTaskSummaryBody.innerHTML.indexOf("sharedTaskImportPrompt")
    );
    expect(sharedTaskSummaryBody.innerHTML).toContain("Task type");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Recurring");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Planned start");
    expect(sharedTaskSummaryBody.innerHTML).toContain("09:00");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Time goal");
    expect(sharedTaskSummaryBody.innerHTML).toContain("1 hour per day");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Checkpoint alerts");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Off");
    expect(sharedTaskSummaryBody.innerHTML.indexOf("Task type")).toBeLessThan(sharedTaskSummaryBody.innerHTML.indexOf("Time goal"));
    expect(sharedTaskSummaryBody.innerHTML.indexOf("Time goal")).toBeLessThan(sharedTaskSummaryBody.innerHTML.indexOf("Planned start"));
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Planned days");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Schedule");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Open-ended start");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Push reminders");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Time goal duration");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Checkpoint sound");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Preset intervals");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Final checkpoint action");
  });

  it("opens the shared task summary modal from Enter or Space on a focused card", () => {
    const { handlers, sharedTaskSummaryModal } = setupGroupsEvents([makeSharedSummary()]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:keydown")?.({ key: "Enter", target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryModal.style.display).toBe("flex");
  });

  it("does not render the Owner row on compact shared task cards", () => {
    const { html } = renderFriendsList([makeSharedSummary({ importConfig: makeImportConfig() })]);

    expect(html).not.toContain("Owner:");
  });

  it("falls back to owner uid when the shared task owner has no alias", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents([makeSharedSummary({ ownerUid: "owner-without-alias" })], {
      mergedFriendProfile: { alias: "" } as FriendProfile,
    });
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).toContain("Owner:");
    expect(sharedTaskSummaryBody.innerHTML).toContain("owner-without-alias");
  });

  it("does not open the summary modal when clicking Import this task", () => {
    const { handlers, sharedTaskSummaryModal, ctx } = setupGroupsEvents([makeSharedSummary({ importConfig: makeImportConfig() })]);
    const importBtn = {
      disabled: false,
      getAttribute: (name: string) => (name === "data-share-doc-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === '[data-friend-action="import-shared-task"]' ? importBtn : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryModal.style.display).toBe("none");
    expect(ctx.jumpToTaskAndHighlight).toHaveBeenCalledWith("new-task");
  });

  it("closes the shared task summary modal from close button and backdrop", () => {
    const { handlers, sharedTaskSummaryModal, sharedTaskSummaryCloseBtn } = setupGroupsEvents([makeSharedSummary()]);
    sharedTaskSummaryModal.style.display = "flex";

    handlers.get("sharedTaskSummaryCloseBtn:click")?.({ preventDefault: vi.fn() });
    expect(sharedTaskSummaryModal.style.display).toBe("none");

    sharedTaskSummaryModal.style.display = "flex";
    handlers.get("sharedTaskSummaryModal:click")?.({ target: sharedTaskSummaryModal });
    expect(sharedTaskSummaryModal.style.display).toBe("none");
    expect(sharedTaskSummaryCloseBtn.id).toBe("sharedTaskSummaryCloseBtn");
  });

  it("omits import action from the modal for legacy non-importable summaries", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents([makeSharedSummary({ importConfig: null })]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Import this task");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain('data-friend-action="import-shared-task"');
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Task Settings");
  });

  it("renders once-off shared task settings from the original import snapshot", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents([
      makeSharedSummary({
        importConfig: makeImportConfig({
          taskType: "once-off",
          onceOffDay: "fri",
          plannedStartTime: "14:30",
          plannedStartByDay: { fri: "14:30" },
          splitAcrossProductivityDays: null,
          timeGoalPeriod: "day",
          plannedStartPushRemindersEnabled: false,
        }),
      }),
    ]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).toContain("Once-off");
    expect(sharedTaskSummaryBody.innerHTML).toContain("14:30");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Once-off day");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Friday 14:30");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Push reminders");
  });

  it("renders disabled shared task settings as Off or None", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents([
      makeSharedSummary({
        importConfig: makeImportConfig({
          plannedStartTime: null,
          plannedStartByDay: null,
          plannedStartOpenEnded: true,
          splitAcrossProductivityDays: false,
          timeGoalEnabled: false,
          timeGoalValue: 0,
          timeGoalMinutes: 0,
          milestonesEnabled: false,
          milestones: [],
          checkpointSoundEnabled: false,
          checkpointToastEnabled: false,
          presetIntervalsEnabled: false,
        }),
      }),
    ]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).toContain("Planned start");
    expect(sharedTaskSummaryBody.innerHTML).toContain("None");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Time goal");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Off");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Checkpoint alerts");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Open-ended start");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Checkpoint sound mode");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Preset intervals");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("sharedTaskCheckpointTimelineMarker");
  });

  it("renders shared task checkpoints on a proportional timeline without raw internal fields", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents([
      makeSharedSummary({
        importConfig: makeImportConfig({
          timeGoalPeriod: "week",
          timeGoalValue: 3,
          timeGoalUnit: "hour",
          timeGoalMinutes: 180,
          milestonesEnabled: true,
          milestoneTimeUnit: "minute",
          milestones: [
            { id: "raw-ms-1", createdSeq: 77, hours: 0.5, description: "Halfway", alertsEnabled: true },
            { id: "raw-ms-2", createdSeq: 78, hours: 1, description: "Finish", alertsEnabled: false },
          ],
          checkpointSoundEnabled: true,
          checkpointSoundMode: "repeat",
          checkpointToastEnabled: true,
          checkpointToastMode: "manual",
          presetIntervalsEnabled: true,
          presetIntervalValue: 2,
          presetIntervalLastMilestoneId: "raw-ms-1",
          presetIntervalNextSeq: 99,
          timeGoalAction: "resetLog",
          finalCheckpointAction: "continue",
        }),
      }),
    ]);
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).toContain("3 hours per week");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Checkpoint alerts");
    expect(sharedTaskSummaryBody.innerHTML).toContain("On");
    expect(sharedTaskSummaryBody.innerHTML).toContain("sharedTaskCheckpointTimeline");
    expect(sharedTaskSummaryBody.innerHTML).toContain('style="--checkpoint-left:17%"');
    expect(sharedTaskSummaryBody.innerHTML).toContain('style="--checkpoint-left:33%"');
    expect(sharedTaskSummaryBody.innerHTML).toContain("Halfway");
    expect(sharedTaskSummaryBody.innerHTML).toContain("30m");
    expect(sharedTaskSummaryBody.innerHTML).toContain("30m Halfway | Alerts on");
    expect(sharedTaskSummaryBody.innerHTML).toContain("Finish");
    expect(sharedTaskSummaryBody.innerHTML).toContain("60m");
    expect(sharedTaskSummaryBody.innerHTML).toContain("60m Finish | Alerts off");
    expect(sharedTaskSummaryBody.innerHTML).toContain('<span class="sharedTaskCheckpointTimelineLabel">30m</span>');
    expect(sharedTaskSummaryBody.innerHTML).toContain('<span class="sharedTaskCheckpointTimelineLabel">60m</span>');
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("<strong>30m</strong>Halfway");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("<strong>60m</strong>Finish");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Repeat");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Manual close");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("2 intervals");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Reset and log time");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("Continue timer");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("raw-ms-1");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("createdSeq");
    expect(sharedTaskSummaryBody.innerHTML).not.toContain("99");
  });

  it("renders Added disabled in the modal for already imported summaries", () => {
    const { handlers, sharedTaskSummaryBody } = setupGroupsEvents(
      [makeSharedSummary({ importConfig: makeImportConfig() })],
      { tasks: [{ id: "local-copy", color: null, sharedSourceOwnerUid: "friend-b", sharedSourceTaskId: "task-1" }] }
    );
    const card = {
      getAttribute: (name: string) => (name === "data-shared-task-summary-id" ? "share-1" : null),
    };
    const target = {
      closest: (selector: string) => (selector === "[data-shared-task-summary-id]" ? card : null),
    };

    handlers.get("groupsFriendsList:click")?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

    expect(sharedTaskSummaryBody.innerHTML).toContain("Added");
    expect(sharedTaskSummaryBody.innerHTML).toContain('disabled aria-disabled="true"');
  });

  it("renders the friends title count for zero friends", () => {
    const { title } = renderFriendsList([], { friendships: [] });

    expect(title).toBe("Friends | 0");
  });

  it("renders the friends title count for accepted friendships", () => {
    const { title } = renderFriendsList([], {
      friendships: [makeFriendship("friend-b", "Friend Bee"), makeFriendship("friend-c", "Friend Cee")],
    });

    expect(title).toBe("Friends | 2");
  });

  it("renders zero friends in the title when signed out", () => {
    const { title } = renderFriendsList([], {
      currentUid: "",
      friendships: [makeFriendship("friend-b", "Friend Bee"), makeFriendship("friend-c", "Friend Cee")],
    });

    expect(title).toBe("Friends | 0");
  });

  it("renders request title counts with pipe separators", () => {
    const { incomingTitle, outgoingTitle } = renderFriendsList([], {
      incomingRequests: [{ requestId: "incoming-1", senderUid: "friend-b", senderEmail: "bee@example.com", status: "pending" }],
      outgoingRequests: [
        { requestId: "outgoing-1", receiverUid: "friend-c", receiverEmail: "cee@example.com", status: "pending" },
        { requestId: "outgoing-2", receiverUid: "friend-d", receiverEmail: "dee@example.com", status: "pending" },
      ],
    });

    expect(incomingTitle).toBe("Incoming requests | 1");
    expect(outgoingTitle).toBe("Outgoing requests | 2");
  });

  it("renders shared-by-you title count with a pipe separator", () => {
    const { sharedByYouTitle } = renderFriendsList([], {
      ownSharedSummaries: [makeSharedSummary({ ownerUid: "user-a", friendUid: "friend-b" })],
    });

    expect(sharedByYouTitle).toBe("Shared by you | 1");
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

  it("formats daily and weekly goals with explicit periods and logged time rows without Created", () => {
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
      },
      escapeHtmlUI
    );

    expect(html).not.toContain("Goal:");
    const text = html.replace(/<[^>]+>/g, "");
    expect(text).toContain("Today: 30m");
    expect(text).toContain("This Week: 02h");
    expect(html).not.toContain("Daily avg:");
    expect(html).not.toContain("Total logged:");
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

  it("caps weekly progress helper at 100% and shows no-goal fallback with logged week time", () => {
    expect(formatSharedTaskWeekPercent({ weekLoggedMs: 150, weekGoalMs: 100 })).toBe("100%");
    expect(formatSharedTaskWeekPercent({ weekLoggedMs: 50, weekGoalMs: null })).toBe("No goal");

    const html = renderSharedTaskMetricRows(
      {
        dailyGoalMs: null,
        todayLoggedMs: 0,
        weekLoggedMs: 0,
        weekGoalMs: null,
      },
      escapeHtmlUI
    );

    expect(html).not.toContain("Goal:");
    expect(html.replace(/<[^>]+>/g, "")).toContain("This Week: 00s");
  });

  it("renders a weekly chart with seven rotated bars for the configured week start", () => {
    const html = renderSharedTaskWeeklyChart(
      {
        focusTrend7dMs: [10 * 60_000, 20 * 60_000, 30 * 60_000, 40 * 60_000, 50 * 60_000, 60 * 60_000, 90 * 60_000],
      },
      "mon",
      escapeHtmlUI
    );

    expect(html.match(/friendSharedTaskChartBarSlot/g)).toHaveLength(7);
    expect(html).toContain("<span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>");
    expect(html).toContain('aria-label="Mon: 20m"');
    expect(html).toContain('aria-label="Sat: 01h 30m"');
    expect(html).toContain('aria-label="Sun: 10m"');
  });

  it("renders goal-scale y-axis labels at quarter increments for a 20-minute goal", () => {
    const html = renderSharedTaskWeeklyChart(
      {
        dailyGoalMs: 20 * 60_000,
        focusTrend7dMs: [5 * 60_000, 10 * 60_000, 15 * 60_000, 20 * 60_000, 30 * 60_000, 0, 0],
      },
      "sun",
      escapeHtmlUI
    );

    expect(html).toContain('class="friendSharedTaskChart isGoalScale"');
    expect(html).toContain("Goal scale 0 to 20m.");
    expect(html).toContain("<span>20m</span><span>15m</span><span>10m</span><span>5m</span>");
    expect(html).toContain("--friend-shared-task-chart-bar: 25%");
    expect(html).toContain("--friend-shared-task-chart-bar: 50%");
    expect(html).toContain("--friend-shared-task-chart-bar: 75%");
    expect(html).toContain("--friend-shared-task-chart-bar: 100%");
  });

  it("renders goal-scale y-axis labels at quarter increments for a 1-hour goal", () => {
    const html = renderSharedTaskWeeklyChart(
      {
        dailyGoalMs: 60 * 60_000,
        focusTrend7dMs: [15 * 60_000, 30 * 60_000, 45 * 60_000, 60 * 60_000],
      },
      "sun",
      escapeHtmlUI
    );

    expect(html).toContain("Goal scale 0 to 1h.");
    expect(html).toContain("<span>1h</span><span>45m</span><span>30m</span><span>15m</span>");
  });

  it("caps goal-scale over-goal bars while preserving actual logged duration labels", () => {
    const html = renderSharedTaskWeeklyChart(
      {
        dailyGoalMs: 20 * 60_000,
        focusTrend7dMs: [45 * 60_000],
      },
      "sun",
      escapeHtmlUI
    );

    expect(html).toContain('aria-label="Sun: 45m"');
    expect(html).toContain('title="Sun: 45m"');
    expect(html).toContain("--friend-shared-task-chart-bar: 100%");
  });

  it("renders a stable empty weekly chart when trend data is missing", () => {
    const html = renderSharedTaskWeeklyChart({}, "sun", escapeHtmlUI);

    expect(html.match(/friendSharedTaskChartBarSlot/g)).toHaveLength(7);
    expect(html).not.toContain("isGoalScale");
    expect(html).toContain("Scale 0 to 01h.");
    expect(html).toContain('aria-label="Sun: 00s"');
  });

  it("formats the weekly chart y-axis max as a rounded compact duration", () => {
    const html = renderSharedTaskWeeklyChart(
      {
        focusTrend7dMs: [0, 0, 0, 0, 0, 0, 95 * 60_000],
      },
      "sat",
      escapeHtmlUI
    );

    expect(html).toContain("Scale 0 to 02h.");
    expect(html).toContain("<span>02h</span>");
  });
});
