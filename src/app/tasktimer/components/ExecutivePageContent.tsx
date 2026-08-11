"use client";

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
          <div><span>Plan health</span><strong id="executivePlanHealth">Loading</strong></div>
          <div><span>Remaining capacity</span><strong id="executiveCapacityRange">Loading</strong></div>
          <div><span>Work remaining</span><strong id="executiveWorkRemaining">Loading</strong></div>
        </div>

        <div className="executiveDecisionFlow">
          <section className="executiveCard executiveNbaCard dashboardNextBestActionCard" id="dashboardNextBestActionCard" aria-label="Next best action" data-next-best-action-state="loading">
            <div className="executiveSectionHeading">
              <div><p className="executiveEyebrow">Next best action</p></div>
              <label className="dashboardNextBestActionTimeLabel" htmlFor="dashboardNextBestActionTimeSelect">Available time
                <select id="dashboardNextBestActionTimeSelect" defaultValue="any" aria-label="Available time for next best action">
                  <option value="10">10m</option><option value="20">20m</option><option value="30">30m</option><option value="60">60m</option><option value="any">Any</option>
                </select>
              </label>
            </div>
            <div className="dashboardNextBestActionStatus executiveStatus" id="dashboardNextBestActionStatus" role="status" aria-live="polite">Loading your next best action...</div>
            <div className="dashboardNextBestActionContent executiveNbaContent" id="dashboardNextBestActionContent" hidden aria-hidden="true">
              <h3 className="dashboardNextBestActionTitle" id="dashboardNextBestActionTitle" />
              <p className="dashboardNextBestActionFirstAction" id="dashboardNextBestActionFirstAction" />
              <div className="dashboardNextBestActionMeta" aria-label="Recommendation details"><span id="dashboardNextBestActionDuration" /><span id="dashboardNextBestActionConfidence" /></div>
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
            <div className="dashboardNextBestActionError" id="dashboardNextBestActionError" hidden aria-hidden="true">This recommendation is unavailable right now.</div>
            <button className="btn btn-ghost dashboardNextBestActionRetry" id="dashboardNextBestActionRetry" type="button" hidden>Retry</button>
          </section>

          <section className="executiveCard executivePlanCard dashboardDailyExecutiveBriefCard" id="dashboardDailyExecutiveBriefCard" aria-labelledby="executivePlanHeading" data-daily-executive-brief-state="loading">
            <div className="executiveSectionHeading"><div><p className="executiveEyebrow">Today&apos;s plan</p><h2 id="executivePlanHeading">What today looks like</h2></div><button className="btn btn-ghost" type="button" data-daily-executive-brief="refresh">Refresh</button></div>
            <div className="executivePlanBody">
              <div className="executivePlanMain">
                <div className="dashboardDailyExecutiveBriefStatus executiveStatus" id="dashboardDailyExecutiveBriefStatus" role="status" aria-live="polite">Loading your daily brief...</div>
                <div className="dashboardDailyExecutiveBriefContent" id="dashboardDailyExecutiveBriefContent">
                  <div className="dashboardDailyExecutiveBriefHealth executivePlanHealth" id="dashboardDailyExecutiveBriefHealth" data-plan-health="INSUFFICIENT_DATA" />
                  <p className="dashboardDailyExecutiveBriefSummary" id="dashboardDailyExecutiveBriefSummary" />
                  <div className="dashboardDailyExecutiveBriefFacts executiveFacts" aria-label="Daily plan facts"><span id="dashboardDailyExecutiveBriefWorkload" /><span id="dashboardDailyExecutiveBriefRange" /><span id="dashboardDailyExecutiveBriefDeadline" /></div>
                  <div className="dashboardDailyExecutiveBriefAction" id="dashboardDailyExecutiveBriefAction" hidden aria-hidden="true"><strong>Start with</strong><span id="dashboardDailyExecutiveBriefActionTitle" /><span id="dashboardDailyExecutiveBriefActionFirstStep" /><button className="btn btn-accent" type="button" data-daily-executive-brief="start" disabled>Start now</button></div>
                  <div className="dashboardDailyExecutiveBriefAdjustments" id="dashboardDailyExecutiveBriefAdjustments" hidden aria-hidden="true" />
                </div>
              </div>
              <aside className="executiveCapacityCard dashboardDailyCapacityCard" id="dashboardDailyCapacityCard" aria-labelledby="executiveCapacityHeading" data-daily-capacity-state="loading">
                <div className="executiveCompactHeading"><p className="executiveEyebrow">Capacity</p><h3 id="executiveCapacityHeading">What fits</h3></div>
                <div className="dashboardDailyCapacityStatus executiveStatus" id="dashboardDailyCapacityStatus" role="status" aria-live="polite">Loading today&apos;s capacity...</div>
                <div className="dashboardDailyCapacityContent executiveCapacityContent" id="dashboardDailyCapacityContent"><strong className="dashboardDailyCapacityRange" id="dashboardDailyCapacityRange">30-60 min remaining</strong><span className="dashboardDailyCapacityState" id="dashboardDailyCapacityState">Standard</span><details className="executiveDisclosure"><summary id="dashboardDailyCapacityConfidence">Confidence: low</summary><p className="dashboardDailyCapacityExplanation" id="dashboardDailyCapacityExplanation">TaskLaunch will personalise this estimate as more session history becomes available.</p></details></div>
                <button className="btn btn-ghost dashboardDailyCapacityRetry" id="dashboardDailyCapacityRetry" type="button" data-daily-capacity="refresh" hidden>Try again</button>
              </aside>
            </div>
            <button className="btn btn-ghost dashboardDailyExecutiveBriefRetry" id="dashboardDailyExecutiveBriefRetry" type="button" data-daily-executive-brief="refresh" hidden>Try again</button>
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
            <div><p className="executiveEyebrow">Executive tools</p><h2 id="executiveToolsHeading">Adjust the plan</h2></div>
            <div className="executiveToolLinks"><button className="btn btn-ghost" type="button" data-schedule-repair="review">Repair today&apos;s plan</button><button className="btn btn-ghost" type="button" data-recovery="open">Recovery Mode</button><button className="btn btn-ghost" type="button" data-daily-capacity="adjust">Adjust capacity</button><a className="btn btn-ghost" href="/brain-dump">Brain Dump</a></div>
          </section>
        </div>

        <div className="overlay primitiveSciFiModalOverlay dashboardDailyCapacityAdjustPrimitiveOverlay" id="dashboardDailyCapacityAdjustOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardDailyCapacityAdjustPrimitiveModal modalConfirmation" role="dialog" aria-modal="true" aria-label="Adjust today&apos;s capacity" aria-describedby="dashboardDailyCapacityAdjustDescription"><h2 className="modalTitle dashboardDailyCapacityAdjustPrimitiveHeader">Adjust today&apos;s capacity</h2><div className="dashboardDailyCapacityAdjustPrimitiveBody"><p className="modalSubtext confirmText" id="dashboardDailyCapacityAdjustDescription">How much can you realistically take on today?</p><div className="dashboardDailyCapacityAdjustStates" role="group" aria-label="Capacity state"><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="REDUCED">Reduced</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="LIGHT">Light</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="STANDARD">Standard</button><button className="btn btn-ghost primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" aria-pressed="false" data-daily-capacity-state-option="STRONG">Strong</button></div><label className="dashboardDailyCapacityCustomMinutes" htmlFor="dashboardDailyCapacityCustomMinutesInput">Custom time<input id="dashboardDailyCapacityCustomMinutesInput" type="number" min="1" max="1440" step="1" inputMode="numeric" placeholder="45" /><span>minutes</span></label><p className="modalDropdownHelp">This changes today&apos;s planning only and will not affect your history.</p><p className="dashboardDailyCapacityAdjustError" id="dashboardDailyCapacityAdjustError" role="alert" hidden /></div><div className="confirmBtns dashboardDailyCapacityAdjustPrimitiveFooter"><button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" data-daily-capacity="close">Cancel</button><button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitiveSecondaryAction" type="button" data-daily-capacity="clear">Use estimate</button><button className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction dashboardDailyCapacityAdjustPrimitiveAction dashboardDailyCapacityAdjustPrimitivePrimaryAction" type="button" data-daily-capacity="apply">Apply</button></div></div></div>

        <div className="overlay" id="dashboardScheduleRepairOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardScheduleRepairModal" role="dialog" aria-modal="true" aria-label="Review schedule repair" aria-describedby="dashboardScheduleRepairDescription"><h2 className="modalTitle">Review schedule repair</h2><p className="modalSubtext" id="dashboardScheduleRepairDescription">Select the suggestions that should be considered. Nothing changes until you explicitly apply a repair.</p><div className="dashboardScheduleRepairModalStatus" id="dashboardScheduleRepairModalStatus" role="status" aria-live="polite" /><div className="dashboardScheduleRepairActionList" id="dashboardScheduleRepairActionList" aria-label="Proposed schedule repair actions" /><div className="confirmBtns"><button className="btn btn-ghost" type="button" data-schedule-repair="close">Close</button><button className="btn btn-ghost" type="button" data-schedule-repair="dismiss">Dismiss proposal</button><button className="btn btn-ghost" type="button" data-schedule-repair="refresh">Refresh proposal</button><button className="btn btn-accent" type="button" data-schedule-repair="apply">Apply selected</button><button className="btn btn-warn" type="button" data-schedule-repair="undo" hidden>Undo applied repair</button></div></div></div>

        <div className="overlay" id="dashboardRecoveryOverlay" style={{ display: "none" }} aria-hidden="true"><div className="modal dashboardRecoveryModal" role="dialog" aria-modal="true" aria-label="Recovery Mode" aria-describedby="dashboardRecoveryDescription"><h2 className="modalTitle">Let&apos;s reset the plan</h2><p className="modalSubtext" id="dashboardRecoveryDescription">Start from where you are. Nothing changes until you explicitly confirm it.</p><div className="dashboardRecoveryStages" aria-label="Recovery stages"><span className="dashboardRecoveryStage is-active">1. What matters now</span><span className="dashboardRecoveryStage">2. What can wait</span><span className="dashboardRecoveryStage">3. Restart</span></div><div className="dashboardRecoveryModalStatus" id="dashboardRecoveryModalStatus" role="status" aria-live="polite" /><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryRestartHeading"><h3 id="dashboardRecoveryRestartHeading">Start here</h3><div className="dashboardRecoveryRestart" id="dashboardRecoveryRestart" /></section><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryAttentionHeading"><h3 id="dashboardRecoveryAttentionHeading">Needs attention</h3><div className="dashboardRecoveryActionList" id="dashboardRecoveryAttentionList" /></section><section className="dashboardRecoverySection" aria-labelledby="dashboardRecoveryFlexibleHeading"><h3 id="dashboardRecoveryFlexibleHeading">Can wait</h3><div className="dashboardRecoveryActionList" id="dashboardRecoveryFlexibleList" /></section><div className="confirmBtns"><button className="btn btn-ghost" type="button" data-recovery="close">Keep current plan</button><button className="btn btn-ghost" type="button" data-recovery="dismiss">Dismiss</button><button className="btn btn-ghost" type="button" data-recovery="refresh">Refresh</button><button className="btn btn-accent" type="button" data-recovery="apply">Apply selected changes</button><button className="btn btn-warn" type="button" data-recovery="undo" hidden>Undo applied changes</button><button className="btn btn-ghost" type="button" data-recovery="complete">Finish recovery</button></div></div></div>
      </div>
    </section>
  );
}
