"use client";

type DashboardPageContentProps = {
  active: boolean;
};

export default function DashboardPageContent({ active }: DashboardPageContentProps) {
  return (
    <section className={`appPage${active ? " appPageOn" : ""}`} id="appPageDashboard" aria-label="Dashboard page">
      <div className="dashboardNeonLayout">
        <div className="dashboardMain">
          <div className="dashboardShell">
            <div className="dashboardShellBody">
            <div className="dashboardShellScene" id="dashboardShellScene">
              <div
                className="dashboardShellContent dashboardShellFace dashboardShellFaceFront"
                id="dashboardShellContent"
              >
                <div className="dashboardGrid dashboardIntegratedPanel">
                  <section className="dashboardCard dashboardActivityOverviewCard" data-dashboard-id="activity-overview" data-dashboard-label="Activity Overview" aria-label="Activity overview">
                    <div className="dashboardActivityOverviewHead">
                      <aside className="dashboardActivitySummaryStack" aria-label="Today and weekly summaries">
                        <section className="dashboardActivitySummaryMini" aria-label="Today's logged time">
                          <div className="dashboardActivitySummaryTop">
                            <div className="dashboardCardTitle" id="dashboardActivityTodayTitle">Today</div>
                            <div className="dashboardTrendIndicator" id="dashboardActivityTodayTrendIndicator" aria-hidden="true">--</div>
                          </div>
                          <div className="dashboardBigValue" id="dashboardActivityTodayHoursValue">0m</div>
                          <div className="dashboardGoalProgressWrap">
                            <span className="dashboardGoalProjectionMarker" id="dashboardActivityTodayHoursProjectionMarker" aria-hidden="true" style={{ display: "none" }} />
                            <div
                              className="dashboardGoalProgressBar dashboardSummaryProgress dashboardXpProgressTrack rewardSegmentedBar"
                              id="dashboardActivityTodayHoursProgressBar"
                              role="progressbar"
                              aria-label="Today's time goal progress"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={0}
                            >
                              <span className="dashboardGoalProjectionFill rewardSegmentedBarFill" id="dashboardActivityTodayHoursProjectionFill" style={{ display: "none", width: "0%", left: "0%" }} />
                              <span className="dashboardGoalProgressFill rewardSegmentedBarFill" id="dashboardActivityTodayHoursProgressFill" style={{ width: "0%" }} />
                              <span className="rewardSegmentedBarTrack" aria-hidden="true">
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                              </span>
                            </div>
                          </div>
                          <div className="dashboardDelta dashboardSummaryStatus" id="dashboardActivityTodayHoursMeta" style={{ display: "none" }} />
                          <div className="dashboardDelta dashboardSummaryFoot" id="dashboardActivityTodayHoursDelta">No time logged today</div>
                        </section>
                        <section className="dashboardActivitySummaryMini" aria-label="Weekly logged time and time goal progress">
                          <div className="dashboardActivitySummaryTop">
                            <div className="dashboardCardTitle">This Week</div>
                            <div className="dashboardTrendIndicator" id="dashboardActivityWeeklyTrendIndicator" aria-hidden="true">--</div>
                          </div>
                          <div className="dashboardBigValue" id="dashboardActivityWeeklyGoalsValue">0m</div>
                          <div className="dashboardGoalProgressWrap">
                            <span className="dashboardGoalProjectionMarker" id="dashboardActivityWeeklyGoalsProjectionMarker" aria-hidden="true" style={{ display: "none" }} />
                            <div
                              className="dashboardGoalProgressBar dashboardSummaryProgress dashboardXpProgressTrack rewardSegmentedBar"
                              id="dashboardActivityWeeklyGoalsProgressBar"
                              role="progressbar"
                              aria-label="Weekly time goal progress"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={0}
                            >
                              <span className="dashboardGoalProjectionFill rewardSegmentedBarFill" id="dashboardActivityWeeklyGoalsProjectionFill" style={{ display: "none", width: "0%", left: "0%" }} />
                              <span className="dashboardGoalProgressFill rewardSegmentedBarFill" id="dashboardActivityWeeklyGoalsProgressFill" style={{ width: "0%" }} />
                              <span className="rewardSegmentedBarTrack" aria-hidden="true">
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                                <span className="rewardSegmentedBarSegment" />
                              </span>
                            </div>
                          </div>
                          <div className="dashboardDelta dashboardSummaryStatus" id="dashboardActivityWeeklyGoalsMeta" style={{ display: "none" }}>No weekly time goals enabled</div>
                          <div className="dashboardDelta dashboardSummaryFoot" id="dashboardActivityWeeklyGoalsProgressText">0% logged this week</div>
                        </section>
                      </aside>
                    </div>
                    <div className="dashboardActivityOverviewBody">
                      <div className="dashboardActivityChartPanel">
                        <div className="dashboardActivityChartWrap" id="dashboardActivityChartWrap">
                          <svg className="dashboardActivityChart" id="dashboardActivityChart" viewBox="0 0 720 320" preserveAspectRatio="none" role="img" aria-label="Current week activity chart" focusable="false">
                            <g id="dashboardActivityChartGrid" />
                            <g id="dashboardActivityPreviousBars" />
                            <g id="dashboardActivityBars" />
                            <line className="dashboardActivityGoalLine" id="dashboardActivityGoalLine" x1="0" y1="0" x2="0" y2="0" />
                          </svg>
                          <div className="dashboardActivityYAxis" id="dashboardActivityYAxis" aria-hidden="true" />
                          <div className="dashboardActivityXAxis" id="dashboardActivityXAxis" aria-hidden="true" />
                          <div className="dashboardActivityEmpty" id="dashboardActivityEmpty" hidden>
                            <p id="dashboardActivityEmptyText">No activity logged this week.</p>
                            <div className="dashboardActivityEmptyActions">
                              <button className="btn btn-accent small" type="button" data-dashboard-activity-action="tasks">Open Tasks</button>
                              <button className="btn btn-ghost small" type="button" data-dashboard-activity-action="history">History Manager</button>
                            </div>
                          </div>
                        </div>
                        <div className="dashboardActivityDayDetail" id="dashboardActivityDayDetail" hidden>
                          <div className="dashboardActivityDayDetailHead">
                            <div>
                              <div className="dashboardActivityDetailTitle" id="dashboardActivityDetailTitle">Select a day</div>
                              <p className="modalSubtext" id="dashboardActivityDetailMeta">Daily task and session breakdown</p>
                            </div>
                            <button className="iconBtn dashboardActivityDetailClose" type="button" data-dashboard-activity-action="close-detail" aria-label="Close day detail" title="Close day detail">
                              &#8594;
                            </button>
                          </div>
                          <div className="dashboardActivityDetailBody" id="dashboardActivityDetailBody" />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="dashboardSupportGrid" aria-label="Dashboard insights">
                  <section className="dashboardCard dashboardSummaryCard dashboardStatCard dashboardTasksCompletedCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                    <div className="dashboardCardTitle">Task Overview</div>
                    <div className="dashboardTasksCompletedChart" id="dashboardTasksCompletedTicks" role="img" aria-label="Daily task completion status">
                      <svg
                        className="dashboardTasksCompletedSvg"
                        id="dashboardTasksCompletedSvg"
                        viewBox="0 0 380 380"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <circle className="dashboardTasksCompletedTrack" cx="190" cy="190" r="88" pathLength="100" />
                        <line className="dashboardTasksCompletedNeedle" id="dashboardTasksCompletedNeedle" x1="190" y1="136" x2="190" y2="112" />
                      </svg>
                      <div className="dashboardTasksCompletedCenter" id="dashboardTasksCompletedCenter" aria-hidden="true" />
                      <div className="dashboardTasksCompletedLabels" id="dashboardTasksCompletedLabels" aria-hidden="true" />
                    </div>
                    <div className="dashboardSummaryProgress dashboardSummaryProgressSpacer" aria-hidden="true" />
                    <div className="dashboardSummaryStatus" aria-hidden="true" />
                    <div className="dashboardDelta dashboardSummaryFoot" id="dashboardTasksCompletedMeta" style={{ display: "none" }} />
                  </section>

                    <section className="dashboardCard dashboardMomentumCard" data-dashboard-id="momentum" aria-label="Momentum overview">
                      <div className="dashboardMomentumTitleRow">
                        <div className="dashboardCardTitle">Momentum</div>
                      </div>
                      <div className="dashboardMomentumMainSection">
                        <div className="dashboardMomentumDialWrap">
                          <div className="dashboardMomentumDial" id="dashboardMomentumDial" role="img" aria-label="Momentum score">
                            <div className="dashboardMomentumScoreSummary" aria-live="polite">
                              <div className="dashboardMomentumScoreValue" id="dashboardMomentumScoreValue">0</div>
                              <div className="dashboardMomentumScoreStatus" id="dashboardMomentumScoreStatus">Low</div>
                            </div>
                            <svg className="dashboardMomentumSvg" viewBox="0 0 187 122" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                              <defs>
                                <linearGradient id="momentumGaugeGradient" x1="22" y1="50" x2="165" y2="50" gradientUnits="userSpaceOnUse">
                                  <stop offset="0%" stopColor="#8f1623" />
                                  <stop offset="12%" stopColor="#e4421f" />
                                  <stop offset="26%" stopColor="#ff7a1c" />
                                  <stop offset="42%" stopColor="#f7a625" />
                                  <stop offset="58%" stopColor="#ffd54a" />
                                  <stop offset="78%" stopColor="#cfe06f" />
                                  <stop offset="100%" stopColor="#a9d65f" />
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
                                const markerValues = [30, 60, 90];
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
                                      const tierLabel = value === 30 ? "x1.2" : value === 60 ? "x1.5" : value === 90 ? "x2.0" : "";
                                      const labelX = centerX + Math.cos(angleRad) * labelRadius;
                                      const labelY = centerY - Math.sin(angleRad) * labelRadius + (value === 60 ? 4 : 2);
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
                                              data-momentum-multiplier-threshold={value}
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
                      </div>
                      <section className="dashboardMomentumDriversSection dashboardMomentumDriversTextSection" aria-label="Momentum Drivers">
                        <ul className="dashboardMomentumDrivers dashboardMomentumDriverTextList" id="dashboardMomentumDrivers" aria-live="polite">
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Recent activity: 0/25</span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Consistency: 0/45</span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Weekly Progress: 0/20</span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText">Live Bonus: 0/10</span></li>
                        </ul>
                      </section>
                      <section className="dashboardMomentumFooterBand" aria-label="Momentum insight">
                        <p className="dashboardMomentumFooterMessage" id="dashboardMomentumFooterMessage" aria-live="polite">
                          Momentum combines recent activity, consistency, weekly progress, and live bonus into a single score.
                        </p>
                      </section>
                    </section>

                  <section className="dashboardCard dashboardAvgSessionCard" data-dashboard-id="avg-session-by-task" aria-label="Last ran by task" data-dashboard-label="Last Ran">
                    <div className="dashboardCardTitle" id="dashboardAvgSessionTitle">Last Ran</div>
                    <div className="dashboardLastRanList" id="dashboardLastRanList" aria-live="polite" />
                    <p className="dashboardAvgSessionEmpty" id="dashboardAvgSessionEmpty" style={{ display: "none" }}>
                      No tasks yet.
                    </p>
                  </section>

                  <section className="dashboardCard dashboardHeatCard" data-dashboard-id="heatmap" id="dashboardHeatCard" aria-label="Activity heatmap">
                    <div className="dashboardHeatFlipScene">
                      <div className="dashboardHeatFace dashboardHeatFaceFront" id="dashboardHeatFaceFront" aria-hidden="false">
                        <div className="dashboardCardTitle">Focus Heatmap</div>
                        <div className="dashboardHeatHeaderRow">
                          <div className="dashboardHeatMonthLabel" id="dashboardHeatMonthLabel" aria-live="polite" />
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
              </div>
            </div>
            <div className="dashboardRefreshBusyOverlay" id="dashboardRefreshBusyOverlay" aria-hidden="true" tabIndex={-1}>
              <div className="dashboardRefreshBusyPanel" role="status" aria-live="polite" aria-atomic="true">
                <h2 className="sr-only">Refreshing</h2>
                <p className="modalSubtext confirmText" id="dashboardRefreshBusyText">Refreshing...</p>
                <div className="dashboardRefreshBusyProgress" aria-hidden="true">
                  <span className="dashboardRefreshBusyProgressBar" />
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
