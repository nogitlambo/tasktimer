// src/app/tasktimer/page.tsx
"use client";

import { useEffect } from "react";
import { initTaskTimerClient } from "./tasktimerClient";

// If Next complains about importing non-module CSS in a page,
// move this import into src/app/tasktimer/layout.tsx instead.
import "./tasktimer.css";

export default function TaskTimerPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskTimer App">
        <div className="topbar">
          <div className="brand">
            <img className="brandLogo" src="/tasktimer-logo.png" alt="TaskTimer" />
          </div>

          <div className="controls">
            <button className="btn btn-accent" id="openAddTaskBtn" type="button">
              + Add Task
            </button>

            <button className="btn btn-ghost" id="resetAllBtn" type="button">
              Reset All
            </button>

            <button className="menuIcon" id="menuIcon" type="button" aria-label="Settings" title="Settings">
              ⚙
            </button>
          </div>
        </div>

        {/* Main task list screen */}
        <div className="list" id="taskList" />

        {/* History screen */}
        <section id="historyScreen" aria-hidden="true">
          <div className="historyTop">
            <div className="historyMeta">
              <button className="btn btn-ghost small" id="historyBackBtn" type="button">
                Back</button>
              <div className="historyTitle" id="historyTitle">
                History
              </div>
            </div>

            <div className="historyMeta">
              <button
                className="iconBtn historyEditBtn"
                id="historyEditBtn"
                type="button"
                aria-label="Toggle edit mode"
                title="Edit mode"
              >
                Edit</button>

              <button
                className="btn btn-warn small historyDeleteBtn"
                id="historyDeleteBtn"
                type="button"
                disabled
              >
                Delete selected
              </button>
            </div>
          </div>

          <div className="historyCanvasWrap" id="historyCanvasWrap">
            <canvas id="historyChart" />
          </div>

          <div className="historyTrashRow" id="historyTrashRow" />

          <div className="historyRangeRow">
            <div className="historyMeta" id="historyRangeText">
              &nbsp;
            </div>

            <div className="historyMeta">
              <button className="btn btn-ghost small" id="historyOlderBtn" type="button">
                Older</button>
              <button className="btn btn-ghost small" id="historyNewerBtn" type="button">
                Newer</button>
            </div>
          </div>

          <div className="historyBest" id="historyBest" />
        </section>

        {/* History Manager screen */}
        <section id="historyManagerScreen" aria-hidden="true">
          <div className="hmHead">
            <div className="hmTitle">History Manager</div>
            <button className="btn btn-ghost small" id="historyManagerBackBtn" type="button">
              Back</button>
          </div>
          <div className="hmList" id="hmList" />
        </section>
      </div>

      {/* Menu overlay */}
      <div className="overlay" id="menuOverlay">
        <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="menuHead">
            <div className="menuTitle" aria-label="Task Timer Settings">
              Task Timer Settings
            </div>
            <button className="iconBtn" id="closeMenuBtn" type="button" aria-label="Close menu">
              Close</button>
          </div>

          <div className="menuList">
            <button className="menuItem" data-menu="historyManager" id="historyManagerBtn" type="button">
              History Manager
            </button>

            <button className="menuItem" data-menu="about" type="button">
              About
            </button>

            <button className="menuItem" data-menu="howto" type="button">
              How To
            </button>

            <button className="menuItem" data-menu="appearance" type="button">
              Appearance
            </button>

            <button className="menuItem" data-menu="contact" type="button">
              Contact
            </button>

            <button className="menuItem" id="exportBtn" type="button">
              Export Backup
            </button>

            <button className="menuItem" id="importBtn" type="button">
              Import Backup
            </button>

            <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
          </div>
        </div>
      </div>

      {/* Add Task overlay */}
      <div className="overlay" id="addTaskOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
          <h2>Add Task</h2>
          <form
            id="addTaskForm"
            autoComplete="off"
            style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}
          >
            <input id="addTaskName" type="text" placeholder="Task name..." />
            <div
              id="addTaskError"
              aria-live="polite"
              style={{ color: "#ff5c6a", fontSize: 13, fontWeight: 700, minHeight: 18 }}
            />
            <div className="toggleRow" style={{ marginTop: 0 }}>
              <span>Time Checkpoints</span>
              <div className="switch" id="addTaskMsToggle" role="switch" aria-checked="false" />
            </div>
            <div className="milestones" id="addTaskMsArea">
              <div className="unitRow" id="addTaskMsUnitRow">
                <span>Time Format</span>
                <div className="unitButtons">
                  <button className="btn btn-ghost small unitBtn" id="addTaskMsUnitDay" type="button">
                    Day
                  </button>
                  <button className="btn btn-ghost small unitBtn" id="addTaskMsUnitHour" type="button">
                    Hour
                  </button>
                </div>
              </div>
              <div id="addTaskMsList" />
              <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
                + Add Marker
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

      {/* About overlay */}
      <div className="overlay" id="aboutOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="About">
          <div className="aboutHead">
            <img className="aboutLogo" alt="TaskTimer logo" src="/tasktimer-logo.png" />
            <div>
              <h2 style={{ margin: 0 }}>TaskTimer</h2>
              <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 700 }}>Track time per task</div>
            </div>
          </div>

          <div className="aboutText" style={{ marginTop: 10 }}>
            <p style={{ marginTop: 0 }}>
              TaskTimer helps you track time spent across tasks, with optional milestones and a history log when you
              reset.
            </p>
          </div>

          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* How To overlay */}
      <div className="overlay" id="howtoOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="How To">
          <h2>How To</h2>
          <div style={{ color: "rgba(255,255,255,.72)", lineHeight: 1.5 }}>
            <p>
              <b>Tracking:</b> Use Start to start, Stop to stop, and Reset to reset. Reset can optionally log a history entry.
            </p>
            <p>
              <b>History:</b> Use Chart on a task to view the last 7 days. Use the arrows to page older entries.
            </p>
            <p>
              <b>Backup:</b> Use Export Backup to save your data. Use Import Backup to merge a saved backup back into
              the app.
            </p>
            <p>
              <b>Editing:</b> Use Edit to edit a task's name, total time, milestones, and appearance options. Manual time
              changes do not create a history entry until you reset.
            </p>
            <p>
              <b>Deleting:</b> Use Delete to delete a task. You can optionally clear that task's history during deletion.
            </p>
            <p>
              <b>Milestones:</b> Enable milestones in Edit to show progress markers for hours and descriptions.
              Milestones can be sorted and edited.
            </p>
          </div>

          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Appearance overlay */}
      <div className="overlay" id="appearanceOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Appearance">
          <h2>Appearance</h2>
          <p style={{ color: "rgba(255,255,255,.72)" }}>Coming soon...</p>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Contact overlay */}
      <div className="overlay" id="contactOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Contact">
          <h2>Contact</h2>
          <p style={{ color: "rgba(255,255,255,.72)" }}>Coming soon...</p>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Edit overlay */}
      <div className="overlay" id="editOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
          <h2>Edit Task</h2>

          <div className="field">
            <label>Task Name</label>
            <input type="text" id="editName" />
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
            <div className="unitRow" id="msUnitRow">
              <span>Time Format</span>
              <div className="unitButtons">
                <button className="btn btn-ghost small unitBtn" id="msUnitDay" type="button">
                  Day
                </button>
                <button className="btn btn-ghost small unitBtn" id="msUnitHour" type="button">
                  Hour
                </button>
              </div>
            </div>
            <div id="msList" />
            <button
              className="btn btn-ghost"
              id="addMsBtn"
              type="button"
              style={{ width: "100%", marginTop: 10 }}
            >
              + Add Marker
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

      {/* Number pad overlay for edit elapsed fields */}
      <div className="overlay" id="elapsedPadOverlay">
        <div className="modal elapsedPadModal" role="dialog" aria-modal="true" aria-label="Enter Time Value">
          <h2 id="elapsedPadTitle">Enter Value</h2>
          <div className="elapsedPadDisplay" id="elapsedPadDisplay">
            0
          </div>
          <div className="elapsedPadError" id="elapsedPadError" aria-live="polite" />
          <div className="elapsedPadGrid" id="elapsedPadGrid">
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="1">1</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="2">2</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="3">3</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="4">4</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="5">5</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="6">6</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="7">7</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="8">8</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="9">9</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-action="clear">Clear</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="0">0</button>
            <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-action="back">Back</button>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="elapsedPadCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="elapsedPadDoneBtn" type="button">
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Confirm overlay */}
      <div className="overlay" id="confirmOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm">
          <h2 id="confirmTitle">Confirm</h2>
          <div className="confirmText" id="confirmText" />

          <div className="chkRow" id="confirmChkRow" style={{ display: "none" }}>
            <input type="checkbox" id="confirmDeleteAll" />
            <label htmlFor="confirmDeleteAll" id="confirmChkLabel">
              Also delete all tasks
            </label>
          </div>

          {/* Optional second checkbox row (your client code supports it) */}
          <div className="chkRow" id="confirmChkRow2" style={{ display: "none" }}>
            <input type="checkbox" id="confirmLogChk" />
            <label htmlFor="confirmLogChk" id="confirmChkLabel2">
              Log eligible sessions to History
            </label>
          </div>

          <div className="confirmBtns">
            <button className="btn btn-ghost" id="confirmCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-warn" id="confirmAltBtn" type="button" style={{ display: "none" }}>
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

