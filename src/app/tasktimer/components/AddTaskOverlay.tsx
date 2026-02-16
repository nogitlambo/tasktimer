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
          <div className="toggleRow" style={{ marginTop: 0 }}>
            <span>Time Checkpoints</span>
            <div className="switch" id="addTaskMsToggle" role="switch" aria-checked="false" />
          </div>
          <div className="milestones" id="addTaskMsArea">
            <div className="unitRow" id="addTaskMsUnitRow">
              <span>Checkpoint Time Format</span>
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
            <div id="addTaskMsList" />
            <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
              + Add Timer Checkpoint
            </button>
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
