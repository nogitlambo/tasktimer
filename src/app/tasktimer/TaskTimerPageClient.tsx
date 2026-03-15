"use client";

import { useEffect } from "react";
import AddTaskOverlay from "./components/AddTaskOverlay";
import ConfirmOverlay from "./components/ConfirmOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import SignedInHeaderBadge from "./components/SignedInHeaderBadge";
import DesktopAppRail from "./components/DesktopAppRail";
import { initTaskTimerClient } from "./tasktimerClient";
import "./tasktimer.css";

type AppPage = "tasks" | "dashboard" | "test1" | "test2";

export default function TaskTimerPageClient({ initialAppPage = "tasks" }: { initialAppPage?: AppPage }) {
  useEffect(() => {
    const { destroy } = initTaskTimerClient(initialAppPage);
    return () => destroy();
  }, [initialAppPage]);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskLaunch App">
        <div className="topbar">
          <div className="brand">
            <img className="brandLogo" src="/logo/tasklaunch.svg" alt="TaskLaunch" />
          </div>

          <SignedInHeaderBadge />
        </div>
        <div className="desktopAppShell">
          <DesktopAppRail
            activePage={initialAppPage === "dashboard" ? "dashboard" : initialAppPage === "test2" ? "test2" : "tasks"}
            useClientNavButtons={true}
            showMobileFooter={false}
          />
          <div className="desktopAppMain">
            <div className="appPages">
              <section className="appPage" id="appPageTasks" aria-label="Tasks page">
                <div className="dashboardTopRow">
                  <div className="dashboardTitleWrap">
                    <p className="dashboardKicker">Workspace</p>
                    <h2 className="dashboardTitle">Tasks</h2>
                  </div>
                </div>
                <section className="modeView modeViewOn" id="mode1View" aria-label="Mode 1 view">
                  <div className="list" id="taskList" />
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

          <section className={`appPage${initialAppPage === "dashboard" ? " appPageOn" : ""}`} id="appPageDashboard" aria-label="Dashboard page">
            <div className="dashboardNeonLayout">
              <div className="dashboardMain">
                <div className="dashboardShell">
                  <div className="dashboardTopRow">
                    <div className="dashboardTitleWrap">
                      <p className="dashboardKicker">PRODUCTIVITY OVERVIEW</p>
                      <h2 className="dashboardTitle">DASHBOARD</h2>
                    </div>
                    <div className="dashboardEditActions">
                      <details className="dashboardPanelMenu" id="dashboardPanelMenu">
                        <summary className="btn btn-ghost small dashboardPanelMenuBtn" id="dashboardPanelMenuBtn" role="button" aria-label="Show or hide dashboard panels">
                          <span className="dashboardPanelMenuIcon" aria-hidden="true">
                            ...
                          </span>
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

                  <section className="dashboardHeroPanel" data-dashboard-panel-id="overview" aria-label="Overview highlights">
                    <div className="dashboardHeroCopy dashboardHeroCopyFull">
                      <h3 className="dashboardHeroTitle">Overview</h3>
                      <div className="dashboardHeroValue" id="dashboardOverviewValue">
                        0m
                      </div>
                      <p className="dashboardHeroSubtext" id="dashboardOverviewSubtext">
                        Logged this week from history
                      </p>
                      <div className="dashboardHeroStats dashboardOverviewStats" aria-label="Overview summary">
                        <div className="dashboardHeroStat">
                          <strong id="dashboardOverviewSessionsValue">0</strong>
                          <span className="dashboardHeroStatLabel">completed sessions</span>
                        </div>
                        <div className="dashboardHeroStat">
                          <strong id="dashboardOverviewBestDayValue">-</strong>
                          <span className="dashboardHeroStatLabel">best day</span>
                        </div>
                        <div className="dashboardHeroStat">
                          <strong id="dashboardOverviewDeltaValue">0%</strong>
                          <span className="dashboardHeroStatLabel">vs previous week</span>
                        </div>
                      </div>
                    </div>
                    <div className="dashboardHeroChartPanel dashboardOverviewChartPanel" aria-label="Weekly history overview chart">
                      <div className="dashboardHeroChartWrap dashboardOverviewChartWrap">
                        <canvas className="dashboardHeroChart dashboardOverviewChart" id="dashboardOverviewChart" role="img" aria-label="Weekly history overview chart" />
                        <div className="dashboardOverviewChartEmpty" id="dashboardOverviewChartEmpty" style={{ display: "none" }}>
                          No completed history in the current week.
                        </div>
                        <div className="dashboardOverviewAxis" id="dashboardOverviewAxis" aria-hidden="true">
                          <span>M</span>
                          <span>T</span>
                          <span>W</span>
                          <span>T</span>
                          <span>F</span>
                          <span>S</span>
                          <span>S</span>
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="dashboardGrid">
                    <section className="dashboardCard dashboardStreakCard" data-dashboard-id="streak" aria-label="Streak information">
                      <div className="dashboardCardTitle">Streak</div>
                      <div className="dashboardStreakValue">21 Days</div>
                      <div className="dashboardStreakBar">
                        <span style={{ width: "78%" }} />
                      </div>
                      <div className="dashboardStreakMeta">4/5 sessions completed today</div>
                    </section>

                    <section className="dashboardCard dashboardStatCard dashboardWeekHoursCard" data-dashboard-id="week-hours" aria-label="Weekly hours">
                      <div className="dashboardCardTitle">This Week</div>
                      <div className="dashboardBigValue">32h 40m</div>
                      <div className="dashboardDelta positive">+14% vs last week</div>
                    </section>

                    <section className="dashboardCard dashboardStatCard dashboardTasksCompletedCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                      <div className="dashboardCardTitle">Tasks Completed</div>
                      <div className="dashboardBigValue">18</div>
                      <div className="dashboardDelta">2 carried over</div>
                    </section>

                    <section
                      className="dashboardCard dashboardMainGraphCard"
                      data-dashboard-id="focus-trend"
                      id="dashboardFocusTrendCard"
                      aria-label="Focus trend graph"
                    >
                      <div className="dashboardCardTitle">Focus Trend (7 Days)</div>
                      <div className="dashboardGraphBars" id="dashboardFocusTrendBars">
                        <span style={{ height: "36%" }} />
                        <span style={{ height: "52%" }} />
                        <span style={{ height: "40%" }} />
                        <span style={{ height: "69%" }} />
                        <span style={{ height: "61%" }} />
                        <span style={{ height: "82%" }} />
                        <span style={{ height: "76%" }} />
                      </div>
                      <div className="dashboardGraphAxis" id="dashboardFocusTrendAxis">
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
              </div>
            </div>
          </section>

          <section className={`appPage${initialAppPage === "test1" ? " appPageOn" : ""}`} id="appPageTest1" aria-label="Test page 1">
            <div className="appPagePlaceholder">
              <h2>Test Page 1</h2>
              <p>Placeholder test content and sample data.</p>
            </div>
          </section>

          <section className={`appPage${initialAppPage === "test2" ? " appPageOn" : ""}`} id="appPageTest2" aria-label="Friends page">
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
          </div>
        </div>
        <DesktopAppRail
          activePage={initialAppPage === "dashboard" ? "dashboard" : initialAppPage === "test2" ? "test2" : "tasks"}
          useClientNavButtons={true}
          showDesktopRail={false}
        />
      </div>

      <>
        <AddTaskOverlay />
        <InfoOverlays />
        <EditTaskOverlay />
        <ElapsedPadOverlay />
        <ExportTaskOverlay />
        <ConfirmOverlay />
        <HistoryAnalysisOverlay />
        <HistoryEntryNoteOverlay />
      </>
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
            <div
              id="friendProfileRankPlaceholder"
              className="friendProfileRankPlaceholder"
              style={{ display: "none", width: 72, height: 72, marginBottom: 10 }}
              aria-hidden="true"
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
      <div
        className="historySaveWorkingIndicator"
        id="historySaveWorkingIndicator"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden="true"
        tabIndex={-1}
      >
        <div className="historySaveWorkingPanel" role="status" aria-live="polite" aria-atomic="true">
          <span className="historySaveWorkingDots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span id="historySaveWorkingText">Saving history...</span>
        </div>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </>
  );
}
