"use client";

import AppImg from "@/components/AppImg";

type Props = { active: boolean };

export default function ExecutivePageContent({ active }: Props) {
  return (
    <section className={`appPage${active ? " appPageOn" : ""}`} id="appPageExecutive" aria-label="Executive page">
      <div className="executiveShell">
        <header className="executiveHeader">
          <div>
            <h1>Executive Function</h1>
            <p className="executiveHeaderSummary">Today&apos;s decisions, next action, and plan health in one place.</p>
          </div>
          <div className="executiveTodayMarker" aria-label="Today">
            <span>Today</span>
            <strong id="executiveTodayDate">Current plan</strong>
          </div>
        </header>

        <div className="executiveTodayHealth" aria-label="Today and plan health">
          <div className="executiveMetricCard executiveMetricPlanHealth" data-executive-metric-helper-card="plan-health" role="button" tabIndex={0} aria-describedby="executiveMetricHelperPlanHealth" aria-expanded="false"><span className="executiveMetricIcon"><AppImg src="/icons/icons_default/health.webp" alt="" aria-hidden="true" /></span><span className="executiveMetricCopy"><span>Plan health</span><strong id="executivePlanHealth">Loading</strong></span><span className="executiveMetricHelper" id="executiveMetricHelperPlanHealth" role="tooltip" aria-hidden="true"><strong>Plan health compares your remaining estimated work with today&apos;s capacity.</strong><ul><li><b className="executivePlanHealthRealistic">Realistic:</b> work is within capacity.</li><li><b className="executivePlanHealthSlightlyOverloaded">Slightly overloaded:</b> work exceeds capacity, up to 150% of its maximum.</li><li><b className="executivePlanHealthSignificantlyOverloaded">Significantly overloaded:</b> work is more than 150% of maximum capacity.</li><li><b>Insufficient data:</b> there are no active tasks, or every active task lacks an estimate.</li></ul></span></div>
          <div className="executiveMetricCard" data-executive-metric-helper-card="remaining-capacity" role="button" tabIndex={0} aria-describedby="executiveMetricHelperRemainingCapacity" aria-expanded="false"><span className="executiveMetricIcon"><AppImg src="/icons/icons_default/capacity.webp" alt="" aria-hidden="true" /></span><span className="executiveMetricCopy"><span>Remaining capacity</span><strong id="executiveCapacityRange">Loading</strong></span><span className="executiveMetricHelper" id="executiveMetricHelperRemainingCapacity" role="tooltip" aria-hidden="true"><strong>Your workable time left today.</strong><span>TaskLaunch starts with your manual capacity setting or recent focus history, preferring matching weekdays when enough history exists. It caps that range to your available focus window, then subtracts work completed today.</span></span></div>
          <div className="executiveMetricCard" data-executive-metric-helper-card="capacity-confidence" role="button" tabIndex={0} aria-describedby="executiveMetricHelperCapacityConfidence" aria-expanded="false"><span className="executiveMetricIcon"><AppImg src="/icons/icons_default/confidence.webp" alt="" aria-hidden="true" /></span><span className="executiveMetricCopy"><span>Capacity confidence</span><strong id="executiveCapacityConfidence">Loading</strong></span><span className="executiveMetricHelper" id="executiveMetricHelperCapacityConfidence" role="tooltip" aria-hidden="true"><strong>How dependable the capacity estimate is.</strong><ul><li><b className="executiveCapacityConfidenceHigh">High:</b> at least 14 valid history days with stable results.</li><li><b className="executiveCapacityConfidenceMedium">Medium:</b> matching-weekday or rolling history is available, but is limited or variable.</li><li><b className="executiveCapacityConfidenceLow">Low:</b> there is not enough history, so the default range is used.</li></ul></span></div>
          <div className="executiveMetricCard" data-executive-metric-helper-card="work-remaining" role="button" tabIndex={0} aria-describedby="executiveMetricHelperWorkRemaining" aria-expanded="false"><span className="executiveMetricIcon"><AppImg src="/icons/icons_default/work_remaining.webp" alt="" aria-hidden="true" /></span><span className="executiveMetricCopy"><span>Work remaining</span><strong id="executiveWorkRemaining">Loading</strong></span><span className="executiveMetricHelper" id="executiveMetricHelperWorkRemaining" role="tooltip" aria-hidden="true">The total scheduled task time still outstanding for today.</span></div>
        </div>

        <div className="executiveDecisionFlow">
          <section className="executiveCard executiveNbaCard dashboardNextBestActionCard" id="dashboardNextBestActionCard" aria-label="Next best action" data-next-best-action-state="loading">
            <div className="executiveSectionHeading">
              <div>
                <p className="executiveEyebrow">Next best action</p>
                <div className="dashboardNextBestActionTimeLabel" id="dashboardNextBestActionTimeLabel">Available time</div>
                <select id="dashboardNextBestActionTimeSelect" defaultValue="any" aria-label="Available time for next best action" hidden>
                  <option value="10">10m</option><option value="20">20m</option><option value="30">30m</option><option value="60">60m</option><option value="any">Any</option>
                </select>
                <div className="dashboardNextBestActionTimePills" role="group" aria-labelledby="dashboardNextBestActionTimeLabel">
                  <button className="dashboardNextBestActionTimePill" type="button" data-next-best-action-time="10" aria-pressed="false">10m</button>
                  <button className="dashboardNextBestActionTimePill" type="button" data-next-best-action-time="20" aria-pressed="false">20m</button>
                  <button className="dashboardNextBestActionTimePill" type="button" data-next-best-action-time="30" aria-pressed="false">30m</button>
                  <button className="dashboardNextBestActionTimePill" type="button" data-next-best-action-time="60" aria-pressed="false">60m</button>
                  <button className="dashboardNextBestActionTimePill" type="button" data-next-best-action-time="any" aria-pressed="true">Any</button>
                </div>
              </div>
            </div>
            <div className="executiveNbaOrb" aria-hidden="true"><span /></div>
            <div className="dashboardNextBestActionStatus executiveStatus" id="dashboardNextBestActionStatus" role="status" aria-live="polite">Loading your next best action...</div>
            <div className="dashboardNextBestActionContent executiveNbaContent" id="dashboardNextBestActionContent" hidden aria-hidden="true">
              <h3 className="dashboardNextBestActionTitle" id="dashboardNextBestActionTitle" />
              <p className="dashboardNextBestActionFirstAction" id="dashboardNextBestActionFirstAction" />
              <p className="dashboardNextBestActionExplanation"><strong>Why this?</strong> <span id="dashboardNextBestActionExplanation" /></p>
              <div className="dashboardNextBestActionActions" aria-label="Next Best Action actions">
                <button className="btn btn-accent dashboardStartNowButton" type="button" data-next-best-action="start" data-next-best-action-action="start" disabled><AppImg className="dashboardStartNowButtonIcon" src="/icons/icons_default/launch_black.webp" alt="" aria-hidden="true" /><span className="dashboardStartNowButtonLabel">LAUNCH</span></button>
                <button className="btn btn-ghost" type="button" data-next-best-action="alternative" data-next-best-action-action="alternative" disabled>Alternative</button>
                <button className="btn btn-ghost" type="button" data-next-best-action="dismiss" data-next-best-action-action="dismiss" disabled>Not now</button>
              </div>
            </div>
            <div className="dashboardNextBestActionEmpty" id="dashboardNextBestActionEmpty" hidden aria-hidden="true">No eligible task is ready right now.</div>
            <div className="dashboardNextBestActionError" id="dashboardNextBestActionError" hidden aria-hidden="true">This recommendation is unavailable right now.</div>
            <button className="btn btn-ghost dashboardNextBestActionRetry" id="dashboardNextBestActionRetry" type="button" hidden>Retry</button>
          </section>

          <div className="executiveAttentionStack" aria-labelledby="executiveAttentionHeading">
            <h2 id="executiveAttentionHeading">Needs attention</h2>
            <section className="executiveCard executiveAttentionCard dashboardScheduleRepairCard" id="dashboardScheduleRepairCard" aria-label="Schedule repair" data-schedule-repair-state="loading">
              <div className="executiveSectionHeading"><div><p className="executiveEyebrow">Schedule repair</p><h3>Review plan changes</h3></div><button className="btn btn-accent" type="button" data-schedule-repair="review" hidden>Review repair</button></div>
              <div className="dashboardScheduleRepairStatus executiveStatus" id="dashboardScheduleRepairStatus" role="status" aria-live="polite">Checking today&apos;s schedule...</div>
              <div className="dashboardScheduleRepairSummary" id="dashboardScheduleRepairSummary" hidden aria-hidden="true"><strong id="dashboardScheduleRepairSummaryTitle" /><span id="dashboardScheduleRepairSummaryDetails" /></div>
              <button className="btn btn-ghost dashboardScheduleRepairRetry" type="button" data-schedule-repair="refresh" hidden>Try again</button>
            </section>

            <section className="executiveCard executiveRecoveryCard dashboardRecoveryCard" id="dashboardRecoveryCard" aria-label="Recovery Mode recommendation" data-recovery-state="idle">
              <div className="executiveSectionHeading"><div><p className="executiveEyebrow">Recovery</p><h3 id="executiveRecoveryHeading">Reset the plan</h3></div><button className="btn btn-ghost" type="button" data-recovery="open">Open Recovery Mode</button></div>
              <div className="dashboardRecoveryStatus executiveStatus" id="dashboardRecoveryStatus" role="status" aria-live="polite" />
              <div className="dashboardRecoverySummary" id="dashboardRecoverySummary" hidden aria-hidden="true"><strong id="dashboardRecoverySummaryTitle" /><span id="dashboardRecoverySummaryDetails" /></div>
              <button className="btn btn-ghost dashboardRecoveryRetry" type="button" data-recovery="refresh" hidden>Try again</button>
            </section>
          </div>

          <section className="executiveTools" aria-labelledby="executiveToolsHeading">
            <div className="executiveToolsHeading"><p className="executiveEyebrow">Executive tools</p><h2 id="executiveToolsHeading">Adjust the plan</h2><p>Powerful actions to optimize your plan and performance.</p></div>
            <div className="executiveToolLinks"><button className="btn btn-ghost executiveToolLink" type="button" data-schedule-repair="review"><AppImg src="/icons/icons_default/optimise.webp" alt="" aria-hidden="true" /><span>Repair today&apos;s plan</span><i aria-hidden="true">&gt;</i></button><button className="btn btn-ghost executiveToolLink" type="button" data-recovery="open"><AppImg src="/icons/icons_default/reset.webp" alt="" aria-hidden="true" /><span>Recovery Mode</span><i aria-hidden="true">&gt;</i></button><button className="btn btn-ghost executiveToolLink" type="button" data-daily-capacity="adjust"><AppImg src="/icons/icons_default/preferences.webp" alt="" aria-hidden="true" /><span>Adjust capacity</span><i aria-hidden="true">&gt;</i></button><a className="btn btn-ghost executiveToolLink" href="/brain-dump"><AppImg src="/icons/icons_default/executive.webp" alt="" aria-hidden="true" /><span>Brain Dump</span><i aria-hidden="true">&gt;</i></a></div>
          </section>
        </div>

        <div className="dashboardDailyCapacityCard executiveCapacityServiceHost" id="dashboardDailyCapacityCard" data-daily-capacity-state="loading" hidden aria-hidden="true">
          <div className="dashboardDailyCapacityStatus" id="dashboardDailyCapacityStatus" role="status" aria-live="polite">Loading today&apos;s capacity...</div>
          <div className="dashboardDailyCapacityContent" id="dashboardDailyCapacityContent">
            <strong className="dashboardDailyCapacityRange" id="dashboardDailyCapacityRange">Loading</strong>
            <span className="dashboardDailyCapacityState" id="dashboardDailyCapacityState">Loading</span>
            <span className="dashboardDailyCapacityConfidence" id="dashboardDailyCapacityConfidence">Confidence: low</span>
            <p className="dashboardDailyCapacityExplanation" id="dashboardDailyCapacityExplanation">TaskLaunch will personalise this estimate as more session history becomes available.</p>
          </div>
          <button className="btn btn-ghost dashboardDailyCapacityRetry" id="dashboardDailyCapacityRetry" type="button" data-daily-capacity="refresh" hidden>Try again</button>
        </div>

        <div className="overlay primitiveSciFiModalOverlay dashboardDailyCapacityAdjustPrimitiveOverlay" id="dashboardDailyCapacityAdjustOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardDailyCapacityAdjustPrimitiveModal modalConfirmation" role="dialog" aria-modal="true" aria-label="Adjust today&apos;s capacity" aria-describedby="dashboardDailyCapacityAdjustDescription"><h2 className="modalTitle dashboardDailyCapacityAdjustPrimitiveHeader">Adjust today&apos;s capacity</h2><div className="dashboardDailyCapacityAdjustPrimitiveBody"><p className="modalSubtext confirmText" id="dashboardDailyCapacityAdjustDescription">How much can you realistically take on today?</p><div className="dashboardDailyCapacityAdjustStates" role="group" aria-label="Capacity state"><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="REDUCED">Reduced</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="LIGHT">Light</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="STANDARD">Standard</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="STRONG">Strong</button></div><label className="dashboardDailyCapacityCustomMinutes" htmlFor="dashboardDailyCapacityCustomMinutesInput">Custom time<input id="dashboardDailyCapacityCustomMinutesInput" type="number" min="1" max="1440" step="1" inputMode="numeric" placeholder="45" /><span>minutes</span></label><p className="modalDropdownHelp">This changes today&apos;s planning only and will not affect your history.</p><p className="dashboardDailyCapacityAdjustError" id="dashboardDailyCapacityAdjustError" role="alert" hidden /></div><div className="confirmBtns dashboardDailyCapacityAdjustPrimitiveFooter"><button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" data-daily-capacity="close">Cancel</button><button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" data-daily-capacity="clear">Use estimate</button><button className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitivePrimaryAction" type="button" data-daily-capacity="apply">Apply</button></div></div></div>

        <div className="overlay" id="dashboardScheduleRepairOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardScheduleRepairModal" role="dialog" aria-modal="true" aria-label="Review schedule repair" aria-describedby="dashboardScheduleRepairDescription"><h2 className="modalTitle">Review schedule repair</h2><p className="modalSubtext" id="dashboardScheduleRepairDescription">Select the suggestions that should be considered. Nothing changes until you explicitly apply a repair.</p><div className="dashboardScheduleRepairModalStatus" id="dashboardScheduleRepairModalStatus" role="status" aria-live="polite" /><div className="dashboardScheduleRepairActionList" id="dashboardScheduleRepairActionList" aria-label="Proposed schedule repair actions" /><div className="confirmBtns"><button className="btn btn-ghost" type="button" data-schedule-repair="close">Close</button><button className="btn btn-ghost" type="button" data-schedule-repair="dismiss">Dismiss proposal</button><button className="btn btn-ghost" type="button" data-schedule-repair="refresh">Refresh proposal</button><button className="btn btn-accent" type="button" data-schedule-repair="apply">Apply selected</button><button className="btn btn-warn" type="button" data-schedule-repair="undo" hidden>Undo applied repair</button></div></div></div>

        <div className="overlay" id="dashboardRecoveryOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardRecoveryModal" role="dialog" aria-modal="true" aria-label="Recovery Mode" aria-describedby="dashboardRecoveryDescription"><h2 className="modalTitle">Let&apos;s reset the plan</h2><p className="modalSubtext" id="dashboardRecoveryDescription">Start from where you are. Nothing changes until you explicitly confirm it.</p><div className="dashboardRecoveryStages" aria-label="Recovery stages"><span className="dashboardRecoveryStage is-active">1. What matters now</span><span className="dashboardRecoveryStage">2. What can wait</span><span className="dashboardRecoveryStage">3. Restart</span></div><div className="dashboardRecoveryModalStatus" id="dashboardRecoveryModalStatus" role="status" aria-live="polite" /><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryRestartHeading"><h3 id="dashboardRecoveryRestartHeading">Start here</h3><div className="dashboardRecoveryRestart" id="dashboardRecoveryRestart" /></section><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryAttentionHeading"><h3 id="dashboardRecoveryAttentionHeading">Needs attention</h3><div className="dashboardRecoveryActionList" id="dashboardRecoveryAttentionList" /></section><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryFlexibleHeading"><h3 id="dashboardRecoveryFlexibleHeading">Can wait</h3><div className="dashboardRecoveryActionList" id="dashboardRecoveryFlexibleList" /></section><div className="confirmBtns"><button className="btn btn-ghost" type="button" data-recovery="close">Keep current plan</button><button className="btn btn-ghost" type="button" data-recovery="dismiss">Dismiss</button><button className="btn btn-ghost" type="button" data-recovery="refresh">Refresh</button><button className="btn btn-accent" type="button" data-recovery="apply">Apply selected changes</button><button className="btn btn-warn" type="button" data-recovery="undo" hidden>Undo applied changes</button><button className="btn btn-ghost" type="button" data-recovery="complete">Finish recovery</button></div></div></div>
      </div>
    </section>
  );
}
