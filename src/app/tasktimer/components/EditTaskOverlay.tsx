import React from "react";

export default function EditTaskOverlay() {
  return (
    <div className="overlay" id="editOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
        <div className="editHead">
          <h2>Edit Task</h2>
          <div className="editMoveWrap">
            <span className="editMoveLabel">Category:</span>
            <details className="editMoveMenu" id="editMoveMenu">
              <summary className="taskMenuItem" id="editMoveMenuBtn" role="button">
                <span id="editMoveCurrentLabel">Mode 1</span>
              </summary>
              <div className="taskMenuList">
                <button className="taskMenuItem editMoveItem" id="editMoveMode1" data-move-mode="mode1" type="button">
                  Mode 1
                </button>
                <button className="taskMenuItem editMoveItem" id="editMoveMode2" data-move-mode="mode2" type="button">
                  Mode 2
                </button>
                <button className="taskMenuItem editMoveItem" id="editMoveMode3" data-move-mode="mode3" type="button">
                  Mode 3
                </button>
              </div>
            </details>
          </div>
        </div>

        <div className="editValidationError" id="editValidationError" aria-live="polite" />

        <div className="field">
          <label htmlFor="editName">Task Name</label>
          <input type="text" id="editName" />
        </div>

        <div className="field editTaskTimeGoalField">
          <div className="editTaskTimeGoalHeader toggleRow" id="editTaskTimeGoalToggleRow">
            <span className="editTaskTimeGoalHeaderLabel">Time Goal</span>
            <div className="editTaskTimeGoalToggleWrap">
              <input id="editNoGoalCheckbox" type="checkbox" hidden />
              <div className="switch" id="editTimeGoalToggle" role="switch" aria-checked="true" aria-label="Enable time goal" />
            </div>
          </div>
          <div className="addTaskDurationRow editTaskDurationRow" id="editTaskDurationRow">
            <input id="editTaskDurationValueInput" type="number" min={1} step={1} inputMode="numeric" defaultValue={5} />
            <div className="unitButtons addTaskDurationPills" id="editTaskDurationUnitPills" role="group" aria-label="Edit time goal unit">
              <button className="btn btn-ghost small unitBtn" id="editTaskDurationUnitMinute" type="button" aria-pressed="false">
                Minutes
              </button>
              <button className="btn btn-ghost small unitBtn isOn" id="editTaskDurationUnitHour" type="button" aria-pressed="true">
                Hours
              </button>
            </div>
            <span className="addTaskDurationPerLabel">per</span>
            <div className="unitButtons addTaskDurationPills" id="editTaskDurationPeriodPills" role="group" aria-label="Edit time goal period">
              <button className="btn btn-ghost small unitBtn" id="editTaskDurationPeriodDay" type="button" aria-pressed="false">
                Day
              </button>
              <button className="btn btn-ghost small unitBtn isOn" id="editTaskDurationPeriodWeek" type="button" aria-pressed="true">
                Week
              </button>
            </div>
          </div>
          <div className="addTaskDurationReadout editTaskDurationReadout" id="editTaskDurationReadout">
            5 hours per week
          </div>
          <div className="checkpointAlertsGroup" id="editTimerSettingsGroup" style={{ width: "100%", maxWidth: "none" }}>
            <div
              className="field checkpointAlertSoundModeField"
              id="editFinalCheckpointActionField"
              style={{ width: "100%", maxWidth: "none", minWidth: 0 }}
            >
              <label htmlFor="editFinalCheckpointActionSelect">When time goal is reached</label>
              <select id="editFinalCheckpointActionSelect" defaultValue="confirmModal" style={{ display: "block", width: "100%", maxWidth: "none" }}>
                <option value="continue">Continue to run timer until stopped by user</option>
                <option value="resetLog">Stop/reset timer and save session to history</option>
                <option value="resetNoLog">Stop/reset timer and do not save session to history</option>
                <option value="confirmModal">Display task complete modal and await user confirmation (default)</option>
              </select>
            </div>
          </div>
        </div>

        <details className="milestones" id="msArea">
          <summary className="milestonesSummary" role="button">
            <span className="milestonesSummaryPrimary">Time Checkpoints</span>
            <span className="milestonesSummaryControls">
              <div className="switch" id="msToggle" role="switch" aria-checked="false" />
              <span className="milestonesSummaryCollapseLabel">Show/Hide</span>
            </span>
          </summary>
          <div className="unitRow" id="msUnitRow">
            <span>Checkpoint Format</span>
            <div className="unitButtons">
              <button className="btn btn-ghost small unitBtn" id="msUnitDay" type="button">
                D
              </button>
              <button className="btn btn-ghost small unitBtn" id="msUnitHour" type="button">
                H
              </button>
              <button className="btn btn-ghost small unitBtn" id="msUnitMinute" type="button">
                M
              </button>
            </div>
          </div>
          <div className="toggleRow" id="editPresetIntervalsToggleRow">
            <span>Use Preset Intervals</span>
            <div className="switch" id="editPresetIntervalsToggle" role="switch" aria-checked="false" />
            <span className="presetIntervalsInfoSlot" id="editPresetIntervalsInfoSlot">
              <button
                className="iconBtn editPresetIntervalsInfoBtn"
                id="editPresetIntervalsInfoBtn"
                type="button"
                aria-label="What are preset intervals?"
                aria-expanded="false"
                aria-controls="editPresetIntervalsInfoDialog"
              >
                ?
              </button>
              <div className="addTaskCheckpointInfoDialog editPresetIntervalsInfoDialog" id="editPresetIntervalsInfoDialog" role="note">
                Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint.
              </div>
            </span>
          </div>
          <div className="field checkpointAlertSoundModeField isHidden" id="editPresetIntervalField">
            <label htmlFor="editPresetIntervalInput">Preset interval</label>
            <input id="editPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" />
          </div>
          <p className="checkpointAlertsNote" id="editPresetIntervalNote" style={{ display: "none" }} />
          <div className="milestonesBody">
            <div id="msList" />
            <button className="btn btn-ghost" id="addMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
              + Add Timer Checkpoint
            </button>
          </div>
        </details>

        <div className="checkpointAlertsGroup" id="editCheckpointAlertsGroup">
          <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
          <div className="toggleRow" id="editCheckpointSoundToggleRow">
            <span>Sound Alert</span>
            <div className="switch" id="editCheckpointSoundToggle" role="switch" aria-checked="false" />
          </div>
          <div className="field checkpointAlertSoundModeField isHidden" id="editCheckpointSoundModeField">
            <label htmlFor="editCheckpointSoundModeSelect">Sound Alert Behaviour</label>
            <select id="editCheckpointSoundModeSelect" defaultValue="once">
              <option value="once">Sound alert once only (default)</option>
              <option value="repeat">Wait for user to dismiss sound alert</option>
            </select>
          </div>
          <div className="toggleRow" id="editCheckpointToastToggleRow">
            <span>Toast Alert</span>
            <div className="switch" id="editCheckpointToastToggle" role="switch" aria-checked="false" />
          </div>
          <div className="field checkpointAlertSoundModeField isHidden" id="editCheckpointToastModeField">
            <label htmlFor="editCheckpointToastModeSelect">Toast Alert Behaviour</label>
            <select id="editCheckpointToastModeSelect" defaultValue="auto5s">
              <option value="auto5s">Dismiss toast alert after 5 seconds (default)</option>
              <option value="manual">Wait for user to dismiss toast alert</option>
            </select>
          </div>
          <p className="checkpointAlertsNote" id="editCheckpointAlertsNote" style={{ display: "none" }} />
        </div>

        <details className="editAdvancedSection" id="editAdvancedSection">
          <summary className="milestonesSummary editAdvancedSummary" role="button">
            <span className="milestonesSummaryPrimary">Advanced</span>
            <span className="milestonesSummaryControls">
              <span className="milestonesSummaryCollapseLabel">Show/Hide Advanced</span>
            </span>
          </summary>
          <div className="editAdvancedBody">
            <div className="field">
              <div className="toggleRow">
                <span>Override Elapsed Time</span>
                <div className="switch" id="editOverrideElapsedToggle" role="switch" aria-checked="false" />
              </div>
              <div className="row3 overrideElapsedRow" id="editOverrideElapsedFields">
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="editD" style={{ textTransform: "none", letterSpacing: 0 }}>
                    Days
                  </label>
                  <input type="number" id="editD" min={0} step={1} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="editH" style={{ textTransform: "none", letterSpacing: 0 }}>
                    Hours
                  </label>
                  <input type="number" id="editH" min={0} step={1} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="editM" style={{ textTransform: "none", letterSpacing: 0 }}>
                    Minutes
                  </label>
                  <input type="number" id="editM" min={0} max={59} step={1} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label htmlFor="editS" style={{ textTransform: "none", letterSpacing: 0 }}>
                    Seconds
                  </label>
                  <input type="number" id="editS" min={0} max={59} step={1} />
                </div>
              </div>
            </div>
          </div>
        </details>

        <div className="footerBtns">
          <button className="btn btn-ghost" id="cancelEditBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="saveEditBtn" type="button">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
