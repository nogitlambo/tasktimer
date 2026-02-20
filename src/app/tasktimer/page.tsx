"use client";

"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import HistoryScreen from "./components/HistoryScreen";
import InfoOverlays from "./components/InfoOverlays";
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

          <div className="modeSwitchWrap">
            <div className="modeSwitchLabel">Mode</div>
            <div className="modeSwitch" id="modeSwitch" aria-label="View modes">
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
          </div>

          <div className="controls">
            <button className="btn btn-accent" id="openAddTaskBtn" type="button">
              + Add Task
            </button>
          </div>
        </div>
        <div className="appPages">
          <section className="appPage appPageOn" id="appPageTasks" aria-label="Tasks page">
            <section className="modeView modeViewOn" id="mode1View" aria-label="Mode 1 view">
              <TaskList />
              <HistoryScreen />
              <FocusModeScreen />
            </section>

            <section className="modeView" id="mode2View" aria-label="Mode 2 view" />

            <section className="modeView" id="mode3View" aria-label="Mode 3 view" />
          </section>

          <section className="appPage" id="appPageDashboard" aria-label="Dashboard page">
            <div className="dashboardShowcase" data-name="Cover" data-node-id="2009:1008">
              <img
                className="dashboardShowcaseImage"
                src="https://www.figma.com/api/mcp/asset/f4d5fb76-7d46-436b-bd8c-9da01a371eaf"
                alt="Nexus next-gen AI summit event landing page preview"
              />
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <a className="btn btn-accent small" href="/tasktimer/settings/" aria-label="Open Settings">
                  Settings
                </a>
              </div>
            </div>
          </section>

          <section className="appPage" id="appPageTest1" aria-label="Test page 1">
            <div className="appPagePlaceholder">
              <h2>Test Page 1</h2>
              <p>Placeholder test content and sample data.</p>
            </div>
          </section>

          <section className="appPage" id="appPageTest2" aria-label="Test page 2">
            <div className="appPagePlaceholder">
              <h2>Test Page 2</h2>
              <p>Placeholder test content and sample data.</p>
            </div>
          </section>
        </div>

        <div className="appFooterNav" aria-label="App pages">
          <button className="btn btn-ghost small appFooterBtn" id="footerDashboardBtn" type="button" aria-label="Dashboard">
            <img className="appFooterIconImage" src="/icon-dashboard.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Dashboard</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn isOn" id="footerTasksBtn" type="button" aria-label="Tasks">
            <img className="appFooterIconImage" src="/icon-tasks.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Tasks</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn" id="footerTest1Btn" type="button" aria-label="Test 1">
            <img className="appFooterIconImage" src="/icon-account.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Test 1</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn" id="footerTest2Btn" type="button" aria-label="Test 2">
            <img className="appFooterIconImage" src="/icon-account.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Test 2</span>
          </button>
          <a className="btn btn-ghost small appFooterBtn" id="footerSettingsBtn" href="/tasktimer/settings/" aria-label="Settings">
            <img className="appFooterIconImage" src="/icon-settings.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Settings</span>
          </a>
        </div>
      </div>

      <AddTaskOverlay />
      <InfoOverlays />
      <EditTaskOverlay />
      <ElapsedPadOverlay />
      <ConfirmOverlay />
    </>
  );
}
