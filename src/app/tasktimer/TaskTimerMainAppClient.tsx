"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import AddTaskOverlay from "./components/AddTaskOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import FriendsOverlays from "./components/FriendsOverlays";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import DashboardPageContent from "./components/DashboardPageContent";
import HistoryManagerScreen from "./components/HistoryManagerScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import SchedulePageContent from "./components/SchedulePageContent";
import TaskManualEntryOverlay from "./components/TaskManualEntryOverlay";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import type { AppPage } from "./client/types";
import { ACCOUNT_AVATAR_UPDATED_EVENT } from "./lib/accountProfileStorage";
import { formatDashboardDurationShort } from "./lib/historyChart";
import {
  LEADERBOARD_PROFILE_UPDATED_EVENT,
  buildLeaderboardMetricsSnapshot,
  getLeaderboardAvatarSrc,
  getLeaderboardInitials,
  loadLeaderboardScreenData,
  saveLeaderboardProfile,
  type LeaderboardProfile,
  type LeaderboardScreenData,
} from "./lib/leaderboard";
import { buildRewardsHeaderViewModel, DEFAULT_REWARD_PROGRESS, getRankLabelById, normalizeRewardProgress } from "./lib/rewards";
import { createTaskTimerWorkspaceRepository } from "./lib/workspaceRepository";
import { initTaskTimerClient } from "./tasktimerClient";
import { bootstrapFirebaseWebAppCheck } from "@/lib/firebaseClient";
import "./tasktimer.css";

type TaskTimerMainAppClientProps = {
  initialPage: AppPage;
};

const workspaceRepository = createTaskTimerWorkspaceRepository();

const EMPTY_LEADERBOARD_SCREEN_DATA: LeaderboardScreenData = {
  topEntries: [],
  risingEntries: [],
  rivalEntries: [],
  currentUserEntry: null,
  currentUserRank: null,
  currentUserGapToNextXp: null,
};

type LeaderboardLoadState = "loading" | "ready" | "signedOut" | "error";

function formatLeaderboardXp(xpRaw: number): string {
  return `${new Intl.NumberFormat().format(Math.max(0, Math.floor(xpRaw || 0)))} XP`;
}

function formatLeaderboardTrend(xpRaw: number): string {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  return xp > 0 ? `+${new Intl.NumberFormat().format(xp)} XP` : "No gain yet";
}

function formatLeaderboardStreak(daysRaw: number): string {
  const days = Math.max(0, Math.floor(daysRaw || 0));
  return days === 1 ? "1 day streak" : `${days} day streak`;
}

function formatLeaderboardMemberSince(memberSinceMs: number | null | undefined): string {
  if (!memberSinceMs || !Number.isFinite(memberSinceMs) || memberSinceMs <= 0) return "";
  return new Date(memberSinceMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getLeaderboardLabel(profile: LeaderboardProfile): string {
  return String(profile.username || profile.displayLabel || "User").trim() || "User";
}

function getLeaderboardRankLabel(profile: LeaderboardProfile): string {
  return getRankLabelById(String(profile.rewardCurrentRankId || ""));
}

function getLeaderboardAvatarRenderSrc(profile: LeaderboardProfile): string {
  const avatarSrc = getLeaderboardAvatarSrc(profile);
  if (!avatarSrc) return "";
  if (/^(?:data:|blob:)/i.test(avatarSrc)) return avatarSrc;
  if (/^\/(?:tasklaunch\/)?avatars\//i.test(avatarSrc)) return avatarSrc;
  const versionSeed = [
    profile.uid,
    String(profile.avatarId || "").trim(),
    String(profile.avatarCustomSrc || "").trim(),
    String(profile.googlePhotoUrl || "").trim(),
  ].join("|");
  const version = encodeURIComponent(versionSeed);
  return avatarSrc.includes("?") ? `${avatarSrc}&lbav=${version}` : `${avatarSrc}?lbav=${version}`;
}

function LeaderboardAvatar({ profile, small = false }: { profile: LeaderboardProfile; small?: boolean }) {
  const avatarSrc = getLeaderboardAvatarRenderSrc(profile);
  const initials = getLeaderboardInitials(getLeaderboardLabel(profile));
  return (
    <div className={`leaderboardAvatar${small ? " leaderboardAvatarSmall" : ""}`} aria-hidden="true">
      {avatarSrc ? (
        <AppImg className="leaderboardAvatarImg" src={avatarSrc} alt="" referrerPolicy={/^https?:\/\//i.test(avatarSrc) ? "no-referrer" : undefined} />
      ) : (
        initials
      )}
    </div>
  );
}

export default function TaskTimerMainAppClient({ initialPage }: TaskTimerMainAppClientProps) {
  const searchParams = useSearchParams();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [dismissedHighlightParam, setDismissedHighlightParam] = useState<string | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardLoadState>(() =>
    getFirebaseAuthClient() ? "loading" : "error"
  );
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardScreenData>(EMPTY_LEADERBOARD_SCREEN_DATA);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(() =>
    getFirebaseAuthClient() ? null : "Leaderboard is unavailable in this session."
  );
  const [selectedLeaderboardProfile, setSelectedLeaderboardProfile] = useState<LeaderboardProfile | null>(null);
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const highlightParam = searchParams.get("highlight");
  const isHighlighting = !!highlightParam && highlightParam !== dismissedHighlightParam;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 980px)");
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    void bootstrapFirebaseWebAppCheck();
    const { destroy } = initTaskTimerClient(initialPage);
    return () => {
      destroy();
    };
  }, [initialPage]);

  useEffect(() => {
    const unsubscribe = workspaceRepository.subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isHighlighting && highlightParam === "addTask") {
      const appElement = document.getElementById("app");
      if (appElement) {
        appElement.classList.add("hasHighlight");
      }

      const addTaskBtn = document.getElementById("openAddTaskBtn");
      if (addTaskBtn) {
        addTaskBtn.classList.add("highlighted");
      }

      const handleClickOutside = () => {
        setDismissedHighlightParam(highlightParam);
      };

      addTaskBtn?.addEventListener("click", handleClickOutside);

      return () => {
        addTaskBtn?.removeEventListener("click", handleClickOutside);
        appElement?.classList.remove("hasHighlight");
        addTaskBtn?.classList.remove("highlighted");
      };
    }
  }, [isHighlighting, highlightParam]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;

    let cancelled = false;
    let activeUid = String(auth.currentUser?.uid || "").trim();

    const loadForUid = async (uid: string) => {
      setLeaderboardState("loading");
      setLeaderboardError(null);
      try {
        const cachedPreferences = workspaceRepository.loadCachedPreferences();
        await saveLeaderboardProfile(
          uid,
          buildLeaderboardMetricsSnapshot({
            historyByTaskId: workspaceRepository.loadHistory(),
            liveSessionsByTaskId: workspaceRepository.loadLiveSessions(),
            rewards: cachedPreferences?.rewards || DEFAULT_REWARD_PROGRESS,
          })
        ).catch(() => {});
        const nextData = await loadLeaderboardScreenData(uid);
        if (cancelled || activeUid !== uid) return;
        setLeaderboardData(nextData);
        setLeaderboardState("ready");
      } catch {
        if (cancelled || activeUid !== uid) return;
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardState("error");
        setLeaderboardError("Could not load leaderboard data.");
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      activeUid = String(user?.uid || "").trim();
      if (!activeUid) {
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardState("signedOut");
        setLeaderboardError(null);
        return;
      }
      void loadForUid(activeUid);
    });

    const handleProfileUpdated = (event: Event) => {
      if (!activeUid) return;
      const detailUid = String((event as CustomEvent<{ uid?: string }>).detail?.uid || "").trim();
      if (detailUid && detailUid !== activeUid) return;
      void loadForUid(activeUid);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(LEADERBOARD_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
      window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, handleProfileUpdated as EventListener);
    }

    if (activeUid) {
      void loadForUid(activeUid);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener(LEADERBOARD_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
        window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, handleProfileUpdated as EventListener);
      }
    };
  }, []);

  const selectedLeaderboardLabel = selectedLeaderboardProfile ? getLeaderboardLabel(selectedLeaderboardProfile) : "";
  const selectedLeaderboardRank =
    selectedLeaderboardProfile && leaderboardData.currentUserEntry?.uid === selectedLeaderboardProfile.uid
      ? leaderboardData.currentUserRank
      : selectedLeaderboardProfile
        ? leaderboardData.topEntries.findIndex((entry) => entry.uid === selectedLeaderboardProfile.uid) + 1
        : null;
  const selectedLeaderboardRankLabel =
    selectedLeaderboardRank && selectedLeaderboardRank > 0 ? `#${selectedLeaderboardRank}` : "--";
  const selectedLeaderboardMemberSince = selectedLeaderboardProfile
    ? formatLeaderboardMemberSince(selectedLeaderboardProfile.memberSinceMs)
    : "";
  const currentUserAvatarSrc = leaderboardData.currentUserEntry ? getLeaderboardAvatarRenderSrc(leaderboardData.currentUserEntry) : "";
  const currentUserAvatarInitials = leaderboardData.currentUserEntry ? getLeaderboardInitials(getLeaderboardLabel(leaderboardData.currentUserEntry)) : "U";

  const closeLeaderboardPositionModal = () => {
    setSelectedLeaderboardProfile(null);
  };

  const mobileToolbar: ReactNode = useMemo(() => {
    if (!isMobileViewport) return null;
    if (initialPage === "tasks" || initialPage === "schedule") {
      return (
        <div className="taskLaunchMobileToolbarInner taskLaunchMobileToolbarTasks" aria-label="Tasks controls">
          <div className="taskPageHeaderActions">
            <div className="taskScreenPillGroup" role="tablist" aria-label="Tasks and schedule view switch">
              <button className="iconBtn taskScreenPill taskScreenHeaderBtn isOn" id="closeScheduleBtn" data-screen-pill="tasks" aria-current="page" aria-label="Tasks" title="Tasks" role="tab" type="button">
                <AppImg className="taskScreenIconBtnImage" src="/Task_List.svg" alt="" aria-hidden="true" />
                <span className="taskScreenTabLabel">Tasks</span>
              </button>
              <button className="iconBtn taskScreenPill taskScreenHeaderBtn" id="openScheduleBtn" data-screen-pill="schedule" aria-label="Schedule" title="Schedule" role="tab" type="button">
                <svg className="taskScreenIconBtnSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                  <path d="M3.5 9.5h17" />
                  <path d="M8 3.75v3.5" />
                  <path d="M16 3.75v3.5" />
                  <path d="M8 13h3" />
                  <path d="M13 13h3" />
                  <path d="M8 17h3" />
                </svg>
                <span className="taskScreenTabLabel">Schedule</span>
              </button>
            </div>
            <button className="iconBtn taskScreenPill taskScreenHeaderBtn" id="openAddTaskBtn" aria-label="New Task" title="New Task" type="button">
              <span className="taskScreenHeaderBtnText">+ New Task</span>
            </button>
            <div className="tasksModeControlGroup" aria-label="Task ordering controls">
              <details className="tasksModeMenu" id="taskOrderByMenu">
                <summary className="btn btn-ghost small tasksModeMenuBtn" id="taskOrderByMenuBtn" title="Order tasks">
                  <span id="taskOrderByValue" className="sr-only">Custom</span>
                  <svg className="tasksModeMenuBtnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 6.5h16" />
                    <path d="M7.5 12h9" />
                    <path d="M10.5 17.5h3" />
                  </svg>
                </summary>
                <div className="tasksModeMenuList" role="menu" aria-label="Order tasks by">
                  <div className="tasksModeMenuLabel" role="presentation">Sort by</div>
                  <button className="tasksModeMenuItem" type="button" data-task-order-by="alpha" role="menuitem">A-Z</button>
                  <button className="tasksModeMenuItem" type="button" data-task-order-by="schedule" role="menuitem">Schedule/Time</button>
                  <button className="tasksModeMenuItem isOn" type="button" data-task-order-by="custom" role="menuitem">Custom</button>
                </div>
              </details>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }, [initialPage, isMobileViewport]);

  return (
    <>
      <TaskTimerAppFrame
        activePage={initialPage}
        mobileToolbar={mobileToolbar}
        currentRankId={rewardProgress.currentRankId}
        currentUserAvatarSrc={currentUserAvatarSrc}
        currentUserAvatarInitials={currentUserAvatarInitials}
        rewardsHeader={rewardsHeader}
      >
        <div className="appPages">
          <section className={`appPage appPageTasks${initialPage === "tasks" || initialPage === "schedule" ? " appPageOn" : ""}`} id="appPageTasks" aria-label="Tasks page">
            {!isMobileViewport ? (
            <div className="dashboardTopRow">
              <div className="taskPageHeaderActions">
                <div className="taskScreenPillGroup" role="tablist" aria-label="Tasks and schedule view switch">
                  <button
                    className="iconBtn taskScreenPill taskScreenHeaderBtn isOn"
                    id="closeScheduleBtn"
                    data-screen-pill="tasks"
                    aria-current="page"
                    aria-label="Tasks"
                    title="Tasks"
                    role="tab"
                    type="button"
                  >
                    <AppImg className="taskScreenIconBtnImage" src="/Task_List.svg" alt="" aria-hidden="true" />
                    <span className="taskScreenTabLabel">Tasks</span>
                  </button>
                  <button
                    className="iconBtn taskScreenPill taskScreenHeaderBtn"
                    id="openScheduleBtn"
                    data-screen-pill="schedule"
                    aria-label="Schedule"
                    title="Schedule"
                    role="tab"
                    type="button"
                  >
                    <svg className="taskScreenIconBtnSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                      <path d="M3.5 9.5h17" />
                      <path d="M8 3.75v3.5" />
                      <path d="M16 3.75v3.5" />
                      <path d="M8 13h3" />
                      <path d="M13 13h3" />
                      <path d="M8 17h3" />
                    </svg>
                    <span className="taskScreenTabLabel">Schedule</span>
                  </button>
                </div>
                <button
                  className="iconBtn taskScreenPill taskScreenHeaderBtn"
                  id="openAddTaskBtn"
                  aria-label="New Task"
                  title="New Task"
                  type="button"
                >
                  <span className="taskScreenHeaderBtnText">+ New Task</span>
                </button>
                <div className="tasksModeControlGroup" aria-label="Task ordering controls">
                  <details className="tasksModeMenu" id="taskOrderByMenu">
                    <summary className="btn btn-ghost small tasksModeMenuBtn" id="taskOrderByMenuBtn" title="Order tasks">
                      <span id="taskOrderByValue" className="sr-only">Custom</span>
                      <svg className="tasksModeMenuBtnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 6.5h16" />
                        <path d="M7.5 12h9" />
                        <path d="M10.5 17.5h3" />
                      </svg>
                    </summary>
                    <div className="tasksModeMenuList" role="menu" aria-label="Order tasks by">
                      <div className="tasksModeMenuLabel" role="presentation">Sort by</div>
                      <button className="tasksModeMenuItem" type="button" data-task-order-by="alpha" role="menuitem">
                        A-Z
                      </button>
                      <button className="tasksModeMenuItem" type="button" data-task-order-by="schedule" role="menuitem">
                        Schedule/Time
                      </button>
                      <button className="tasksModeMenuItem isOn" type="button" data-task-order-by="custom" role="menuitem">
                        Custom
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
            ) : null}
            <section className="modeView modeViewOn" id="mode1View" aria-label="Tasks view">
              <div className="list" id="taskList" />
              <HistoryScreen />
              <FocusModeScreen />
              <SchedulePageContent active={initialPage === "schedule"} />
            </section>
          </section>

          <DashboardPageContent active={initialPage === "dashboard"} />

          <section className={`appPage${initialPage === "friends" ? " appPageOn" : ""}`} id="appPageFriends" aria-label="Friends page">
            <div className="dashboardShell" id="groupsFriendsSection">
              <div className="dashboardTopRow">
                <div className="dashboardEditActions">
                  <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button">
                    Add Friend
                  </button>
                </div>
              </div>

              <div className="dashboardGrid">
                <div id="groupsFriendRequestStatus" className="settingsDetailNote" style={{ display: "none" }} />

                <section className="dashboardCard" aria-label="Friends list">
                  <div id="groupsFriendsList" className="settingsDetailNote">
                    No friends yet.
                  </div>
                </section>

                <section className="dashboardCard" aria-label="Tasks shared by you">
                  <details id="groupsSharedByYouDetails">
                    <summary className="dashboardCardTitle" id="groupsSharedByYouTitle">
                      0 shared by you
                    </summary>
                    <div id="groupsSharedByYouList" className="settingsDetailNote">
                      No shared tasks.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Incoming requests">
                  <details id="groupsIncomingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsIncomingRequestsTitle">
                      0 Incoming Requests
                    </summary>
                    <div id="groupsIncomingRequestsList" className="settingsDetailNote">
                      No incoming requests.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Outgoing requests">
                  <details id="groupsOutgoingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsOutgoingRequestsTitle">
                      0 Outgoing Requests
                    </summary>
                    <div id="groupsOutgoingRequestsList" className="settingsDetailNote">
                      No outgoing requests.
                    </div>
                  </details>
                </section>
              </div>
            </div>
          </section>

          <section className={`appPage${initialPage === "leaderboard" ? " appPageOn" : ""}`} id="appPageLeaderboard" aria-label="Leaderboard page">
            <div className="dashboardShell leaderboardShell">
              <div className="dashboardGrid leaderboardGrid">
                <section className="dashboardCard leaderboardCard leaderboardHeroCard" aria-label="Top leaderboard rankings">
                  <div className="leaderboardHeroHead">
                    <div>
                      <p className="dashboardCardEyebrow leaderboardGlobalLadderEyebrow">Global ladder</p>
                      <h3 className="dashboardCardTitle">Top focus performers</h3>
                    </div>
                  </div>
                  <div className="leaderboardRows">
                    {leaderboardData.topEntries.length ? (
                      leaderboardData.topEntries.map((entry, index) => (
                        <article
                          className="leaderboardRow"
                          key={entry.uid}
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${getLeaderboardLabel(entry)} leaderboard position`}
                          onClick={() => setSelectedLeaderboardProfile(entry)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setSelectedLeaderboardProfile(entry);
                          }}
                        >
                          <div className="leaderboardRank">{index + 1}</div>
                          <span className="leaderboardAvatarButton">
                            <LeaderboardAvatar profile={entry} />
                          </span>
                          <div className="leaderboardIdentity">
                            <span className="leaderboardNameButton">
                              <strong className="leaderboardName">{getLeaderboardLabel(entry)}</strong>
                            </span>
                            <span className="leaderboardMeta">
                              {formatDashboardDurationShort(entry.totalFocusMs)} focused - {formatLeaderboardStreak(entry.streakDays)}
                            </span>
                          </div>
                          <div className="leaderboardStats">
                            <span className="leaderboardStatPrimary">
                              <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                              <span className="leaderboardXp">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                            </span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="leaderboardPanelText">
                        {leaderboardState === "loading"
                          ? "Loading leaderboard standings."
                          : leaderboardState === "signedOut"
                            ? "Sign in to view the global leaderboard."
                            : leaderboardState === "error"
                              ? leaderboardError || "Could not load the leaderboard."
                              : "No leaderboard data yet. Launch a task to publish the first public snapshot."}
                      </div>
                    )}
                  </div>
                </section>

                <section className="dashboardCard leaderboardCard" aria-label="Rising this week">
                  <p className="dashboardCardEyebrow">Rising this week</p>
                  <h3 className="dashboardCardTitle">Fastest climbers</h3>
                  <div className="leaderboardSideList">
                    {leaderboardData.risingEntries.length ? (
                      leaderboardData.risingEntries.map((entry) => (
                        <article className="leaderboardSideItem" key={entry.uid}>
                          <LeaderboardAvatar profile={entry} small />
                          <div className="leaderboardSideText">
                            <strong>{getLeaderboardLabel(entry)}</strong>
                            <span>{formatLeaderboardStreak(entry.streakDays)}</span>
                          </div>
                          <span className="leaderboardSideMetricWrap">
                            <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                            <span className="leaderboardSideMetric">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                          </span>
                        </article>
                      ))
                    ) : (
                      <div className="leaderboardPanelText">
                        {leaderboardState === "loading"
                          ? "Loading this week's movers."
                          : "Too few public profiles to show rising users yet."}
                      </div>
                    )}
                  </div>
                </section>

                <section className="dashboardCard leaderboardCard" aria-label="Closest rivals">
                  <p className="dashboardCardEyebrow">Closest rivals</p>
                  <h3 className="dashboardCardTitle">Nearby on the ladder</h3>
                  <div className="leaderboardSideList">
                    {leaderboardData.rivalEntries.length && leaderboardData.currentUserEntry ? (
                      leaderboardData.rivalEntries.map((entry) => {
                        const gap = Math.abs(entry.rewardTotalXp - leaderboardData.currentUserEntry!.rewardTotalXp);
                        const gapLabel =
                          entry.rewardTotalXp >= leaderboardData.currentUserEntry!.rewardTotalXp
                            ? `${new Intl.NumberFormat().format(gap)} XP ahead`
                            : `${new Intl.NumberFormat().format(gap)} XP behind`;
                        return (
                          <article className="leaderboardSideItem" key={entry.uid}>
                            <LeaderboardAvatar profile={entry} small />
                            <div className="leaderboardSideText">
                              <strong>{getLeaderboardLabel(entry)}</strong>
                              <span>{gapLabel}</span>
                            </div>
                            <span className="leaderboardSideMetricWrap">
                              <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                              <span className="leaderboardSideMetric">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                            </span>
                          </article>
                        );
                      })
                    ) : (
                      <div className="leaderboardPanelText">
                        {leaderboardState === "loading"
                          ? "Loading nearby rivals."
                          : leaderboardData.currentUserEntry
                            ? "Too few ranked users to calculate nearby rivals yet."
                            : "Your public profile needs to sync before rivals can be calculated."}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </section>

          {selectedLeaderboardProfile ? (
            <div className="overlay" id="leaderboardPositionOverlay" onClick={closeLeaderboardPositionModal}>
              <div className="modal leaderboardPositionModal" role="dialog" aria-modal="true" aria-label="Leaderboard position" onClick={(event) => event.stopPropagation()}>
                <p className="modalSubtext leaderboardUserSummaryTitle">User Summary</p>
                <div className="leaderboardPositionModalIdentity">
                  <LeaderboardAvatar profile={selectedLeaderboardProfile} />
                  <div className="leaderboardPositionModalIdentityText">
                    <strong className="leaderboardName">{selectedLeaderboardLabel}</strong>
                    {selectedLeaderboardMemberSince ? (
                      <span className="leaderboardMemberSince">Member since {selectedLeaderboardMemberSince}</span>
                    ) : null}
                  </div>
                </div>
                <div className="leaderboardMiniRow leaderboardPositionInfo">
                  <span className="leaderboardMiniLabel">Leaderboard position</span>
                  <strong>{selectedLeaderboardRankLabel}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Rank</span>
                  <strong>{getLeaderboardRankLabel(selectedLeaderboardProfile)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">XP</span>
                  <strong>{formatLeaderboardXp(selectedLeaderboardProfile.rewardTotalXp)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Time logged</span>
                  <strong>{formatDashboardDurationShort(selectedLeaderboardProfile.totalFocusMs)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Current streak</span>
                  <strong>{formatLeaderboardStreak(selectedLeaderboardProfile.streakDays)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Weekly XP</span>
                  <strong>{formatLeaderboardTrend(selectedLeaderboardProfile.weeklyXpGain)}</strong>
                </div>
                <div className="confirmBtns">
                  <button className="btn btn-ghost" type="button" onClick={closeLeaderboardPositionModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className={`appPage${initialPage === "history" ? " appPageOn" : ""}`} id="appPageHistory" aria-label="History Manager page">
            <HistoryManagerScreen />
          </section>
        </div>

        <EditTaskOverlay />
      </TaskTimerAppFrame>

      <AddTaskOverlay />
      <TaskManualEntryOverlay />
      <InfoOverlays />
      <ElapsedPadOverlay />
      <ExportTaskOverlay />
      <GlobalTaskAlerts />
      <HistoryAnalysisOverlay />
      <HistoryEntryNoteOverlay />
      <FriendsOverlays />
    </>
  );
}
