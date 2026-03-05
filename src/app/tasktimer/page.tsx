"use client";

"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import InfoOverlays from "./components/InfoOverlays";
import TaskList from "./components/TaskList";
import { initTaskTimerClient } from "./tasktimerClient";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "./lib/cloudStore";
import "./tasktimer.css";

export default function TaskTimerPage() {
  const [signedInUserLabel, setSignedInUserLabel] = useState<string | null>(null);

  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const displayName = String(user?.displayName || "").trim();
      const email = String(user?.email || "").trim();
      setSignedInUserLabel(displayName || email || null);
      if (user?.uid) void ensureUserProfileIndex(user.uid);
    });
    return () => unsub();
  }, []);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskTimer App">
        <div className="topbar">
          <div className="brand">
            <img className="brandLogo" src="/timebase-logo.svg" alt="Timebase" />
          </div>

          {signedInUserLabel ? (
            <a
              id="signedInHeaderBadge"
              href="/tasktimer/settings?pane=general"
              style={{
                justifySelf: "end",
                gridColumn: 3,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                border: "none",
                borderRadius: 0,
                padding: 0,
                background: "transparent",
                color: "#d3faff",
                fontSize: 11,
                lineHeight: 1.2,
                maxWidth: 280,
                justifyContent: "flex-end",
                textDecoration: "none",
              }}
              aria-label={`Welcome ${signedInUserLabel}`}
              title="Open Account settings"
            >
              <span
                aria-hidden="true"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "1px solid rgba(53,232,255,.6)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#8ff6ff",
                }}
              >
                {signedInUserLabel.slice(0, 1).toUpperCase()}
              </span>
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textAlign: "right",
                }}
                title={signedInUserLabel}
              >
                Welcome {signedInUserLabel}
              </span>
            </a>
          ) : null}
        </div>
        <div className="modeSwitchWrap modeSwitchNoBrackets" style={{ display: "flex", justifyContent: "center" }}>
          <div className="modeSwitch" id="modeSwitch" aria-label="View modes">
            <button className="btn btn-ghost small modeBtn isOn" id="mode1Btn" type="button" data-mode="mode1">
              1
            </button>
            <button className="btn btn-ghost small modeBtn" id="mode2Btn" type="button" data-mode="mode2">
              2
            </button>
            <button className="btn btn-ghost small modeBtn" id="mode3Btn" type="button" data-mode="mode3">
              3
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
            <div className="controls">
              <button className="btn btn-ghost" id="openAddTaskBtn" type="button" style={{ width: "100%" }}>
                + Add Task
              </button>
            </div>
          </section>

          <section className="appPage" id="appPageDashboard" aria-label="Dashboard page">
            <div className="dashboardShell">
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Performance Overview</p>
                  <h2 className="dashboardTitle">Mission Dashboard</h2>
                </div>
                <div className="dashboardEditActions">
                  <details className="dashboardPanelMenu" id="dashboardPanelMenu">
                    <summary className="btn btn-ghost small dashboardPanelMenuBtn" id="dashboardPanelMenuBtn" role="button" aria-label="Show or hide dashboard panels">
                      Panels
                    </summary>
                    <div className="dashboardPanelMenuList" id="dashboardPanelMenuList" role="menu" aria-label="Dashboard panels" />
                  </details>
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

                <section
                  className="dashboardCard dashboardAvgSessionCard"
                  data-dashboard-id="avg-session-by-task"
                  aria-label="Average completed session duration by task"
                >
                  <div className="dashboardCardTitle" id="dashboardAvgSessionTitle">
                    Avg Session by Task (Past 7 Days)
                  </div>
                  <div className="historyCanvasWrap">
                    <canvas className="historyChartInline" id="dashboardAvgSessionChart" />
                  </div>
                  <p className="dashboardAvgSessionEmpty" id="dashboardAvgSessionEmpty" style={{ display: "none" }}>
                    No completed sessions in this range.
                  </p>
                  <div className="historyRangeRow dashboardAvgSessionRangeRow">
                    <details className="dashboardAvgRangeMenu" id="dashboardAvgRangeMenu">
                      <summary
                        className="btn btn-ghost small dashboardAvgRangeMenuBtn"
                        id="dashboardAvgRangeMenuBtn"
                        role="button"
                        aria-label="Select average session range"
                      >
                        <span className="dashboardAvgRangeMenuLabelPrefix">Range:</span>
                        <span id="dashboardAvgRangeMenuLabel">Past 7 Days</span>
                      </summary>
                      <div className="dashboardAvgRangeMenuList" role="menu" aria-label="Average session range options">
                        <button
                          className="dashboardAvgRangeMenuItem isOn"
                          type="button"
                          data-dashboard-avg-range="past7"
                          role="menuitemradio"
                          aria-checked="true"
                        >
                          Past 7 Days
                        </button>
                        <button
                          className="dashboardAvgRangeMenuItem"
                          type="button"
                          data-dashboard-avg-range="currentWeek"
                          role="menuitemradio"
                          aria-checked="false"
                        >
                          Current Week
                        </button>
                        <button
                          className="dashboardAvgRangeMenuItem"
                          type="button"
                          data-dashboard-avg-range="past30"
                          role="menuitemradio"
                          aria-checked="false"
                        >
                          Past 30 Days
                        </button>
                        <button
                          className="dashboardAvgRangeMenuItem"
                          type="button"
                          data-dashboard-avg-range="currentMonth"
                          role="menuitemradio"
                          aria-checked="false"
                        >
                          Current Month
                        </button>
                      </div>
                    </details>
                  </div>
                </section>

                <section className="dashboardCard dashboardDonutCard" data-dashboard-id="mode-distribution" aria-label="Category distribution">
                  <div className="dashboardCardTitle">Mode Distribution</div>
                  <div className="dashboardDonutWrap">
                    <div className="dashboardDonut" id="dashboardModeDonut" />
                    <div className="dashboardDonutCenter" id="dashboardModeDonutCenter">0%</div>
                  </div>
                  <div className="dashboardLegend">
                    <span className="dashboardLegendRow">
                      <span className="dashboardLegendName">
                        <i className="dot mode1" />
                        <span id="dashboardMode1Label">Mode 1</span>
                      </span>
                      <strong id="dashboardMode1Value">0%</strong>
                    </span>
                    <span className="dashboardLegendRow">
                      <span className="dashboardLegendName">
                        <i className="dot mode2" />
                        <span id="dashboardMode2Label">Mode 2</span>
                      </span>
                      <strong id="dashboardMode2Value">0%</strong>
                    </span>
                    <span className="dashboardLegendRow">
                      <span className="dashboardLegendName">
                        <i className="dot mode3" />
                        <span id="dashboardMode3Label">Mode 3</span>
                      </span>
                      <strong id="dashboardMode3Value">0%</strong>
                    </span>
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
                  <div className="dashboardHeatHeaderRow">
                    <div className="dashboardHeatMonthLabel" id="dashboardHeatMonthLabel" aria-live="polite">
                      -
                    </div>
                  </div>
                  <div className="dashboardHeatWeekdays" id="dashboardHeatWeekdays" aria-hidden="true">
                    <span>Sun</span>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                  </div>
                  <div className="dashboardHeatCalendarGrid" id="dashboardHeatCalendarGrid" role="grid" aria-label="Monthly focus heatmap calendar">
                    {Array.from({ length: 42 }).map((_, idx) => (
                      <span key={`hm-cal-${idx}`} className="dashboardHeatDayCell isFiller" aria-hidden="true" />
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

          <section className="appPage" id="appPageTest2" aria-label="Groups page">
            <div className="dashboardShell" id="groupsFriendsSection">
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Community</p>
                  <h2 className="dashboardTitle">Friends</h2>
                </div>
                <div className="dashboardEditActions">
                  <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button">
                    + Friend
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

        <div className="appFooterNav" aria-label="App pages">
          <button className="btn btn-ghost small appFooterBtn" id="footerDashboardBtn" type="button" aria-label="Dashboard">
            <img className="appFooterIconImage" src="/Dashboard.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Dashboard</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn isOn" id="footerTasksBtn" type="button" aria-label="Tasks">
            <img className="appFooterIconImage" src="/Task_List.svg" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Tasks</span>
          </button>
          <button className="btn btn-ghost small appFooterBtn" id="footerTest2Btn" type="button" aria-label="Groups">
            <img className="appFooterIconImage" src="/Groups.svg" alt="" aria-hidden="true" />
            <span
              id="footerTest2AlertBadge"
              className="appFooterAlertBadge"
              aria-live="polite"
              aria-atomic="true"
              style={{ display: "none" }}
            />
            <span className="appFooterLabel">Friends</span>
          </button>
          <a className="btn btn-ghost small appFooterBtn" id="footerSettingsBtn" href="/tasktimer/settings" aria-label="Settings">
            <img className="appFooterIconImage" src="/icon-settings.png" alt="" aria-hidden="true" />
            <span className="appFooterLabel">Settings</span>
          </a>
        </div>
      </div>

      <AddTaskOverlay />
      <InfoOverlays />
      <EditTaskOverlay />
      <ElapsedPadOverlay />
      <ExportTaskOverlay />
      <ConfirmOverlay />
      <HistoryAnalysisOverlay />
      <div className="overlay" id="friendRequestModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Send Friend Request">
          <h2>Send Friend Request</h2>
          <p className="modalSubtext friendRequestModalSubtext">Send a request by entering your friend&apos;s email address.</p>
          <div className="field">
            <label htmlFor="friendRequestEmailInput">Email address</label>
            <input id="friendRequestEmailInput" type="email" autoComplete="email" className="text w100" />
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="friendRequestCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="friendRequestSendBtn" type="button">
              Send Request
            </button>
          </div>
          <div id="friendRequestModalStatus" className="settingsDetailNote" style={{ display: "none" }} aria-live="polite" />
        </div>
      </div>
      <div className="overlay" id="shareTaskModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Share Task">
          <h2 id="shareTaskTitle">Share Task</h2>
          <p className="modalSubtext shareTaskModalSubtext">Choose who should receive this task and its live progress.</p>
          <div className="field">
            <label htmlFor="shareTaskScopeSelect">Sharing scope</label>
            <select id="shareTaskScopeSelect" className="text w100" defaultValue="all">
              <option value="all">Share with all friends</option>
              <option value="specific">Share with specific friend(s)</option>
            </select>
          </div>
          <div className="field" id="shareTaskFriendsField" style={{ display: "none" }}>
            <label>Select friend(s)</label>
            <div id="shareTaskFriendsList" />
          </div>
          <div id="shareTaskStatus" className="settingsDetailNote" style={{ display: "none" }} aria-live="polite" />
          <div className="footerBtns">
            <button className="btn btn-ghost" id="shareTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="shareTaskConfirmBtn" type="button">
              Share
            </button>
          </div>
        </div>
      </div>
      <div className="overlay" id="friendProfileModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Friend Profile">
          <h2>Friend Info</h2>
          <div className="chkRow" id="friendProfileIdentityRow">
            <img id="friendProfileAvatar" src="/avatars/initials/initials-AN.svg" alt="" aria-hidden="true" />
            <div className="friendProfileIdentityText">
              <div id="friendProfileName">Friend</div>
              <div id="friendProfileMemberSince">Member since --</div>
            </div>
          </div>
          <div className="modalSubtext">
            <img
              id="friendProfileRankImage"
              src={undefined}
              alt="Rank insignia"
              style={{ display: "none", width: 72, height: 72, objectFit: "contain", borderRadius: 10, marginBottom: 10 }}
            />
            <div id="friendProfileRank">Rank: --</div>
          </div>
          <div className="footerBtns friendProfileDeleteRow">
            <button className="btn btn-warn" id="friendProfileDeleteBtn" type="button">
              Delete Friend
            </button>
          </div>
          <div className="footerBtns friendProfileCloseRow">
            <button className="btn btn-ghost" id="friendProfileCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </>
  );
}
