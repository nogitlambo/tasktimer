import "./styles/tasktimer.css";

export default function TaskTimerPage() {
  return (
    <>
      {/* Main app */}
      <div className="app">
        <div
          id="menuIcon"
          className="menuIcon"
          title="Menu"
          aria-label="Menu"
        >
          ☰
        </div>

        <div className="topbar">
          <button
            id="openAddTaskBtn"
            className="btn btn-accent topbarBtn"
            type="button"
          >
            ＋ Add Task
          </button>
        </div>

        <div id="taskList" aria-live="polite" />
        <div className="deadArea" />
      </div>

      {/* History screen */}
      <div id="historyScreen" className="historyScreen" aria-hidden="true">
        <div className="historyTop">
          <button
            id="historyBackBtn"
            className="historyNavBtn"
            type="button"
            title="Back"
            aria-label="Back"
          >
            ←
          </button>

          <h2 id="historyTitle" className="historyTitle">
            History
          </h2>

          <button
            id="historyOlderBtn"
            className="historyNavBtn"
            type="button"
            title="Older"
            aria-label="Older"
          >
            ←
          </button>
        </div>

        <div className="historyPanel">
          <div className="historyMeta">
            <div id="historyRangeText">Showing 0 entries</div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                id="historyDeleteBtn"
                className="historyNavBtn"
                type="button"
                title="Delete"
                aria-label="Delete"
                disabled
              >
                🗑
              </button>

              <button
                id="historyNewerBtn"
                className="historyNavBtn"
                type="button"
                title="Newer"
                aria-label="Newer"
              >
                →
              </button>
            </div>
          </div>

          <div id="historyCanvasWrap" className="historyCanvasWrap">
            <canvas id="historyChart" />
          </div>

          <div className="historyHint">
            Swipe left for older entries. Tap ← for older pages.
          </div>

          <div id="historyBest" className="historyBest" />
        </div>
      </div>

      {/* History Manager screen */}
      <div
        id="historyManagerScreen"
        className="historyScreen"
        aria-hidden="true"
        style={{ display: "none" }}
      >
        <div className="historyTop">
          <button
            id="historyManagerBackBtn"
            className="historyNavBtn"
            type="button"
            title="Back"
            aria-label="Back"
          >
            ←
          </button>

          <h2 className="historyTitle">History Manager</h2>
        </div>

        <div className="hmPanel">
          <div className="hmHint">
            Expand a task to view and delete individual log entries.
          </div>
          <div id="hmList" className="hmList" />
        </div>
      </div>

      {/* Menu overlay */}
      <div id="menuOverlay" className="overlay full" aria-hidden="true">
        <div className="modal">
          <h2>Menu</h2>

          <button
            className="btn btn-ghost menuItem"
            data-menu="about"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            About TaskTimer
          </button>

          <button
            className="btn btn-ghost menuItem"
            data-menu="howto"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            How To Use
          </button>

          <button
            className="btn btn-ghost menuItem"
            data-menu="appearance"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Appearance
          </button>

          <button
            id="historyManagerBtn"
            className="btn btn-ghost menuItem"
            data-menu="historyManager"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            History Manager
          </button>

          <button
            id="exportBtn"
            className="btn btn-ghost"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Export Backup
          </button>

          <button
            id="importBtn"
            className="btn btn-ghost"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Import Backup
          </button>

          <input
            id="importFile"
            type="file"
            accept="application/json"
            style={{ display: "none" }}
          />

          <button
            className="btn btn-ghost menuItem"
            data-menu="contact"
            type="button"
            style={{ width: "100%", margin: "6px 0" }}
          >
            Contact
          </button>

          <button
            id="resetAllBtn"
            className="btn btn-warn"
            type="button"
            style={{ width: "100%", margin: "10px 0 6px" }}
          >
            ⟳ Reset All
          </button>

          <div className="footerBtns">
            <button
              id="closeMenuBtn"
              className="btn btn-warn"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Add Task overlay */}
      <div id="addTaskOverlay" className="overlay">
        <div className="modal">
          <h2>Add Task</h2>

          <form
            id="addTaskForm"
            autoComplete="off"
            style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}
          >
            <input
              id="addTaskName"
              type="text"
              placeholder="Task name..."
            />

            <div className="footerBtns" style={{ justifyContent: "center" }}>
              <button
                id="addTaskCancelBtn"
                className="btn btn-ghost"
                type="button"
              >
                Cancel
              </button>

              <button
                id="addTaskConfirmBtn"
                className="btn btn-accent"
                type="submit"
              >
                Add
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* About overlay (placeholder shell) */}
      <div id="aboutOverlay" className="overlay">
        <div className="modal">
          <h2>About TaskTimer</h2>
          <div style={{ textAlign: "left", maxHeight: "60vh", overflow: "auto", lineHeight: 1.35 }}>
            <p>Placeholder content. Paste the original About HTML here next.</p>
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* How To overlay (placeholder shell) */}
      <div id="howtoOverlay" className="overlay">
        <div className="modal">
          <h2>How To Use</h2>
          <div style={{ textAlign: "left", maxHeight: "60vh", overflow: "auto", lineHeight: 1.35 }}>
            <p>Placeholder content. Paste the original How To HTML here next.</p>
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Appearance overlay (placeholder shell) */}
      <div id="appearanceOverlay" className="overlay">
        <div className="modal">
          <h2>Appearance</h2>
          <div style={{ textAlign: "left", maxHeight: "60vh", overflow: "auto", lineHeight: 1.35 }}>
            <p>Placeholder content. Paste the original Appearance HTML here next.</p>
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Contact overlay (placeholder shell) */}
      <div id="contactOverlay" className="overlay">
        <div className="modal">
          <h2>Contact</h2>
          <div style={{ textAlign: "left", maxHeight: "60vh", overflow: "auto", lineHeight: 1.35 }}>
            <p>Placeholder content. Paste the original Contact HTML here next.</p>
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit overlay */}
      <div id="editOverlay" className="overlay">
        <div className="modal">
          <h2>Edit Task</h2>

          <div className="field">
            <label>Task Name</label>
            <input id="editName" type="text" />
          </div>

          <div className="field">
            <label>Override Elapsed Time</label>

            <div className="row2">
              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>
                  Hours
                </label>
                <input id="editH" type="number" min={0} step={1} />
              </div>

              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>
                  Minutes
                </label>
                <input id="editM" type="number" min={0} max={59} step={1} />
              </div>
            </div>

            <div className="field" style={{ marginTop: 10 }}>
              <label style={{ textTransform: "none", letterSpacing: 0 }}>
                Seconds
              </label>
              <input id="editS" type="number" min={0} max={59} step={1} />
            </div>
          </div>

          <div className="field">
            <label>Task Order</label>
            <input id="editOrder" type="number" min={1} step={1} />
          </div>

          <div className="toggleRow">
            <span>Milestones</span>
            <div
              id="msToggle"
              className="switch"
              role="switch"
              aria-checked="false"
            />
          </div>

          <div id="msArea" className="milestones">
            <div id="msList" />
            <button
              id="addMsBtn"
              className="btn btn-ghost"
              type="button"
              style={{ width: "100%", marginTop: 10 }}
            >
              ＋ Add Milestone
            </button>
          </div>

          <div className="footerBtns">
            <button id="cancelEditBtn" className="btn btn-ghost" type="button">
              Cancel
            </button>
            <button id="saveEditBtn" className="btn btn-accent" type="button">
              Save
            </button>
          </div>
        </div>
      </div>

      {/* Confirm overlay */}
      <div id="confirmOverlay" className="overlay">
        <div className="modal">
          <h2 id="confirmTitle">Confirm</h2>
          <div id="confirmText" className="confirmText" />

          <div
            id="confirmChkRow"
            className="chkRow"
            style={{ display: "none" }}
          >
            <input id="confirmDeleteAll" type="checkbox" />
            <label id="confirmChkLabel" htmlFor="confirmDeleteAll">
              Also delete all tasks
            </label>
          </div>

          <div className="confirmBtns">
            <button id="confirmCancelBtn" className="btn btn-ghost" type="button">
              Cancel
            </button>

            <button
              id="confirmAltBtn"
              className="btn btn-warn"
              type="button"
              style={{ display: "none" }}
            >
              Alt
            </button>

            <button id="confirmOkBtn" className="btn btn-accent" type="button">
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
