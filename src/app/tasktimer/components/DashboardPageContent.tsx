"use client";

import AppImg from "@/components/AppImg";

const dashboardPanelOptions = [
  { id: "xp-progress", label: "XP Progress" },
  { id: "week-hours", label: "Today" },
  { id: "weekly-time-goals", label: "This Week" },
  { id: "tasks-completed", label: "Tasks Completed" },
  { id: "momentum", label: "Momentum" },
  { id: "avg-session-by-task", label: "Avg Session by Task" },
  { id: "timeline", label: "Timeline" },
  { id: "heatmap", label: "Focus Heatmap" },
] as const;

type RewardsHeader = {
  totalXp: number;
  progressPct: number;
  progressLabel: string;
  xpToNext: number | null;
};

type DashboardPageContentProps = {
  rewardsHeader: RewardsHeader;
  active: boolean;
};

export default function DashboardPageContent({ rewardsHeader, active }: DashboardPageContentProps) {
  return (
    <section className={`appPage${active ? " appPageOn" : ""}`} id="appPageDashboard" aria-label="Dashboard page">
      <div className="dashboardNeonLayout">
        <div className="dashboardMain">
          <div className="dashboardShell">
            <div className="dashboardShellScene" id="dashboardShellScene">
              <div className="dashboardShellContent dashboardShellFace dashboardShellFaceFront" id="dashboardShellContent">
                <div className="dashboardTopRow">
                  <div className="dashboardTitleWrap">
                    <p className="dashboardKicker">PRODUCTIVITY OVERVIEW</p>
                    <h2 className="dashboardTitle">DASHBOARD</h2>
                  </div>
                  <div className="dashboardEditActions">
                    <button className="iconBtn dashboardRefreshBtn" id="dashboardRefreshBtn" type="button" aria-label="Refresh dashboard" title="Refresh dashboard">
                      <span className="dashboardRefreshIcon" aria-hidden="true" />
                    </button>
                    <button
                      className="btn btn-ghost small dashboardPanelMenuBtn"
                      id="dashboardPanelMenuBtn"
                      type="button"
                      aria-label="Customize dashboard panels"
                      aria-expanded="false"
                    >
                      <span className="dashboardPanelMenuIcon" aria-hidden="true" />
                    </button>
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
                  <section className="dashboardCard dashboardXpProgressCard" data-dashboard-id="xp-progress" aria-label="XP progress">
                    <div className="dashboardCardTitle">XP Progress</div>
                    <div className="dashboardXpProgressValue">
                      <strong>{rewardsHeader.totalXp} XP</strong>
                    </div>
                    <div
                      className="dashboardXpProgressTrack rewardSegmentedBar"
                      role="progressbar"
                      aria-label="XP progress toward the next rank"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(rewardsHeader.progressPct)}
                    >
                      <div className="dashboardXpProgressFill rewardSegmentedBarFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
                      <span className="rewardSegmentedBarTrack" aria-hidden="true">
                        <span className="rewardSegmentedBarSegment" />
                        <span className="rewardSegmentedBarSegment" />
                        <span className="rewardSegmentedBarSegment" />
                        <span className="rewardSegmentedBarSegment" />
                        <span className="rewardSegmentedBarSegment" />
                      </span>
                    </div>
                    <div className="dashboardXpProgressMeta">
                      <span>{rewardsHeader.progressLabel}</span>
                      <span>{rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to next rank` : "Max rank reached"}</span>
                    </div>
                  </section>

                  <section className="dashboardCard dashboardStatCard dashboardWeekHoursCard" data-dashboard-id="week-hours" data-dashboard-label="Today" aria-label="Today's logged time">
                    <div className="dashboardCardTitle" id="dashboardTodayHoursTitle">Today</div>
                    <div className="dashboardBigValue" id="dashboardTodayHoursValue">0m</div>
                    <div className="dashboardGoalProgressWrap">
                      <span className="dashboardGoalProjectionMarker" id="dashboardTodayHoursProjectionMarker" aria-hidden="true" style={{ display: "none" }} />
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
                    <div className="dashboardDelta" id="dashboardTodayHoursMeta" style={{ display: "none" }}>No daily time goals enabled</div>
                    <div className="dashboardDelta" id="dashboardTodayHoursDelta">No time logged today</div>
                  </section>

                  <section className="dashboardCard dashboardStatCard dashboardWeeklyGoalsCard" data-dashboard-id="weekly-time-goals" data-dashboard-label="This Week" aria-label="Weekly logged time and time goal progress">
                    <div className="dashboardCardTitle">This Week</div>
                    <div className="dashboardBigValue" id="dashboardWeeklyGoalsValue">0m</div>
                    <div className="dashboardGoalProgressWrap">
                      <span className="dashboardGoalProjectionMarker" id="dashboardWeeklyGoalsProjectionMarker" aria-hidden="true" style={{ display: "none" }} />
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
                    <div className="dashboardDelta" id="dashboardWeeklyGoalsMeta" style={{ display: "none" }}>No weekly time goals enabled</div>
                    <div className="dashboardDelta" id="dashboardWeeklyGoalsProgressText">0% logged this week</div>
                  </section>

                  <section className="dashboardCard dashboardStatCard dashboardTasksCompletedCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                    <div className="dashboardCardTitle">Tasks Completed</div>
                    <div className="dashboardBigValue" id="dashboardTasksCompletedValue">0</div>
                    <div className="dashboardDelta" id="dashboardTasksCompletedMeta" style={{ display: "none" }} />
                  </section>

                  <section className="dashboardCard dashboardMomentumCard" data-dashboard-id="momentum" aria-label="Momentum overview">
                    <div className="dashboardMomentumTitleRow">
                      <div className="dashboardCardTitle">Momentum</div>
                    </div>
                    <div className="dashboardMomentumDialWrap">
                      <div className="dashboardMomentumDial" id="dashboardMomentumDial" role="img" aria-label="Momentum score">
                        <div className="dashboardMomentumScoreSummary" aria-live="polite">
                          <div className="dashboardMomentumScoreValue" id="dashboardMomentumScoreValue">0</div>
                          <div className="dashboardMomentumScoreStatus" id="dashboardMomentumScoreStatus">Low</div>
                        </div>
                        <svg className="dashboardMomentumSvg" viewBox="0 0 187 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                          <defs>
                            <linearGradient id="momentumGaugeGradient" x1="22" y1="50" x2="165" y2="50" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="#a9d65f" />
                              <stop offset="22%" stopColor="#cfe06f" />
                              <stop offset="42%" stopColor="#ffd54a" />
                              <stop offset="58%" stopColor="#f7a625" />
                              <stop offset="74%" stopColor="#ff7a1c" />
                              <stop offset="88%" stopColor="#e4421f" />
                              <stop offset="100%" stopColor="#8f1623" />
                            </linearGradient>
                            <filter id="momentumGaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
                              <feGaussianBlur stdDeviation="0.8" result="blur" />
                              <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                              </feMerge>
                            </filter>
                          </defs>
                          <path d="M22 79 A72 72 0 0 1 165 79" fill="none" stroke="rgba(82, 95, 125, 0.22)" strokeWidth="17" strokeLinecap="butt" />
                          <path d="M22 79 A72 72 0 0 1 165 79" id="dashboardMomentumArcActive" fill="none" stroke="url(#momentumGaugeGradient)" strokeWidth="17" strokeLinecap="butt" filter="url(#momentumGaugeGlow)" pathLength="100" strokeDasharray="0 100" />
                          <path d="M22 79 A72 72 0 0 1 165 79" fill="none" stroke="#4b291f" strokeWidth="1.4" opacity="0.7" />
                          {(() => {
                            const centerX = 93.5;
                            const centerY = 79;
                            const markerInnerRadius = 55.5;
                            const markerOuterRadius = 72.5;
                            const markerValues = [25, 50, 75];
                            const labelRadius = 46;
                            return (
                              <g className="dashboardMomentumMarkers" aria-hidden="true">
                                {markerValues.map((value) => {
                                  const ratio = value / 100;
                                  const angleDeg = 180 - ratio * 180;
                                  const angleRad = (angleDeg * Math.PI) / 180;
                                  const x1 = centerX + Math.cos(angleRad) * markerInnerRadius;
                                  const y1 = centerY - Math.sin(angleRad) * markerInnerRadius;
                                  const x2 = centerX + Math.cos(angleRad) * markerOuterRadius;
                                  const y2 = centerY - Math.sin(angleRad) * markerOuterRadius;
                                  const tierLabel = value === 25 ? "x1.2" : value === 50 ? "x1.5" : value === 75 ? "x2.0" : "";
                                  const labelX = centerX + Math.cos(angleRad) * labelRadius;
                                  const labelY = centerY - Math.sin(angleRad) * labelRadius + (value === 50 ? 4 : 2);
                                  return (
                                    <g key={`momentum-marker-${value}`}>
                                      <line
                                        x1={x1}
                                        y1={y1}
                                        x2={x2}
                                        y2={y2}
                                        stroke="rgba(0, 0, 0, 0.92)"
                                        strokeWidth="1.35"
                                        strokeLinecap="round"
                                        vectorEffect="non-scaling-stroke"
                                        opacity="0.92"
                                      />
                                      {tierLabel ? (
                                        <text
                                          x={labelX}
                                          y={labelY}
                                          fill="rgba(241, 247, 255, 0.92)"
                                          fontSize="7.5"
                                          fontWeight="700"
                                          letterSpacing="0.08em"
                                          textAnchor="middle"
                                          dominantBaseline="alphabetic"
                                        >
                                          {tierLabel}
                                        </text>
                                      ) : null}
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          })()}
                        </svg>
                        <div className="dashboardMomentumNeedle" id="dashboardMomentumNeedle" aria-hidden="true" />
                      </div>
                    </div>
                    <section className="dashboardMomentumDriversSection dashboardMomentumDriversTextSection" aria-label="Momentum Drivers">
                      <div className="dashboardCardTitle dashboardMomentumDriversTitle">Momentum Drivers</div>
                      <ul className="dashboardMomentumDrivers dashboardMomentumDriverTextList" id="dashboardMomentumDrivers" aria-live="polite">
                        <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Recent activity: 0/40</span></li>
                        <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Consistency: 0/25</span></li>
                        <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Weekly Progress: 0/25</span></li>
                        <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Live Bonus: 0/10</span></li>
                      </ul>
                    </section>
                    <section className="dashboardMomentumDriversSection dashboardMomentumDriversMeterSection" aria-hidden="true">
                      <div className="dashboardCardTitle dashboardMomentumDriversTitle dashboardMomentumDriversTitleSpacer">Visual</div>
                      <ul className="dashboardMomentumDrivers dashboardMomentumDriverMeterList" id="dashboardMomentumDriverMeters">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <li className="dashboardMomentumDriver" key={`momentum-meter-${index}`}>
                            <span className="dashboardMomentumDriverMeter">
                              <span className="dashboardMomentumDriverMeterFill" style={{ ["--momentum-driver-fill" as string]: "0%" }} />
                              <span className="dashboardMomentumDriverMeterTrack" aria-hidden="true">
                                <span className="dashboardMomentumDriverMeterSegment" />
                                <span className="dashboardMomentumDriverMeterSegment" />
                                <span className="dashboardMomentumDriverMeterSegment" />
                                <span className="dashboardMomentumDriverMeterSegment" />
                                <span className="dashboardMomentumDriverMeterSegment" />
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </section>

                  <section className="dashboardCard dashboardAvgSessionCard" data-dashboard-id="avg-session-by-task" aria-label="Average completed session duration by task" data-dashboard-label="Avg session by task">
                    <div className="dashboardCardTitle" id="dashboardAvgSessionTitle">Avg Session by Task (Past 7 Days)</div>
                    <div className="historyCanvasWrap">
                      <canvas className="historyChartInline" id="dashboardAvgSessionChart" />
                    </div>
                    <p className="dashboardAvgSessionEmpty" id="dashboardAvgSessionEmpty" style={{ display: "none" }}>
                      No completed sessions in this range.
                    </p>
                    <div className="historyRangeRow dashboardAvgSessionRangeRow">
                      <button className="btn btn-ghost small dashboardAvgRangeToggle" id="dashboardAvgRangeToggleBtn" type="button" data-dashboard-avg-range-toggle="true" aria-label="Toggle average session range between past 7 days and past 30 days">
                        <span id="dashboardAvgRangeMenuLabel">Past 7 Days</span>
                      </button>
                    </div>
                  </section>

                  <section className="dashboardCard dashboardTimelineCard" data-dashboard-id="timeline" aria-label="Today timeline">
                    <div className="dashboardTimelineHeader">
                      <div className="dashboardCardTitle">Timeline</div>
                      <div className="dashboardTimelineDensity" role="group" aria-label="Timeline suggestion density">
                        <button className="dashboardTimelineDensityBtn" type="button" data-dashboard-timeline-density="low" aria-pressed="false">Low</button>
                        <button className="dashboardTimelineDensityBtn" type="button" data-dashboard-timeline-density="medium" aria-pressed="true">Medium</button>
                        <button className="dashboardTimelineDensityBtn" type="button" data-dashboard-timeline-density="high" aria-pressed="false">High</button>
                      </div>
                    </div>
                    <div className="dashboardTimelineNote" id="dashboardTimelineNote" aria-live="polite" />
                    <div className="dashboardTimeline" id="dashboardTimelineList" aria-live="polite" role="group" aria-label="Suggested daily timeline" />
                    <div className="dashboardTimelineSummary" id="dashboardTimelineSummary" aria-live="polite" />
                  </section>

                  <section className="dashboardCard dashboardHeatCard" data-dashboard-id="heatmap" id="dashboardHeatCard" aria-label="Activity heatmap">
                    <div className="dashboardHeatFlipScene">
                      <div className="dashboardHeatFace dashboardHeatFaceFront" id="dashboardHeatFaceFront" aria-hidden="false">
                        <div className="dashboardCardTitle">Focus Heatmap</div>
                        <div className="dashboardHeatHeaderRow">
                          <div className="dashboardHeatMonthLabel" id="dashboardHeatMonthLabel" aria-live="polite">-</div>
                        </div>
                        <div className="dashboardHeatWeekdays" id="dashboardHeatWeekdays" aria-hidden="true">
                          <span>Mon</span>
                          <span>Tue</span>
                          <span>Wed</span>
                          <span>Thu</span>
                          <span>Fri</span>
                          <span>Sat</span>
                          <span>Sun</span>
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
                            <p className="modalSubtext" id="dashboardHeatSummaryDate">Select a day to review logged time.</p>
                          </div>
                          <button className="iconBtn dashboardHeatFlipBackBtn" id="dashboardHeatSummaryCloseBtn" type="button" title="Back to heatmap" aria-label="Back to heatmap" aria-expanded="false">
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
              <div className="dashboardShellFace dashboardShellFaceBack" id="dashboardShellBack" aria-hidden="true" inert={true}>
                <div className="dashboardBackPanel">
                  <div className="dashboardTopRow dashboardBackTopRow">
                    <div className="dashboardTitleWrap">
                      <p className="dashboardKicker">PRODUCTIVITY OVERVIEW</p>
                      <h2 className="dashboardTitle">DASHBOARD</h2>
                    </div>
                    <div className="dashboardBackActions">
                      <button className="iconBtn dashboardFlipBackBtn" id="dashboardPanelMenuBackBtn" type="button" aria-label="Back to dashboard" title="Back to dashboard" aria-expanded="true">
                        &#8594;
                      </button>
                    </div>
                  </div>
                  <section className="dashboardBackMenuCard" aria-label="Dashboard customization">
                    <div className="dashboardBackMenuHead">
                      <div className="dashboardCardTitle">Customize Dashboard</div>
                    </div>
                    <div className="dashboardPanelMenuList dashboardPanelMenuListBack" id="dashboardPanelMenuList" role="menu" aria-label="Dashboard panels">
                      <div className="dashboardPanelMenuSectionTitle">
                        <span>Panels</span>
                        <button
                          type="button"
                          className="dashboardPanelMenuSectionAction"
                          data-dashboard-panel-bulk-toggle="true"
                          aria-label="Select all dashboard panels"
                        >
                          Select All
                        </button>
                      </div>
                      <div className="dashboardPanelMenuSectionBody dashboardPanelMenuPanelGrid">
                        {dashboardPanelOptions.map((panel) => (
                          <label className="dashboardPanelMenuItem dashboardPanelMenuTile" key={panel.id}>
                            <input type="checkbox" data-dashboard-panel-id={panel.id} />
                            <span>{panel.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
            <div className="dashboardRefreshBusyOverlay" id="dashboardRefreshBusyOverlay" aria-hidden="true" tabIndex={-1}>
              <div className="dashboardRefreshBusyPanel" role="status" aria-live="polite" aria-atomic="true">
                <h2 className="sr-only">Refreshing</h2>
                <p className="modalSubtext confirmText" id="dashboardRefreshBusyText">Refreshing...</p>
                <div className="dashboardRefreshBusyArrowStage" aria-hidden="true">
                  <div className="dashboardRefreshBusyArrowShell">
                    <div className="dashboardRefreshBusyArrowBeamBlend" />
                    <AppImg className="dashboardRefreshBusyArrowGraphic" src="/logo/launch-icon.png" alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
