"use client";

"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
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
            <div className="dashboardShell">
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Performance Overview</p>
                  <h2 className="dashboardTitle">Mission Dashboard</h2>
                </div>
                <div className="dashboardEditActions">
                  <button className="iconBtn" id="dashboardEditBtn" type="button" aria-label="Edit Dashboard Layout" title="Edit Dashboard Layout">
                    &#9998;
                  </button>
                  <button className="btn btn-ghost small" id="dashboardEditCancelBtn" type="button" style={{ display: "none" }}>
                    Cancel
                  </button>
                  <button className="btn btn-accent small" id="dashboardEditDoneBtn" type="button" style={{ display: "none" }}>
                    Done
                  </button>
                </div>
              </div>

              <div className="dashboardGrid">
                <section className="dashboardCard dashboardProfileCard" data-dashboard-id="profile" aria-label="Profile summary">
                  <div className="dashboardProfileHead">
                    <div className="dashboardAvatar">AT</div>
                    <div>
                      <div className="dashboardProfileName">Ari Taskrunner</div>
                      <div className="dashboardProfileMeta">Focus Operator - Mode 2</div>
                    </div>
                  </div>
                  <div className="dashboardTagRow">
                    <span className="dashboardTag">Daily Target 6h</span>
                    <span className="dashboardTag">Deep Work</span>
                  </div>
                </section>

                <section className="dashboardCard dashboardStreakCard" data-dashboard-id="streak" aria-label="Streak information">
                  <div className="dashboardCardTitle">Streak</div>
                  <div className="dashboardStreakValue">21 Days</div>
                  <div className="dashboardStreakBar">
                    <span style={{ width: "78%" }} />
                  </div>
                  <div className="dashboardStreakMeta">4/5 sessions completed today</div>
                </section>

                <section className="dashboardCard dashboardStatCard" data-dashboard-id="week-hours" aria-label="Weekly hours">
                  <div className="dashboardCardTitle">This Week</div>
                  <div className="dashboardBigValue">32h 40m</div>
                  <div className="dashboardDelta positive">+14% vs last week</div>
                </section>

                <section className="dashboardCard dashboardStatCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                  <div className="dashboardCardTitle">Tasks Completed</div>
                  <div className="dashboardBigValue">18</div>
                  <div className="dashboardDelta">2 carried over</div>
                </section>

                <section className="dashboardCard dashboardMainGraphCard" data-dashboard-id="focus-trend" aria-label="Focus trend graph">
                  <div className="dashboardCardTitle">Focus Trend (7 Days)</div>
                  <div className="dashboardGraphBars">
                    <span style={{ height: "36%" }} />
                    <span style={{ height: "52%" }} />
                    <span style={{ height: "40%" }} />
                    <span style={{ height: "69%" }} />
                    <span style={{ height: "61%" }} />
                    <span style={{ height: "82%" }} />
                    <span style={{ height: "76%" }} />
                  </div>
                  <div className="dashboardGraphAxis">
                    <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
                  </div>
                </section>

                <section className="dashboardCard dashboardDonutCard" data-dashboard-id="mode-distribution" aria-label="Category distribution">
                  <div className="dashboardCardTitle">Mode Distribution</div>
                  <div className="dashboardDonutWrap">
                    <div className="dashboardDonut" />
                    <div className="dashboardDonutCenter">68%</div>
                  </div>
                  <div className="dashboardLegend">
                    <span><i className="dot mode1" /> Mode 1</span>
                    <span><i className="dot mode2" /> Mode 2</span>
                    <span><i className="dot mode3" /> Mode 3</span>
                  </div>
                </section>

                <section className="dashboardCard dashboardTimelineCard" data-dashboard-id="timeline" aria-label="Today timeline">
                  <div className="dashboardCardTitle">Timeline</div>
                  <ul className="dashboardTimeline">
                    <li><span>07:30</span><p>Plan sprint and daily goals</p></li>
                    <li><span>09:00</span><p>Deep work block - Product build</p></li>
                    <li><span>12:00</span><p>Review history and optimize checkpoints</p></li>
                    <li><span>15:30</span><p>Bug sweep and task reset pass</p></li>
                  </ul>
                </section>

                <section className="dashboardCard dashboardHeatCard" data-dashboard-id="heatmap" aria-label="Activity heatmap">
                  <div className="dashboardCardTitle">Focus Heatmap</div>
                  <div className="dashboardHeatGrid">
                    {Array.from({ length: 35 }).map((_, idx) => (
                      <span key={`hm-${idx}`} className={`h${(idx * 7) % 5}`} />
                    ))}
                  </div>
                </section>
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
            <img className="appFooterIconImage" src="/Dashboard.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Dashboard</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn isOn" id="footerTasksBtn" type="button" aria-label="Tasks">
            <img className="appFooterIconImage" src="/Task_List.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Tasks</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn" id="footerTest2Btn" type="button" aria-label="User Guide">
            <img className="appFooterIconImage" src="/User_Guide.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">User Guide</span>
          </button>
          <a className="btn btn-ghost small appFooterBtn" id="footerSettingsBtn" href="./settings/index.html" aria-label="Settings">
            <img className="appFooterIconImage" src="/Settings.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Settings</span>
          </a>
        </div>
      </div>

      <AddTaskOverlay />
      <InfoOverlays />
      <EditTaskOverlay />
      <ElapsedPadOverlay />
      <ConfirmOverlay />
      <HistoryAnalysisOverlay />
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </>
  );
}
