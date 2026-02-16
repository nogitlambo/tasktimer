"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import HistoryManagerScreen from "./components/HistoryManagerScreen";
import HistoryScreen from "./components/HistoryScreen";
import InfoOverlays from "./components/InfoOverlays";
import MenuOverlay from "./components/MenuOverlay";
import TaskList from "./components/TaskList";
import { initTaskTimerClient } from "./tasktimerClient";
import "./tasktimer.css";

export default function TaskTimerPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskTimer App">
        <div className="topbar">
          <div className="brand">
            <img className="brandLogo" src="/tasktimer-logo.png" alt="TaskTimer" />
          </div>

          <div className="controls">
            <button className="btn btn-accent" id="openAddTaskBtn" type="button">
              + Add Task
            </button>

            <button className="menuIcon" id="menuIcon" type="button" aria-label="Settings" title="Settings">
              ⚙
            </button>
          </div>
        </div>

        <TaskList />
        <HistoryScreen />
        <HistoryManagerScreen />
        <FocusModeScreen />
      </div>

      <MenuOverlay />
      <AddTaskOverlay />
      <InfoOverlays />
      <EditTaskOverlay />
      <ElapsedPadOverlay />
      <ConfirmOverlay />
    </>
  );
}
