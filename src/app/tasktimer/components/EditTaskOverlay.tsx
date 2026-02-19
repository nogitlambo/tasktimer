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
          <label>Override Elapsed Time</label>
          <div className="row3 overrideElapsedRow">
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
