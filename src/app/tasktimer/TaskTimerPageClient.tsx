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
            <img className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
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
                    <p className="dashboardKicker">Launchpad</p>
                    <h2 className="dashboardTitle">Tasks</h2>
                  </div>
                  <div className="tasksModeControlGroup" aria-label="Task category selector">
                    <span className="tasksModeControlLabel">Category:</span>
                    <details className="tasksModeMenu" id="modeSwitch">
                      <summary className="btn btn-ghost small tasksModeMenuBtn" id="modeSwitchBtn" role="button" aria-label="Select task category">
                        <span id="modeSwitchCurrentLabel">Mode 1</span>
                      </summary>
                      <div className="tasksModeMenuList" role="menu" aria-label="Task categories">
                        <button className="tasksModeMenuItem modeBtn isOn" id="mode1Btn" type="button" role="menuitemradio" aria-checked="true">
                          Mode 1
                        </button>
                        <button className="tasksModeMenuItem modeBtn" id="mode2Btn" type="button" role="menuitemradio" aria-checked="false">
                          Mode 2
                        </button>
                        <button className="tasksModeMenuItem modeBtn" id="mode3Btn" type="button" role="menuitemradio" aria-checked="false">
                          Mode 3
                        </button>
                      </div>
                    </details>
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
                        <summary className="btn btn-ghost small dashboardPanelMenuBtn" id="dashboardPanelMenuBtn" role="button" aria-label="Customize dashboard categories and panels">
                          <span className="dashboardPanelMenuIcon" aria-hidden="true" />
                        </summary>
                        <div className="dashboardPanelMenuList" id="dashboardPanelMenuList" role="menu" aria-label="Dashboard categories and panels" />
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
                      <div className="dashboardStreakHeader">
                        <div className="dashboardCardTitle">Streak</div>
                      </div>
                      <div className="dashboardStreakValue" id="dashboardStreakValue">No streak yet</div>
                      <div className="dashboardStreakBar dashboardSegmentedBar" id="dashboardStreakBar">
                        <span id="dashboardStreakBarFill" style={{ width: "0%" }} />
                        <span className="dashboardSegmentedBarTrack" aria-hidden="true">
                          <span className="dashboardSegmentedBarSegment" />
                          <span className="dashboardSegmentedBarSegment" />
                          <span className="dashboardSegmentedBarSegment" />
                          <span className="dashboardSegmentedBarSegment" />
                          <span className="dashboardSegmentedBarSegment" />
                        </span>
                      </div>
                      <div className="dashboardStreakMeta" id="dashboardStreakMeta">Complete daily goals to start a streak</div>
                    </section>

                    <section
                      className="dashboardCard dashboardStatCard dashboardWeekHoursCard"
                      data-dashboard-id="week-hours"
                      data-dashboard-label="Today"
                      aria-label="Today's logged time"
                    >
                      <div className="dashboardCardTitle" id="dashboardTodayHoursTitle">Today</div>
                      <div className="dashboardBigValue" id="dashboardTodayHoursValue">0m</div>
                      <div className="dashboardGoalProgressWrap">
                        <span
                          className="dashboardGoalProjectionMarker"
                          id="dashboardTodayHoursProjectionMarker"
                          aria-hidden="true"
                          style={{ display: "none" }}
                        />
                        <div
                          className="dashboardGoalProgressBar dashboardSegmentedBar"
                          id="dashboardTodayHoursProgressBar"
                          role="progressbar"
                          aria-label="Today's time goal progress"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={0}
                        >
                          <span id="dashboardTodayHoursProjectionFill" style={{ display: "none", width: "0%", left: "0%" }} />
                          <span id="dashboardTodayHoursProgressFill" style={{ width: "0%" }} />
                          <span className="dashboardSegmentedBarTrack" aria-hidden="true">
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                          </span>
                        </div>
                      </div>
                      <div className="dashboardDelta" id="dashboardTodayHoursMeta" style={{ display: "none" }}>
                        No daily time goals enabled
                      </div>
                      <div className="dashboardDelta" id="dashboardTodayHoursDelta">No time logged today</div>
                    </section>

                    <section
                      className="dashboardCard dashboardStatCard dashboardWeeklyGoalsCard"
                      data-dashboard-id="weekly-time-goals"
                      data-dashboard-label="This Week"
                      aria-label="Weekly logged time and time goal progress"
                    >
                      <div className="dashboardCardTitle">This Week</div>
                      <div className="dashboardBigValue" id="dashboardWeeklyGoalsValue">
                        0m
                      </div>
                      <div className="dashboardGoalProgressWrap">
                        <span
                          className="dashboardGoalProjectionMarker"
                          id="dashboardWeeklyGoalsProjectionMarker"
                          aria-hidden="true"
                          style={{ display: "none" }}
                        />
                        <div
                          className="dashboardGoalProgressBar dashboardSegmentedBar"
                          id="dashboardWeeklyGoalsProgressBar"
                          role="progressbar"
                          aria-label="Weekly time goal progress"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={0}
                        >
                          <span id="dashboardWeeklyGoalsProjectionFill" style={{ display: "none", width: "0%", left: "0%" }} />
                          <span id="dashboardWeeklyGoalsProgressFill" style={{ width: "0%" }} />
                          <span className="dashboardSegmentedBarTrack" aria-hidden="true">
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                            <span className="dashboardSegmentedBarSegment" />
                          </span>
                        </div>
                      </div>
                      <div className="dashboardDelta" id="dashboardWeeklyGoalsMeta" style={{ display: "none" }}>
                        No weekly time goals enabled
                      </div>
                      <div className="dashboardDelta" id="dashboardWeeklyGoalsProgressText">
                        0% logged this week
                      </div>
                    </section>

                    <section className="dashboardCard dashboardStatCard dashboardTasksCompletedCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                      <div className="dashboardCardTitle">Tasks Completed</div>
                      <div className="dashboardBigValue" id="dashboardTasksCompletedValue">0</div>
                      <div className="dashboardDelta" id="dashboardTasksCompletedMeta">No weekly goal completions yet</div>
                    </section>

                    <section
                      className="dashboardCard dashboardAvgSessionCard"
                      data-dashboard-id="avg-session-by-task"
                      aria-label="Average completed session duration by task"
                      data-dashboard-label="Avg session by task"
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
                        <button
                          className="btn btn-ghost small dashboardAvgRangeToggle"
                          id="dashboardAvgRangeToggleBtn"
                          type="button"
                          data-dashboard-avg-range-toggle="true"
                          aria-label="Toggle average session range between past 7 days and past 30 days"
                        >
                          <span id="dashboardAvgRangeMenuLabel">Past 7 Days</span>
                        </button>
                      </div>
                    </section>

                    <section className="dashboardCard dashboardTimelineCard" data-dashboard-id="timeline" aria-label="Today timeline">
                      <div className="dashboardTimelineHeader">
                        <div className="dashboardCardTitle">Timeline</div>
                        <div className="dashboardTimelineDensity" role="group" aria-label="Timeline suggestion density">
                          <button
                            className="dashboardTimelineDensityBtn"
                            type="button"
                            data-dashboard-timeline-density="low"
                            aria-pressed="false"
                          >
                            Low
                          </button>
                          <button
                            className="dashboardTimelineDensityBtn"
                            type="button"
                            data-dashboard-timeline-density="medium"
                            aria-pressed="true"
                          >
                            Medium
                          </button>
                          <button
                            className="dashboardTimelineDensityBtn"
                            type="button"
                            data-dashboard-timeline-density="high"
                            aria-pressed="false"
                          >
                            High
                          </button>
                        </div>
                      </div>
                      <div className="dashboardTimelineNote" id="dashboardTimelineNote" aria-live="polite" />
                      <ul className="dashboardTimeline" id="dashboardTimelineList" aria-live="polite" />
                    </section>

                    <section className="dashboardCard dashboardHeatCard" data-dashboard-id="heatmap" id="dashboardHeatCard" aria-label="Activity heatmap">
                      <div className="dashboardHeatFlipScene">
                        <div className="dashboardHeatFace dashboardHeatFaceFront" id="dashboardHeatFaceFront" aria-hidden="false">
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
                        </div>
                        <div className="dashboardHeatFace dashboardHeatFaceBack" id="dashboardHeatFaceBack" aria-hidden="true" inert={true}>
                          <div className="dashboardHeatDetailHead">
                            <div className="dashboardHeatDetailCopy">
                              <div className="dashboardCardTitle">Focus Heatmap</div>
                              <p className="modalSubtext" id="dashboardHeatSummaryDate">
                                Select a day to review logged time.
                              </p>
                            </div>
                            <button
                              className="iconBtn dashboardHeatFlipBackBtn"
                              id="dashboardHeatSummaryCloseBtn"
                              type="button"
                              title="Back to heatmap"
                              aria-label="Back to heatmap"
                              aria-expanded="false"
                            >
                              &#8594;
                            </button>
                          </div>
                          <div className="confirmText dashboardHeatSummaryBody" id="dashboardHeatSummaryBody">
                            <div className="dashboardHeatSummaryEmpty">No logged sessions for this day.</div>
                          </div>
                        </div>
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
        <GlobalTaskAlerts />
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
          <div className="friendProfileHeaderRow">
            <h2>Friend Info</h2>
            <button className="friendProfileDeleteLink" id="friendProfileDeleteBtn" type="button">
              Delete Friend
            </button>
          </div>
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
