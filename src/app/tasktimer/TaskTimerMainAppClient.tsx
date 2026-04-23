"use client";

import { useEffect, useMemo, useState } from "react";
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
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import RankThumbnail from "./components/RankThumbnail";
import SchedulePageContent from "./components/SchedulePageContent";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import type { AppPage } from "./client/types";
import { formatDashboardDurationShort } from "./lib/historyChart";
import {
  LEADERBOARD_PROFILE_UPDATED_EVENT,
  getLeaderboardAvatarSrc,
  getLeaderboardInitials,
  loadLeaderboardScreenData,
  type LeaderboardProfile,
  type LeaderboardScreenData,
} from "./lib/leaderboard";
import { buildRewardsHeaderViewModel, DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "./lib/rewards";
import { subscribeCachedPreferences } from "./lib/storage";
import { initTaskTimerClient } from "./tasktimerClient";
import { bootstrapFirebaseWebAppCheck } from "@/lib/firebaseClient";
import "./tasktimer.css";

type TaskTimerMainAppClientProps = {
  initialPage: AppPage;
};

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

function getLeaderboardLabel(profile: LeaderboardProfile): string {
  return String(profile.displayLabel || profile.username || "User").trim() || "User";
}

function LeaderboardAvatar({ profile, small = false }: { profile: LeaderboardProfile; small?: boolean }) {
  const avatarSrc = getLeaderboardAvatarSrc(profile);
  const initials = getLeaderboardInitials(getLeaderboardLabel(profile));
  return (
    <div className={`leaderboardAvatar${small ? " leaderboardAvatarSmall" : ""}`} aria-hidden="true">
      {avatarSrc ? (
        <AppImg className="leaderboardAvatarImg" src={avatarSrc} alt="" />
      ) : (
        initials
      )}
    </div>
  );
}

function LeaderboardRankBadge({ profile, small = false }: { profile: LeaderboardProfile; small?: boolean }) {
  return (
    <span className={`leaderboardRankBadge${small ? " leaderboardRankBadgeSmall" : ""}`} aria-label="Rank insignia">
      <RankThumbnail
        rankId={String(profile.rewardCurrentRankId || "")}
        storedThumbnailSrc={String(profile.rankThumbnailSrc || "")}
        className="leaderboardRankBadgeShell"
        imageClassName="leaderboardRankBadgeImg"
        placeholderClassName="leaderboardRankBadgePlaceholder"
        alt="Rank insignia"
        size={small ? 24 : 28}
      />
    </span>
  );
}

export default function TaskTimerMainAppClient({ initialPage }: TaskTimerMainAppClientProps) {
  const searchParams = useSearchParams();
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [dismissedHighlightParam, setDismissedHighlightParam] = useState<string | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardLoadState>(() =>
    getFirebaseAuthClient() ? "loading" : "error"
  );
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardScreenData>(EMPTY_LEADERBOARD_SCREEN_DATA);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(() =>
    getFirebaseAuthClient() ? null : "Leaderboard is unavailable in this session."
  );
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const highlightParam = searchParams.get("highlight");
  const isHighlighting = !!highlightParam && highlightParam !== dismissedHighlightParam;

  useEffect(() => {
    void bootstrapFirebaseWebAppCheck();
    const { destroy } = initTaskTimerClient(initialPage);
    return () => {
      destroy();
    };
  }, [initialPage]);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
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
    }

    if (activeUid) {
      void loadForUid(activeUid);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener(LEADERBOARD_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
      }
    };
  }, []);

  const leaderboardHeroMeta =
    leaderboardState === "loading"
      ? "Loading standings..."
      : leaderboardState === "signedOut"
        ? "Sign in to view the global ladder"
        : leaderboardState === "error"
          ? leaderboardError || "Leaderboard unavailable"
          : leaderboardData.topEntries.length
            ? `${leaderboardData.topEntries.length} ranked users loaded`
            : "No leaderboard data yet";
  const currentUserLabel = leaderboardData.currentUserEntry ? getLeaderboardLabel(leaderboardData.currentUserEntry) : "You";
  const currentUserRankLabel =
    leaderboardData.currentUserRank && leaderboardData.currentUserRank > 0 ? `Rank #${leaderboardData.currentUserRank}` : "Awaiting rank";
  const currentUserGapLabel =
    leaderboardData.currentUserGapToNextXp && leaderboardData.currentUserGapToNextXp > 0
      ? `${new Intl.NumberFormat().format(leaderboardData.currentUserGapToNextXp)} XP to the next rival.`
      : leaderboardData.currentUserEntry
        ? "You are at the front of the current visible ladder."
        : "Your profile will appear here after the first public snapshot sync.";

  return (
    <>
      <TaskTimerAppFrame activePage={initialPage}>
        <div className="appPages">
          <section className={`appPage appPageTasks${initialPage === "tasks" || initialPage === "schedule" ? " appPageOn" : ""}`} id="appPageTasks" aria-label="Tasks page">
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
                  </button>
                </div>
                <button
                  className="iconBtn taskScreenPill taskScreenHeaderBtn"
                  id="openAddTaskBtn"
                  aria-label="Add Task"
                  title="Add Task"
                  type="button"
                >
                  <span className="taskScreenIconBtnPlus" aria-hidden="true">
                    +
                  </span>
                </button>
              </div>
            </div>
            <section className="modeView modeViewOn" id="mode1View" aria-label="Tasks view">
              <div className="list" id="taskList" />
              <HistoryScreen />
              <FocusModeScreen />
              <SchedulePageContent active={initialPage === "schedule"} />
            </section>
          </section>

          <DashboardPageContent rewardsHeader={rewardsHeader} active={initialPage === "dashboard"} />

          <section className={`appPage${initialPage === "test2" ? " appPageOn" : ""}`} id="appPageTest2" aria-label="Friends page">
            <div className="dashboardShell" id="groupsFriendsSection">
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Friends</p>
                </div>
                <div className="dashboardEditActions">
                  <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button">
                    Add Friend
                  </button>
                </div>
              </div>

              <div className="dashboardGrid">
                <div id="groupsFriendRequestStatus" className="settingsDetailNote" style={{ display: "none" }}>
                  Ready.
                </div>

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
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Leaderboard</p>
                </div>
              </div>

              <div className="dashboardGrid leaderboardGrid">
                <section className="dashboardCard leaderboardCard leaderboardHeroCard" aria-label="Top leaderboard rankings">
                  <div className="leaderboardHeroHead">
                    <div>
                      <p className="dashboardCardEyebrow">Global ladder</p>
                      <h3 className="dashboardCardTitle">Top focus performers</h3>
                    </div>
                    <p className="leaderboardHeroMeta">{leaderboardHeroMeta}</p>
                  </div>
                  <div className="leaderboardRows">
                    {leaderboardData.topEntries.length ? (
                      leaderboardData.topEntries.map((entry, index) => (
                        <article className="leaderboardRow" key={entry.uid}>
                          <div className="leaderboardRank">{index + 1}</div>
                          <LeaderboardAvatar profile={entry} />
                          <div className="leaderboardIdentity">
                            <strong className="leaderboardName">{getLeaderboardLabel(entry)}</strong>
                            <span className="leaderboardMeta">
                              {formatDashboardDurationShort(entry.totalFocusMs)} focused - {formatLeaderboardStreak(entry.streakDays)}
                            </span>
                          </div>
                          <div className="leaderboardStats">
                            <span className="leaderboardStatPrimary">
                              <LeaderboardRankBadge profile={entry} />
                              <span className="leaderboardXp">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                            </span>
                            <span className="leaderboardTrend">{formatLeaderboardTrend(entry.weeklyXpGain)}</span>
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

                <section className="dashboardCard leaderboardCard" aria-label="Your leaderboard position">
                  <p className="dashboardCardEyebrow">Your position</p>
                  <h3 className="dashboardCardTitle">{currentUserRankLabel}</h3>
                  <p className="leaderboardPanelText">
                    {leaderboardState === "signedOut"
                      ? "Sign in to compare your progress against the rest of the app."
                      : leaderboardState === "error"
                        ? leaderboardError || "Your leaderboard summary is unavailable."
                        : leaderboardData.currentUserEntry
                          ? `${currentUserLabel} has ${formatLeaderboardXp(leaderboardData.currentUserEntry.rewardTotalXp)}. ${currentUserGapLabel}`
                          : "Your public leaderboard profile has not synced yet."}
                  </p>
                  <div className="leaderboardMiniRow">
                    <span className="leaderboardMiniLabel">Focus logged</span>
                    <strong>
                      {leaderboardData.currentUserEntry ? formatDashboardDurationShort(leaderboardData.currentUserEntry.totalFocusMs) : "--"}
                    </strong>
                  </div>
                  <div className="leaderboardMiniRow">
                    <span className="leaderboardMiniLabel">Current streak</span>
                    <strong>
                      {leaderboardData.currentUserEntry ? formatLeaderboardStreak(leaderboardData.currentUserEntry.streakDays) : "--"}
                    </strong>
                  </div>
                  <div className="leaderboardMiniRow">
                    <span className="leaderboardMiniLabel">Weekly XP</span>
                    <strong>
                      {leaderboardData.currentUserEntry ? formatLeaderboardTrend(leaderboardData.currentUserEntry.weeklyXpGain) : "--"}
                    </strong>
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
                            <LeaderboardRankBadge profile={entry} small />
                            <span className="leaderboardSideMetric">{formatLeaderboardTrend(entry.weeklyXpGain)}</span>
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
                              <LeaderboardRankBadge profile={entry} small />
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
        </div>

        <EditTaskOverlay />
      </TaskTimerAppFrame>

      <AddTaskOverlay />
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
