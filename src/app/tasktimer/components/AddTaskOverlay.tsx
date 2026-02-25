import React from "react";

export default function AddTaskOverlay() {
  return (
    <div className="overlay" id="addTaskOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
        <h2>Add Task</h2>
        <form id="addTaskForm" autoComplete="off" style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
          <div className="addTaskNameCombo" id="addTaskNameCombo">
            <input id="addTaskName" type="text" placeholder="Enter a task name or select from preset values" />
            <button className="btn btn-ghost small addTaskNameToggle" id="addTaskNameToggle" type="button" aria-label="Show task name options">
              &#9662;
            </button>
            <div className="addTaskNameMenu" id="addTaskNameMenu">
              <div className="addTaskNameCustomTitle" id="addTaskNameCustomTitle">
                Your Custom Tasks
              </div>
              <div className="addTaskNameList" id="addTaskNameCustomList" />
              <div className="addTaskNameDivider" id="addTaskNameDivider" />
              <div className="addTaskNamePresetTitle" id="addTaskNamePresetTitle">
                Presets
              </div>
              <div className="addTaskNameList" id="addTaskNamePresetList" />
            </div>
          </div>
          <div id="addTaskError" aria-live="polite" style={{ color: "#ff5c6a", fontSize: 13, fontWeight: 700, minHeight: 18 }} />
          <div className="unitRow" id="addTaskMsUnitRow">
            <span>Task Timer Format</span>
            <div className="unitButtons">
              <button className="btn btn-ghost small unitBtn" id="addTaskMsUnitDay" type="button">
                Day
              </button>
              <button className="btn btn-ghost small unitBtn" id="addTaskMsUnitHour" type="button">
                Hour
              </button>
              <button className="btn btn-ghost small unitBtn" id="addTaskMsUnitMinute" type="button">
                Minute
              </button>
            </div>
          </div>
          <details className="milestones" id="addTaskMsArea">
            <summary className="milestonesSummary" role="button">
              <span className="milestonesSummaryPrimary">Time Checkpoints</span>
              <span className="milestonesSummaryControls">
                <div className="switch" id="addTaskMsToggle" role="switch" aria-checked="false" />
                <span className="milestonesSummaryCollapseLabel">Show/Hide Checkpoints</span>
              </span>
            </summary>
            <div className="milestonesBody">
              <div id="addTaskMsList" />
              <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
                + Add Timer Checkpoint
              </button>
            </div>
          </details>

          <div className="checkpointAlertsGroup" id="addTaskTimerSettingsGroup">
            <div className="checkpointAlertsTitle">Timer Settings</div>
            <div className="toggleRow" id="addTaskPresetIntervalsToggleRow">
              <span>Use Preset Intervals</span>
              <div className="switch" id="addTaskPresetIntervalsToggle" role="switch" aria-checked="false" />
            </div>
            <div className="field checkpointAlertSoundModeField isHidden" id="addTaskPresetIntervalField">
              <label htmlFor="addTaskPresetIntervalInput">Preset interval</label>
              <input id="addTaskPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" />
            </div>
            <p className="checkpointAlertsNote" id="addTaskPresetIntervalNote" style={{ display: "none" }} />
            <div className="field checkpointAlertSoundModeField" id="addTaskFinalCheckpointActionField">
              <label htmlFor="addTaskFinalCheckpointActionSelect">When final checkpoint is reached</label>
              <select id="addTaskFinalCheckpointActionSelect" defaultValue="continue">
                <option value="continue">Continue to run timer until stopped by user (default)</option>
                <option value="resetLog">Stop/reset timer and save session to history</option>
                <option value="resetNoLog">Stop/reset timer and do not save session to history</option>
              </select>
            </div>
          </div>

          <div className="checkpointAlertsGroup" id="addTaskCheckpointAlertsGroup">
            <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
            <div className="toggleRow" id="addTaskCheckpointSoundToggleRow">
              <span>Sound Alert</span>
              <div className="switch" id="addTaskCheckpointSoundToggle" role="switch" aria-checked="false" />
            </div>
            <div className="field checkpointAlertSoundModeField isHidden" id="addTaskCheckpointSoundModeField">
              <label htmlFor="addTaskCheckpointSoundModeSelect">Sound Alert Behaviour</label>
              <select id="addTaskCheckpointSoundModeSelect" defaultValue="once">
                <option value="once">Sound alert once only (default)</option>
                <option value="repeat">Wait for user to dismiss sound alert</option>
              </select>
            </div>
            <div className="toggleRow" id="addTaskCheckpointToastToggleRow">
              <span>Toast Alert</span>
              <div className="switch" id="addTaskCheckpointToastToggle" role="switch" aria-checked="false" />
            </div>
            <div className="field checkpointAlertSoundModeField isHidden" id="addTaskCheckpointToastModeField">
              <label htmlFor="addTaskCheckpointToastModeSelect">Toast Alert Behaviour</label>
              <select id="addTaskCheckpointToastModeSelect" defaultValue="auto5s">
                <option value="auto5s">Dismiss toast alert after 5 seconds (default)</option>
                <option value="manual">Wait for user to dismiss toast alert</option>
              </select>
            </div>
            <p className="checkpointAlertsNote" id="addTaskCheckpointAlertsNote" style={{ display: "none" }} />
          </div>

          <div className="footerBtns" style={{ justifyContent: "center" }}>
            <button className="btn btn-ghost" id="addTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="addTaskConfirmBtn" type="submit">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
