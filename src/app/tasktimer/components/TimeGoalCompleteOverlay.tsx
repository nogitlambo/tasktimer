import React from "react";

export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <h2 id="timeGoalCompleteTitle">Task Complete</h2>
        <p className="modalSubtext" id="timeGoalCompleteText">
          This task has reached its current time goal of 1 hour per day. Please choose how you want to proceed.
        </p>
        <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
        <div className="confirmBtns timeGoalCompleteActionGrid">
          <button className="btn btn-accent" id="timeGoalCompleteSaveBtn" type="button">
            Save session at time goal and reset
          </button>
          <button className="btn btn-ghost" id="timeGoalCompleteUpdateGoalBtn" type="button">
            Update Time Goal and Continue
          </button>
          <button className="btn btn-ghost" id="timeGoalCompleteContinueNowBtn" type="button">
            Continue timing for now
          </button>
          <button className="btn btn-ghost timeGoalCompleteDiscardBtn" id="timeGoalCompleteDiscardBtn" type="button">
            Discard Session and Reset
          </button>
        </div>
        <div className="timeGoalCompleteGoalEditor" id="timeGoalCompleteGoalEditor" style={{ display: "none" }}>
          <div className="field">
            <label htmlFor="timeGoalCompleteDurationValueInput">New Time Goal</label>
            <div className="addTaskDurationRow" id="timeGoalCompleteDurationRow">
              <input id="timeGoalCompleteDurationValueInput" type="number" min={1} step={1} inputMode="numeric" defaultValue={1} />
              <div className="unitButtons addTaskDurationPills" role="group" aria-label="Task complete time goal unit">
                <button className="btn btn-ghost small unitBtn" id="timeGoalCompleteDurationUnitMinute" type="button" aria-pressed="false">
                  Minutes
                </button>
                <button className="btn btn-ghost small unitBtn isOn" id="timeGoalCompleteDurationUnitHour" type="button" aria-pressed="true">
                  Hours
                </button>
              </div>
              <span className="addTaskDurationPerLabel">per</span>
              <div className="unitButtons addTaskDurationPills" role="group" aria-label="Task complete time goal period">
                <button className="btn btn-ghost small unitBtn isOn" id="timeGoalCompleteDurationPeriodDay" type="button" aria-pressed="true">
                  Day
                </button>
                <button className="btn btn-ghost small unitBtn" id="timeGoalCompleteDurationPeriodWeek" type="button" aria-pressed="false">
                  Week
                </button>
              </div>
            </div>
            <div className="addTaskDurationReadout" id="timeGoalCompleteDurationReadout">
              1 hour per day
            </div>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="timeGoalCompleteContinueCancelBtn" type="button">
              Back
            </button>
            <button className="btn btn-accent" id="timeGoalCompleteContinueConfirmBtn" type="button">
              Continue Timing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
