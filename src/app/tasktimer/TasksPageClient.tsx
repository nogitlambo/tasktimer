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
          <section className="appPage appPageOn" id="appPageTasks" aria-label="Tasks page">
            <div className="dashboardTopRow">
              <div className="dashboardTitleWrap">
                <p className="dashboardKicker">Launchpad</p>
                <h2 className="dashboardTitle">Tasks</h2>
              </div>
            </div>
            <section className="modeView modeViewOn" id="mode1View" aria-label="Tasks view">
              <div className="list" id="taskList" />
              <HistoryScreen />
              <FocusModeScreen />
            </section>
            <div className="taskPageControls">
              <button className="btn btn-ghost" id="openAddTaskBtn" type="button" style={{ width: "100%" }}>
                + Add Task
              </button>
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
    </>
  );
}
