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
                  <section className="dashboardCard dashboardDailyCapacityCard" id="dashboardDailyCapacityCard" aria-label="Today's capacity" data-daily-capacity-state="loading">
                    <div className="dashboardPanelLabelRow">
                      <h2 className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                        <span>Today&apos;s capacity</span>
                      </h2>
                      <div className="dashboardDailyCapacityActions">
                        <button className="btn btn-ghost" type="button" id="dashboardDailyCapacityRefresh" data-daily-capacity="refresh">Refresh</button>
                        <button className="btn btn-ghost" type="button" id="dashboardDailyCapacityAdjust" data-daily-capacity="adjust">Adjust today</button>
                      </div>
                    </div>
                    <div className="dashboardDailyCapacityStatus" id="dashboardDailyCapacityStatus" role="status" aria-live="polite">Loading today&apos;s capacity...</div>
                    <div className="dashboardDailyCapacityContent" id="dashboardDailyCapacityContent">
                      <strong className="dashboardDailyCapacityRange" id="dashboardDailyCapacityRange">30-60 min remaining</strong>
                      <span className="dashboardDailyCapacityState" id="dashboardDailyCapacityState">Standard</span>
                      <span className="dashboardDailyCapacityConfidence" id="dashboardDailyCapacityConfidence">Confidence: low</span>
                      <p className="dashboardDailyCapacityExplanation" id="dashboardDailyCapacityExplanation">TaskLaunch will personalise this estimate as more session history becomes available.</p>
                    </div>
                    <button className="btn btn-ghost dashboardDailyCapacityRetry" id="dashboardDailyCapacityRetry" type="button" data-daily-capacity="refresh" hidden>Try again</button>
                  </section>
                  <div className="overlay" id="dashboardDailyCapacityAdjustOverlay" style={{ display: "none" }} aria-hidden="true">
                    <div className="modal" role="dialog" aria-modal="true" aria-label="Adjust today&apos;s capacity" aria-describedby="dashboardDailyCapacityAdjustDescription">
                      <h2 className="modalTitle">Adjust today&apos;s capacity</h2>
                      <p className="modalSubtext" id="dashboardDailyCapacityAdjustDescription">How much can you realistically take on today?</p>
                      <div className="dashboardDailyCapacityAdjustStates" role="group" aria-label="Capacity state">
                        <button className="btn btn-ghost" type="button" aria-pressed="false" data-daily-capacity-state-option="REDUCED">Reduced</button>
                        <button className="btn btn-ghost" type="button" aria-pressed="false" data-daily-capacity-state-option="LIGHT">Light</button>
                        <button className="btn btn-ghost" type="button" aria-pressed="false" data-daily-capacity-state-option="STANDARD">Standard</button>
                        <button className="btn btn-ghost" type="button" aria-pressed="false" data-daily-capacity-state-option="STRONG">Strong</button>
                      </div>
                      <label className="dashboardDailyCapacityCustomMinutes" htmlFor="dashboardDailyCapacityCustomMinutesInput">
                        Custom time
                        <input id="dashboardDailyCapacityCustomMinutesInput" type="number" min="1" max="1440" step="1" inputMode="numeric" placeholder="45" />
                        <span>minutes</span>
                      </label>
                      <p className="modalDropdownHelp">This changes today&apos;s planning only and will not affect your history.</p>
                      <p className="dashboardDailyCapacityAdjustError" id="dashboardDailyCapacityAdjustError" role="alert" hidden />
                      <div className="confirmBtns">
                        <button className="btn btn-ghost" type="button" data-daily-capacity="close">Cancel</button>
                        <button className="btn btn-ghost" type="button" data-daily-capacity="clear">Use estimate</button>
                        <button className="btn btn-accent" type="button" data-daily-capacity="apply">Apply</button>
                      </div>
                    </div>
                  </div>
                  <section className="dashboardCard dashboardDailyExecutiveBriefCard" id="dashboardDailyExecutiveBriefCard" aria-label="Daily Executive Brief" data-daily-executive-brief-state="loading">
                    <div className="dashboardPanelLabelRow">
                      <h2 className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                        <span>Daily Executive Brief</span>
                      </h2>
                      <div className="dashboardDailyExecutiveBriefHeaderActions">
                        <label className="dashboardDailyExecutiveBriefTimeLabel" htmlFor="dashboardDailyExecutiveBriefTimeSelect">Available time
                          <select id="dashboardDailyExecutiveBriefTimeSelect" defaultValue="any" aria-label="Available time for daily brief">
                            <option value="15">15m</option>
                            <option value="30">30m</option>
                            <option value="60">60m</option>
                            <option value="90">90m</option>
                            <option value="any">Any</option>
                          </select>
                        </label>
                        <button className="btn btn-ghost" type="button" id="dashboardDailyExecutiveBriefRefresh" data-daily-executive-brief="refresh">Refresh</button>
                        <button className="btn btn-ghost" type="button" id="dashboardDailyExecutiveBriefToggle" data-daily-executive-brief="toggle" aria-expanded="true" aria-controls="dashboardDailyExecutiveBriefContent">Collapse</button>
                      </div>
                    </div>
                    <div className="dashboardDailyExecutiveBriefStatus" id="dashboardDailyExecutiveBriefStatus" role="status" aria-live="polite">Loading your daily brief...</div>
                    <div className="dashboardDailyExecutiveBriefContent" id="dashboardDailyExecutiveBriefContent">
                      <div className="dashboardDailyExecutiveBriefHealth" id="dashboardDailyExecutiveBriefHealth" data-plan-health="INSUFFICIENT_DATA" />
                      <p className="dashboardDailyExecutiveBriefSummary" id="dashboardDailyExecutiveBriefSummary" />
                      <div className="dashboardDailyExecutiveBriefFacts" aria-label="Daily plan facts">
                        <span id="dashboardDailyExecutiveBriefWorkload" />
                        <span id="dashboardDailyExecutiveBriefRange" />
                        <span id="dashboardDailyExecutiveBriefDeadline" />
                      </div>
                      <div className="dashboardDailyExecutiveBriefAction" id="dashboardDailyExecutiveBriefAction" hidden aria-hidden="true">
                        <strong>Start with</strong>
                        <span id="dashboardDailyExecutiveBriefActionTitle" />
                        <span id="dashboardDailyExecutiveBriefActionFirstStep" />
                        <button className="btn btn-accent" type="button" data-daily-executive-brief="start" disabled>Start now</button>
                      </div>
                      <div className="dashboardDailyExecutiveBriefAdjustments" id="dashboardDailyExecutiveBriefAdjustments" hidden aria-hidden="true" />
                    </div>
                    <button className="btn btn-ghost dashboardDailyExecutiveBriefRetry" id="dashboardDailyExecutiveBriefRetry" type="button" data-daily-executive-brief="refresh" hidden>Try again</button>
                  </section>
                  <section className="dashboardCard dashboardNextBestActionCard" id="dashboardNextBestActionCard" aria-label="Next Best Action" data-next-best-action-state="loading">
                    <div className="dashboardPanelLabelRow">
                      <div className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                        <span>Next Best Action</span>
                      </div>
                      <label className="dashboardNextBestActionTimeLabel" htmlFor="dashboardNextBestActionTimeSelect">
                        Available time
                        <select id="dashboardNextBestActionTimeSelect" defaultValue="any" aria-label="Available time for next best action">
                          <option value="10">10m</option>
                          <option value="20">20m</option>
                          <option value="30">30m</option>
                          <option value="60">60m</option>
                          <option value="any">Any</option>
                        </select>
                      </label>
                    </div>
                    <div className="dashboardNextBestActionStatus" id="dashboardNextBestActionStatus" role="status" aria-live="polite">Loading your next best action...</div>
                    <div className="dashboardNextBestActionContent" id="dashboardNextBestActionContent" hidden aria-hidden="true">
                      <h3 className="dashboardNextBestActionTitle" id="dashboardNextBestActionTitle" />
                      <p className="dashboardNextBestActionFirstAction" id="dashboardNextBestActionFirstAction" />
                      <div className="dashboardNextBestActionMeta" aria-label="Recommendation details">
                        <span id="dashboardNextBestActionDuration" />
                        <span id="dashboardNextBestActionConfidence" />
                      </div>
                      <p className="dashboardNextBestActionExplanation" id="dashboardNextBestActionExplanation" />
                      <div className="dashboardNextBestActionWhy" id="dashboardNextBestActionWhy" hidden aria-hidden="true" />
                      <div className="dashboardNextBestActionActions" aria-label="Next Best Action actions">
                        <button className="btn btn-accent" type="button" data-next-best-action="start" data-next-best-action-action="start" disabled>Start now</button>
                        <button className="btn btn-ghost" type="button" data-next-best-action="alternative" data-next-best-action-action="alternative" disabled>Alternative</button>
                        <button className="btn btn-ghost" type="button" data-next-best-action="dismiss" data-next-best-action-action="dismiss" disabled>Not now</button>
                        <button className="btn btn-ghost" type="button" data-next-best-action="why" data-next-best-action-action="why" aria-expanded="false" disabled>Why this?</button>
                      </div>
                    </div>
                    <div className="dashboardNextBestActionEmpty" id="dashboardNextBestActionEmpty" hidden aria-hidden="true">No eligible task is ready right now.</div>
                    <div className="dashboardNextBestActionError" id="dashboardNextBestActionError" hidden aria-hidden="true">Please try again.</div>
                    <button className="btn btn-ghost dashboardNextBestActionRetry" id="dashboardNextBestActionRetry" type="button" hidden>Retry</button>
                  </section>
                  <section className="dashboardCard dashboardScheduleRepairCard" id="dashboardScheduleRepairCard" aria-label="Schedule repair" data-schedule-repair-state="loading">
                    <div className="dashboardPanelLabelRow">
                      <h2 className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                        <span>Schedule repair</span>
                      </h2>
                      <div className="dashboardScheduleRepairActions">
                        <button className="btn btn-ghost" type="button" data-schedule-repair="refresh">Refresh</button>
                        <button className="btn btn-accent" type="button" data-schedule-repair="review" hidden>Review repair</button>
                      </div>
                    </div>
                    <div className="dashboardScheduleRepairStatus" id="dashboardScheduleRepairStatus" role="status" aria-live="polite">Checking today&apos;s schedule...</div>
                    <div className="dashboardScheduleRepairSummary" id="dashboardScheduleRepairSummary" hidden aria-hidden="true">
                      <strong id="dashboardScheduleRepairSummaryTitle" />
                      <span id="dashboardScheduleRepairSummaryDetails" />
                    </div>
                    <button className="btn btn-ghost dashboardScheduleRepairRetry" type="button" data-schedule-repair="refresh" hidden>Try again</button>
                  </section>
                  <div className="overlay" id="dashboardScheduleRepairOverlay" style={{ display: "none" }} aria-hidden="true">
                    <div className="modal dashboardScheduleRepairModal" role="dialog" aria-modal="true" aria-label="Review schedule repair" aria-describedby="dashboardScheduleRepairDescription">
                      <h2 className="modalTitle">Review schedule repair</h2>
                      <p className="modalSubtext" id="dashboardScheduleRepairDescription">Select the suggestions that should be considered. Nothing changes until you explicitly apply a repair.</p>
                      <div className="dashboardScheduleRepairModalStatus" id="dashboardScheduleRepairModalStatus" role="status" aria-live="polite" />
                      <div className="dashboardScheduleRepairActionList" id="dashboardScheduleRepairActionList" aria-label="Proposed schedule repair actions" />
                      <div className="confirmBtns">
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-schedule-repair="close">Close</button>
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-schedule-repair="dismiss">Dismiss proposal</button>
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-schedule-repair="refresh">Refresh proposal</button>
                        <button className="btn btn-accent modalPreviewPrimaryAction" type="button" data-schedule-repair="apply">Apply selected</button>
                        <button className="btn btn-warn modalPreviewSecondaryAction" type="button" data-schedule-repair="undo" hidden>Undo applied repair</button>
                      </div>
                    </div>
                  </div>
                  <section className="dashboardCard dashboardRecoveryCard" id="dashboardRecoveryCard" aria-label="Recovery Mode" data-recovery-state="idle">
                    <div className="dashboardPanelLabelRow">
                      <h2 className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                        <span>Recovery Mode</span>
                      </h2>
                      <div className="dashboardRecoveryActions">
                        <button className="btn btn-accent" type="button" data-recovery="open">Open Recovery Mode</button>
                        <button className="btn btn-ghost" type="button" data-recovery="refresh">Refresh</button>
                      </div>
                    </div>
                    <div className="dashboardRecoveryStatus" id="dashboardRecoveryStatus" role="status" aria-live="polite">Recovery Mode is available whenever your plan needs a reset.</div>
                    <div className="dashboardRecoverySummary" id="dashboardRecoverySummary" hidden aria-hidden="true">
                      <strong id="dashboardRecoverySummaryTitle" />
                      <span id="dashboardRecoverySummaryDetails" />
                    </div>
                    <button className="btn btn-ghost dashboardRecoveryRetry" type="button" data-recovery="refresh" hidden>Try again</button>
                  </section>
                  <div className="overlay" id="dashboardRecoveryOverlay" style={{ display: "none" }} aria-hidden="true">
                    <div className="modal dashboardRecoveryModal" role="dialog" aria-modal="true" aria-label="Recovery Mode" aria-describedby="dashboardRecoveryDescription">
                      <h2 className="modalTitle">Let&apos;s reset the plan</h2>
                      <p className="modalSubtext" id="dashboardRecoveryDescription">Start from where you are. Nothing changes until you explicitly confirm it.</p>
                      <div className="dashboardRecoveryStages" aria-label="Recovery stages">
                        <span className="dashboardRecoveryStage is-active">1. What matters now</span>
                        <span className="dashboardRecoveryStage">2. What can wait</span>
                        <span className="dashboardRecoveryStage">3. Restart</span>
                      </div>
                      <div className="dashboardRecoveryModalStatus" id="dashboardRecoveryModalStatus" role="status" aria-live="polite" />
                      <section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryRestartHeading">
                        <h3 id="dashboardRecoveryRestartHeading">Start here</h3>
                        <div className="dashboardRecoveryRestart" id="dashboardRecoveryRestart" />
                      </section>
                      <section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryAttentionHeading">
                        <h3 id="dashboardRecoveryAttentionHeading">Needs attention</h3>
                        <div className="dashboardRecoveryActionList" id="dashboardRecoveryAttentionList" />
                      </section>
                      <section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryFlexibleHeading">
                        <h3 id="dashboardRecoveryFlexibleHeading">Can wait</h3>
                        <div className="dashboardRecoveryActionList" id="dashboardRecoveryFlexibleList" />
                      </section>
                      <div className="confirmBtns">
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-recovery="close">Keep current plan</button>
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-recovery="dismiss">Dismiss</button>
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-recovery="refresh">Refresh</button>
                        <button className="btn btn-accent modalPreviewPrimaryAction" type="button" data-recovery="apply">Apply selected changes</button>
                        <button className="btn btn-warn modalPreviewSecondaryAction" type="button" data-recovery="undo" hidden>Undo applied changes</button>
                        <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" data-recovery="complete">Finish recovery</button>
                      </div>
                    </div>
                  </div>
                  <section className="dashboardCard dashboardActivityOverviewCard" data-dashboard-id="activity-overview" data-dashboard-label="Activity Overview" aria-label="Activity overview">
                    <div className="dashboardPanelLabelRow dashboardActivityOverviewTitleRow">
                      <div className="dashboardCardTitle dashboardPanelTitle">
                        <span className="dashboardPanelTitleDot dashboardPanelTitleDotTime" aria-hidden="true" />
                        <span>Time Tracked</span>
                      </div>
                    </div>
                    <div className="dashboardActivityOverviewHead">
                      <aside className="dashboardActivitySummaryStack" aria-label="Today and weekly summaries">
                        <section className="dashboardActivitySummaryMini" aria-label="Today's logged time">
                          <div className="dashboardActivitySummaryTop">
                            <div className="dashboardCardTitle" id="dashboardActivityTodayTitle">Today</div>
                            <div className="dashboardTrendIndicator" id="dashboardActivityTodayTrendIndicator" aria-hidden="true" style={{ display: "none" }} />
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
                          <div className="dashboardDelta dashboardSummaryFoot" id="dashboardActivityWeeklyGoalsProgressText">0% of weekly goal</div>
                        </section>
                      </aside>
                    </div>
                    <div className="dashboardActivityOverviewBody">
                      <div className="dashboardActivityChartPanel">
                        <div className="dashboardActivityChartWrap" id="dashboardActivityChartWrap">
                          <button
                            className="iconBtn dashboardActivityPageBtn dashboardActivityPageBtnOlder"
                            id="dashboardActivityPageOlderBtn"
                            type="button"
                            title="Older week"
                            aria-label="Show older activity week"
                            data-dashboard-activity-page="older"
                          >
                            {"<"}
                          </button>
                          <svg className="dashboardActivityChart" id="dashboardActivityChart" viewBox="0 0 720 320" preserveAspectRatio="none" role="img" aria-label="Seven day activity chart with previous week comparison" focusable="false">
                            <g id="dashboardActivityChartGrid" />
                            <g id="dashboardActivityPreviousBars" />
                            <g id="dashboardActivityBars" />
                            <line className="dashboardActivityGoalLine" id="dashboardActivityGoalLine" x1="0" y1="0" x2="0" y2="0" />
                            <text className="dashboardActivityGoalLabel" id="dashboardActivityGoalLabel" x="0" y="0" aria-hidden="true" />
                            <text className="dashboardActivityGoalLabel dashboardActivityPreviousGoalLabel" id="dashboardActivityPreviousGoalLabel" x="0" y="0" aria-hidden="true" />
                          </svg>
                          <button
                            className="iconBtn dashboardActivityPageBtn dashboardActivityPageBtnNewer"
                            id="dashboardActivityPageNewerBtn"
                            type="button"
                            title="Newer week"
                            aria-label="Show newer activity week"
                            data-dashboard-activity-page="newer"
                            disabled
                          >
                            {">"}
                          </button>
                          <div className="dashboardActivityYAxis" id="dashboardActivityYAxis" aria-hidden="true" />
                          <div className="dashboardActivityXAxis" id="dashboardActivityXAxis" aria-hidden="true" />
                          <div className="dashboardActivityLegend" aria-hidden="true">
                            <span className="dashboardActivityLegendItem">
                              <span className="dashboardActivityLegendLine" />
                              <span className="dashboardActivityLegendLabel">Current Target</span>
                            </span>
                            <span className="dashboardActivityLegendItem">
                              <span className="dashboardActivityLegendLine dashboardActivityLegendLinePrevious" />
                              <span className="dashboardActivityLegendLabel">Previous Target</span>
                            </span>
                          </div>
                          <div className="dashboardActivityEmpty" id="dashboardActivityEmpty" hidden />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="dashboardSupportGrid" aria-label="Dashboard insights">

                    <section className="dashboardCard dashboardMomentumCard" data-dashboard-id="momentum" aria-label="Momentum overview">
                      <div className="dashboardMomentumTitleRow">
                        <div className="dashboardCardTitle dashboardPanelTitle">
                          <span className="dashboardPanelTitleDot dashboardPanelTitleDotMomentum" aria-hidden="true" />
                          <span>Momentum</span>
                        </div>
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
                                const arcStartX = 22;
                                const arcEndX = 165;
                                const arcBaseY = 79;
                                const arcRadius = 72;
                                const arcStrokeWidth = 17;
                                const markerStrokeWidth = 1.35;
                                const centerX = (arcStartX + arcEndX) / 2;
                                const centerY = arcBaseY + Math.sqrt(arcRadius * arcRadius - Math.pow((arcEndX - arcStartX) / 2, 2));
                                const markerInnerRadius = arcRadius - arcStrokeWidth / 2;
                                const markerOuterRadius = arcRadius + arcStrokeWidth / 2;
                                const arcStartAngleDeg = (Math.acos((arcStartX - centerX) / arcRadius) * 180) / Math.PI;
                                const arcEndAngleDeg = (Math.acos((arcEndX - centerX) / arcRadius) * 180) / Math.PI;
                                const arcSweepDeg = arcStartAngleDeg - arcEndAngleDeg;
                                const markerValues = [40, 70, 90];
                                const labelRadius = 46;
                                return (
                                  <g className="dashboardMomentumMarkers" aria-hidden="true">
                                    {markerValues.map((value) => {
                                      const ratio = value / 100;
                                      const angleDeg = arcStartAngleDeg - ratio * arcSweepDeg;
                                      const angleRad = (angleDeg * Math.PI) / 180;
                                      const x1 = centerX + Math.cos(angleRad) * markerInnerRadius;
                                      const y1 = centerY - Math.sin(angleRad) * markerInnerRadius;
                                      const x2 = centerX + Math.cos(angleRad) * markerOuterRadius;
                                      const y2 = centerY - Math.sin(angleRad) * markerOuterRadius;
                                      const tierLabel = value === 40 ? "x1.2" : value === 70 ? "x1.5" : value === 90 ? "x2.0" : "";
                                      const labelX = centerX + Math.cos(angleRad) * labelRadius;
                                      const labelY = centerY - Math.sin(angleRad) * labelRadius + (value === 70 ? 4 : 2);
                                      return (
                                        <g key={`momentum-marker-${value}`}>
                                          <line
                                            x1={x1}
                                            y1={y1}
                                            x2={x2}
                                            y2={y2}
                                            stroke="rgba(0, 0, 0, 0.92)"
                                            strokeWidth={markerStrokeWidth}
                                            strokeLinecap="butt"
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
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText"><span className="dashboardMomentumDriverLabel">Recent activity</span><b className="dashboardMomentumDriverValue">0 / 30</b></span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText"><span className="dashboardMomentumDriverLabel">Consistency</span><b className="dashboardMomentumDriverValue">0 / 30</b></span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText"><span className="dashboardMomentumDriverLabel">Weekly Progress</span><b className="dashboardMomentumDriverValue">0 / 35</b></span></li>
                          <li className="dashboardMomentumDriver"><span className="dashboardMomentumDriverText"><span className="dashboardMomentumDriverLabel">Live Bonus</span><b className="dashboardMomentumDriverValue">0 / 5</b></span></li>
                        </ul>
                      </section>
                      <section className="dashboardMomentumFooterBand" aria-label="Momentum insight">
                        <p className="dashboardMomentumFooterMessage" id="dashboardMomentumFooterMessage" aria-live="polite">
                          Momentum combines recent activity, consistency, weekly progress, and live bonus into a single score.
                        </p>
                      </section>
                    </section>

                    <section className="dashboardCard dashboardSummaryCard dashboardStatCard dashboardTasksCompletedCard dashboardActivityTaskOverviewCard" data-dashboard-id="tasks-completed" aria-label="Task completion">
                      <div className="dashboardPanelLabelRow">
                        <div className="dashboardCardTitle dashboardPanelTitle">
                          <span className="dashboardPanelTitleDot dashboardPanelTitleDotTask" aria-hidden="true" />
                          <span>Task Overview</span>
                        </div>
                      </div>
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

                  <section className="dashboardCard dashboardHeatCard" data-dashboard-id="heatmap" id="dashboardHeatCard" aria-label="Activity heatmap">
                    <div className="dashboardHeatFlipScene">
                      <div className="dashboardHeatFace dashboardHeatFaceFront" id="dashboardHeatFaceFront" aria-hidden="false">
                        <div className="dashboardPanelLabelRow">
                          <div className="dashboardCardTitle dashboardPanelTitle">
                            <span className="dashboardPanelTitleDot dashboardPanelTitleDotHeat" aria-hidden="true" />
                            <span>Focus Heatmap</span>
                          </div>
                        </div>
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
                            <div className="dashboardPanelLabelRow">
                              <div className="dashboardCardTitle dashboardPanelTitle">
                                <span className="dashboardPanelTitleDot dashboardPanelTitleDotHeat" aria-hidden="true" />
                                <span>Focus Heatmap</span>
                              </div>
                            </div>
                            <p className="modalSubtext" id="dashboardHeatSummaryDate">Select a day to review logged time.</p>
                          </div>
                          <button className="iconBtn dashboardHeatFlipBackBtn" id="dashboardHeatSummaryCloseBtn" type="button" title="Back to heatmap" aria-label="Back to heatmap" aria-expanded="false" data-heatmap-flip="close">
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
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
