"use client";

import { useEffect, useMemo, useState } from "react";
import AppImg from "@/components/AppImg";
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
import SchedulePageContent from "./components/SchedulePageContent";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import type { AppPage } from "./client/types";
import { buildRewardsHeaderViewModel, DEFAULT_REWARD_PROGRESS, normalizeRewardProgress } from "./lib/rewards";
import { subscribeCachedPreferences } from "./lib/storage";
import { initTaskTimerClient } from "./tasktimerClient";
import { bootstrapFirebaseWebAppCheck } from "@/lib/firebaseClient";
import "./tasktimer.css";

type TaskTimerMainAppClientProps = {
  initialPage: AppPage;
};

const LEADERBOARD_ENTRIES = [
  { rank: 1, username: "NovaSprint", initials: "NS", focusHours: "182h", streak: "29 days", xp: "12,480 XP", trend: "+14%" },
  { rank: 2, username: "TaskRanger", initials: "TR", focusHours: "171h", streak: "24 days", xp: "11,960 XP", trend: "+11%" },
  { rank: 3, username: "ClockCircuit", initials: "CC", focusHours: "163h", streak: "19 days", xp: "11,420 XP", trend: "+9%" },
  { rank: 4, username: "FocusHarbor", initials: "FH", focusHours: "156h", streak: "17 days", xp: "10,980 XP", trend: "+7%" },
  { rank: 5, username: "MinutePilot", initials: "MP", focusHours: "148h", streak: "15 days", xp: "10,610 XP", trend: "+6%" },
  { rank: 6, username: "DeepCurrent", initials: "DC", focusHours: "141h", streak: "13 days", xp: "10,120 XP", trend: "+4%" },
];

const LEADERBOARD_RISING = [
  { username: "StreakBloom", initials: "SB", note: "Up 8 spots this week", metric: "42h focused" },
  { username: "GridRunner", initials: "GR", note: "Longest active streak gain", metric: "12 straight days" },
  { username: "CalmForge", initials: "CF", note: "Best XP surge today", metric: "+740 XP" },
];

const LEADERBOARD_RIVALS = [
  { username: "PulseVector", initials: "PV", gap: "120 XP ahead" },
  { username: "OrbitLedger", initials: "OL", gap: "85 XP behind" },
  { username: "TimerEcho", initials: "TE", gap: "2h focus gap" },
];

export default function TaskTimerMainAppClient({ initialPage }: TaskTimerMainAppClientProps) {
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);

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

  return (
    <>
      <TaskTimerAppFrame activePage={initialPage}>
        <div className="appPages">
          <section className={`appPage appPageTasks${initialPage === "tasks" ? " appPageOn" : ""}`} id="appPageTasks" aria-label="Tasks page">
            <div className="dashboardTopRow">
              <div className="dashboardTitleWrap">
                <p className="dashboardKicker">Tasks</p>
              </div>
              <div className="taskPageHeaderActions">
                <button
                  className="iconBtn taskScreenPill taskScreenHeaderBtn isOn"
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
            </section>
          </section>

          <DashboardPageContent rewardsHeader={rewardsHeader} active={initialPage === "dashboard"} />
          <SchedulePageContent active={initialPage === "schedule"} />

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
                      <p className="dashboardCardEyebrow">Mockup ladder</p>
                      <h3 className="dashboardCardTitle">Top focus performers</h3>
                    </div>
                    <p className="leaderboardHeroMeta">Placeholder standings only</p>
                  </div>
                  <div className="leaderboardRows">
                    {LEADERBOARD_ENTRIES.map((entry) => (
                      <article className="leaderboardRow" key={entry.rank}>
                        <div className="leaderboardRank">{entry.rank}</div>
                        <div className="leaderboardAvatar" aria-hidden="true">
                          {entry.initials}
                        </div>
                        <div className="leaderboardIdentity">
                          <strong className="leaderboardName">{entry.username}</strong>
                          <span className="leaderboardMeta">{entry.focusHours} focused - {entry.streak}</span>
                        </div>
                        <div className="leaderboardStats">
                          <span className="leaderboardXp">{entry.xp}</span>
                          <span className="leaderboardTrend">{entry.trend}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="dashboardCard leaderboardCard" aria-label="Your mock leaderboard position">
                  <p className="dashboardCardEyebrow">Your position</p>
                  <h3 className="dashboardCardTitle">Rank #18</h3>
                  <p className="leaderboardPanelText">You are 520 XP away from the next promotion band in this placeholder season snapshot.</p>
                  <div className="leaderboardMiniRow">
                    <span className="leaderboardMiniLabel">Focus logged</span>
                    <strong>88h</strong>
                  </div>
                  <div className="leaderboardMiniRow">
                    <span className="leaderboardMiniLabel">Current streak</span>
                    <strong>9 days</strong>
                  </div>
                </section>

                <section className="dashboardCard leaderboardCard" aria-label="Rising this week">
                  <p className="dashboardCardEyebrow">Rising this week</p>
                  <h3 className="dashboardCardTitle">Fastest climbers</h3>
                  <div className="leaderboardSideList">
                    {LEADERBOARD_RISING.map((entry) => (
                      <article className="leaderboardSideItem" key={entry.username}>
                        <div className="leaderboardAvatar leaderboardAvatarSmall" aria-hidden="true">
                          {entry.initials}
                        </div>
                        <div className="leaderboardSideText">
                          <strong>{entry.username}</strong>
                          <span>{entry.note}</span>
                        </div>
                        <span className="leaderboardSideMetric">{entry.metric}</span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="dashboardCard leaderboardCard" aria-label="Closest rivals">
                  <p className="dashboardCardEyebrow">Closest rivals</p>
                  <h3 className="dashboardCardTitle">Nearby on the ladder</h3>
                  <div className="leaderboardSideList">
                    {LEADERBOARD_RIVALS.map((entry) => (
                      <article className="leaderboardSideItem" key={entry.username}>
                        <div className="leaderboardAvatar leaderboardAvatarSmall" aria-hidden="true">
                          {entry.initials}
                        </div>
                        <div className="leaderboardSideText">
                          <strong>{entry.username}</strong>
                          <span>{entry.gap}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </section>
        </div>
      </TaskTimerAppFrame>

      <AddTaskOverlay />
      <InfoOverlays />
      <EditTaskOverlay />
      <ElapsedPadOverlay />
      <ExportTaskOverlay />
      <GlobalTaskAlerts />
      <HistoryAnalysisOverlay />
      <HistoryEntryNoteOverlay />
      <FriendsOverlays />
    </>
  );
}
