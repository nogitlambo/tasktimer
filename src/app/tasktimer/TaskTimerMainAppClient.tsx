"use client";

import { useEffect, useMemo, useState } from "react";
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
                <p className="dashboardKicker">Launchpad</p>
                <h2 className="dashboardTitle">Tasks</h2>
              </div>
              <div className="taskPageHeaderActions">
                <button className="btn btn-ghost small taskScreenPill isOn" data-screen-pill="tasks" aria-current="page" role="tab" type="button">
                  Tasks
                </button>
                <button className="btn btn-ghost small taskScreenPill" id="openScheduleBtn" data-screen-pill="schedule" role="tab" type="button">
                  Schedule
                </button>
                <span className="taskScreenHeaderPipe" aria-hidden="true">
                  |
                </span>
                <button className="btn btn-ghost small taskScreenPill" id="openAddTaskBtn" type="button">
                  + Add Task
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
                  <p className="dashboardKicker">Community</p>
                  <h2 className="dashboardTitle">Friends</h2>
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
