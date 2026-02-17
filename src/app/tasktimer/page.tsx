"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
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

          <div className="modeSwitch" aria-label="View modes">
            <button className="btn btn-ghost small modeBtn isOn" id="mode1Btn" type="button" data-mode="mode1">
              Mode 1
            </button>
            <button className="btn btn-ghost small modeBtn" id="mode2Btn" type="button" data-mode="mode2">
              Mode 2
            </button>
            <button className="btn btn-ghost small modeBtn" id="mode3Btn" type="button" data-mode="mode3">
              Mode 3
            </button>
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

        <section className="modeView modeViewOn" id="mode1View" aria-label="Mode 1 view">
          <TaskList />
          <HistoryScreen />
          <FocusModeScreen />
        </section>

        <section className="modeView" id="mode2View" aria-label="Mode 2 view" />

        <section className="modeView" id="mode3View" aria-label="Mode 3 view" />
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
