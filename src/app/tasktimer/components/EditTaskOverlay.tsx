import React from "react";

export default function EditTaskOverlay() {
  return (
    <div className="overlay" id="editOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
        <div className="editHead">
          <h2>Edit Task</h2>
          <div className="editMoveWrap">
            <label htmlFor="editMoveMenuBtn">Category:</label>
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

        <div className="field">
          <label>Task Name</label>
          <input type="text" id="editName" />
        </div>

        <div className="unitRow" id="msUnitRow">
          <span>Task Timer Format</span>
          <div className="unitButtons">
            <button className="btn btn-ghost small unitBtn" id="msUnitDay" type="button">
              Day
            </button>
            <button className="btn btn-ghost small unitBtn" id="msUnitHour" type="button">
              Hour
            </button>
            <button className="btn btn-ghost small unitBtn" id="msUnitMinute" type="button">
              Minute
            </button>
          </div>
        </div>

        <div className="field">
          <div className="toggleRow">
            <span>Override Elapsed Time</span>
            <div className="switch" id="editOverrideElapsedToggle" role="switch" aria-checked="false" />
          </div>
          <div className="row3 overrideElapsedRow" id="editOverrideElapsedFields">
            <div className="field" style={{ margin: 0 }}>
              <label style={{ textTransform: "none", letterSpacing: 0 }}>Days</label>
              <input type="number" id="editD" min={0} step={1} readOnly />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ textTransform: "none", letterSpacing: 0 }}>Hours</label>
              <input type="number" id="editH" min={0} step={1} readOnly />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ textTransform: "none", letterSpacing: 0 }}>Minutes</label>
              <input type="number" id="editM" min={0} max={59} step={1} readOnly />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ textTransform: "none", letterSpacing: 0 }}>Seconds</label>
              <input type="number" id="editS" min={0} max={59} step={1} readOnly />
            </div>
          </div>
        </div>

        <div className="toggleRow">
          <span>Time Checkpoints</span>
          <div className="switch" id="msToggle" role="switch" aria-checked="false" />
        </div>

        <div className="milestones" id="msArea">
          <div id="msList" />
          <button className="btn btn-ghost" id="addMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
            + Add Timer Checkpoint
          </button>
        </div>

        <div className="checkpointAlertsGroup" id="editTimerSettingsGroup">
          <div className="checkpointAlertsTitle">Timer Settings</div>
          <div className="toggleRow" id="editPresetIntervalsToggleRow">
            <span>Use Preset Intervals</span>
            <div className="switch" id="editPresetIntervalsToggle" role="switch" aria-checked="false" />
          </div>
          <div className="field checkpointAlertSoundModeField isHidden" id="editPresetIntervalField">
            <label htmlFor="editPresetIntervalInput">Preset interval</label>
            <input id="editPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" />
          </div>
          <p className="checkpointAlertsNote" id="editPresetIntervalNote" style={{ display: "none" }} />
          <div className="field checkpointAlertSoundModeField" id="editFinalCheckpointActionField">
            <label htmlFor="editFinalCheckpointActionSelect">When final checkpoint is reached</label>
            <select id="editFinalCheckpointActionSelect" defaultValue="continue">
              <option value="continue">Continue to run timer until stopped by user (default)</option>
              <option value="resetLog">Stop/reset timer and save session to history</option>
              <option value="resetNoLog">Stop/reset timer and do not save session to history</option>
            </select>
          </div>
        </div>

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
            <select id="editCheckpointToastModeSelect" defaultValue="auto3s">
              <option value="auto3s">Dismiss toast alert after 3 seconds (default)</option>
              <option value="manual">Wait for user to dismiss toast alert</option>
            </select>
          </div>
          <p className="checkpointAlertsNote" id="editCheckpointAlertsNote" style={{ display: "none" }} />
        </div>

        <div className="footerBtns">
          <button className="btn btn-ghost" id="cancelEditBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="saveEditBtn" type="button">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
