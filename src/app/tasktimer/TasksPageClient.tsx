"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import SchedulePageContent from "./components/SchedulePageContent";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import { initTaskTimerTasksClient } from "./tasktimerClient";
import "./tasktimer.css";

export default function TasksPageClient() {
  useEffect(() => {
    const { destroy } = initTaskTimerTasksClient();
    return () => destroy();
  }, []);

  return (
    <>
      <TaskTimerAppFrame activePage="tasks">
        <div className="appPages">
          <section className="appPage appPageTasks appPageOn" id="appPageTasks" aria-label="Tasks page">
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
          <SchedulePageContent active={false} />
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
    </>
  );
}
