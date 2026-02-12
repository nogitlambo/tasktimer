"use client";

import { useEffect } from "react";
import { initTaskTimerClient } from "./tasktimerClient";

export default function TaskTimerPage() {
  useEffect(() => {
    const cleanup = initTaskTimerClient();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  return (
    <>
      <div className="app">
        <div className="menuIcon" id="menuIcon" aria-label="Menu" title="Menu">
          ☰
        </div>

        <div className="topbar">
          <button
            className="btn btn-accent topbarBtn"
            id="openAddTaskBtn"
            type="button"
          >
            ＋ Add Task
          </button>
          <button
            className="btn btn-warn topbarBtn"
            id="resetAllBtn"
            type="button"
          >
            Reset All
          </button>
        </div>

        <div id="taskList" aria-live="polite" />
        <div className="deadArea" />
      </div>

      <div className="historyScreen" id="historyScreen" aria-hidden="true">
        <div className="historyTop">
          <button
            className="historyNavBtn"
            id="historyBackBtn"
            type="button"
            aria-label="Back"
            title="Back"
          >
            ←
          </button>
          <h2 className="historyTitle" id="historyTitle">
            History
          </h2>
          <button
            className="historyNavBtn"
            id="historyOlderBtn"
            type="button"
            aria-label="Older"
            title="Older"
          >
            ←
          </button>
        </div>

        <div className="historyPanel">
          <div className="historySub">
            <button
              className="historyNavBtn"
              id="historyNewerBtn"
              type="button"
              aria-label="Newer"
              title="Newer"
            >
              →
            </button>

            <div className="historyRangeText" id="historyRangeText" />

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                className="historyNavBtn"
                id="historyEditBtn"
                type="button"
                aria-label="Edit"
                title="Edit"
              >
                ✎
              </button>
              <button
                className="historyNavBtn"
                id="historyDeleteBtn"
                type="button"
                aria-label="Delete selected"
                title="Delete selected"
                disabled
              >
                🗑
              </button>
            </div>
          </div>

          <div className="historyBest" id="historyBest" />

          <div className="historyCanvasWrap" id="historyCanvasWrap">
            <canvas id="historyChart" />
          </div>

          <div className="historyTrashRow" id="historyTrashRow" />
        </div>
      </div>

      <div
        className="historyManagerScreen"
        id="historyManagerScreen"
        aria-hidden="true"
        style={{ display: "none" }}
      >
        <div className="historyManagerTop">
          <button
            className="historyNavBtn"
            id="historyManagerBackBtn"
            type="button"
            aria-label="Back"
            title="Back"
          >
            ←
          </button>
          <h2 className="historyManagerTitle">History Manager</h2>
          <div style={{ width: "40px" }} />
        </div>

        <div className="historyManagerPanel">
          <div className="hmList" id="hmList" />
        </div>
      </div>

      <div className="overlay" id="addTaskOverlay">
        <div className="modal">
          <h2>Add Task</h2>
          <form id="addTaskForm">
            <input id="addTaskName" type="text" placeholder="Task name..." />
            <button className="btn btn-accent" type="submit">
              Add
            </button>
          </form>
          <div className="footerBtns">
            <button
              className="btn btn-ghost"
              id="addTaskCancelBtn"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <div className="overlay full" id="menuOverlay">
        <div className="modal">
          <h2>Menu</h2>

          <button
            className="btn btn-ghost menuItem"
            type="button"
            data-menu="historyManager"
            id="historyManagerBtn"
            style={{ width: "100%", margin: "6px 0" }}
          >
            🗂 History Manager
          </button>

          <button
            className="btn btn-ghost menuItem"
            type="button"
            data-menu="about"
            style={{ width: "100%", margin: "6px 0" }}
          >
            ℹ About
          </button>

          <button
            className="btn btn-ghost menuItem"
            type="button"
            data-menu="howto"
            style={{ width: "100%", margin: "6px 0" }}
          >
            ❓ How to use
          </button>

          <button
            className="btn btn-ghost menuItem"
            type="button"
            data-menu="appearance"
            style={{ width: "100%", margin: "6px 0" }}
          >
            🎨 Appearance
          </button>

          <button
            className="btn btn-ghost menuItem"
            type="button"
            data-menu="contact"
            style={{ width: "100%", margin: "6px 0" }}
          >
            ✉ Contact
          </button>

          <div className="menuDivider" />

          <button
            className="btn btn-accent"
            id="exportBtn"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Export backup
          </button>

          <button
            className="btn btn-accent"
            id="importBtn"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Import backup
          </button>

          <input
            type="file"
            id="importFile"
            accept="application/json"
            style={{ display: "none" }}
          />

          <div className="footerBtns">
            <button className="btn btn-ghost" id="closeMenuBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay full" id="aboutOverlay">
        <div className="modal">
          <h2>About</h2>
          <p>
            TaskTimer is a simple task timer with per-task history logging and a
            lightweight weekly view.
          </p>
          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay full" id="howtoOverlay">
        <div className="modal">
          <h2>How to use</h2>

          <p>
            Use Start and Stop to control a timer. Reset logs a completed session
            to History when enabled.
          </p>

          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay full" id="appearanceOverlay">
        <div className="modal">
          <h2>Appearance</h2>

          <p>Appearance options will be wired up in the React refactor.</p>

          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay full" id="contactOverlay">
        <div className="modal">
          <h2>Contact</h2>

          <p>Contact details will be wired up in the React refactor.</p>

          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="editOverlay">
        <div className="modal">
          <h2>Edit Task</h2>

          <div className="field">
            <label htmlFor="editName">Task name</label>
            <input type="text" id="editName" />
          </div>

          <div className="row2">
            <div className="field">
              <label htmlFor="editH">Hours</label>
              <input type="number" id="editH" min="0" />
            </div>
            <div className="field">
              <label htmlFor="editM">Minutes</label>
              <input type="number" id="editM" min="0" max="59" />
            </div>
          </div>

          <div className="field">
            <label htmlFor="editS">Seconds</label>
            <input type="number" id="editS" min="0" max="59" />
          </div>

          <div className="field">
            <label htmlFor="editOrder">Order</label>
            <input type="number" id="editOrder" min="1" />
          </div>

          <div className="toggleRow">
            <span>Milestones</span>
            <div className="switch" id="msToggle" role="switch" aria-checked="false" />
          </div>

          <div className="milestones" id="msArea">
            <div className="msList" id="msList" />
            <button className="btn btn-ghost" id="addMsBtn" type="button">
              + Add milestone
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

      <div className="overlay" id="confirmOverlay">
        <div className="modal">
          <h2 id="confirmTitle">Confirm</h2>
          <p id="confirmText">Are you sure?</p>

          <div className="confirmChkRow" id="confirmChkRow" style={{ display: "none" }}>
            <label className="confirmChkLabel" id="confirmChkLabel">
              Also delete all tasks
            </label>
            <input className="confirmChk" id="confirmDeleteAll" type="checkbox" />
          </div>

          <div className="confirmChkRow" id="confirmChkRow2" style={{ display: "none" }}>
            <label className="confirmChkLabel" id="confirmChkLabel2">
              Log eligible sessions to History
            </label>
            <input className="confirmChk" id="confirmLogChk" type="checkbox" />
          </div>

          <div className="footerBtns">
            <button className="btn btn-ghost" id="confirmCancelBtn" type="button">
              Cancel
            </button>
            <button
              className="btn btn-warn"
              id="confirmAltBtn"
              type="button"
              style={{ display: "none" }}
            >
              Alt
            </button>
            <button className="btn btn-accent" id="confirmOkBtn" type="button">
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
}