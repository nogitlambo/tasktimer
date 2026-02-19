import React from "react";

export default function InfoOverlays() {
  return (
    <>
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

      <div className="overlay" id="howtoOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="How To">
          <h2>How To</h2>
          <div className="modalSubtext" style={{ lineHeight: 1.5 }}>
            <p>
              <b>Tracking:</b> Use Start to start, Stop to stop, and Reset to reset. Reset can optionally log a
              history entry.
            </p>
            <p>
              <b>History:</b> Use Chart on a task to view the last 7 days. Use the arrows to page older entries.
            </p>
            <p>
              <b>Backup:</b> Use Export Backup to save your data. Use Import Backup to merge a saved backup back into
              the app.
            </p>
            <p>
              <b>Editing:</b> Use Edit to edit a task&apos;s name, total time, milestones, and appearance options. Manual
              time changes do not create a history entry until you reset.
            </p>
            <p>
              <b>Deleting:</b> Use Delete to delete a task. You can optionally clear that task&apos;s history during
              deletion.
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

      <div className="overlay" id="appearanceOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Appearance">
          <h2>Appearance</h2>
          <div className="toggleRow" id="themeToggleRow">
            <span>Toggle between light and dark mode</span>
            <button className="switch on" id="themeToggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="taskSettingsOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Task Settings">
          <h2>Task Settings</h2>
          <div className="unitRow">
            <span>Default Task Timer Format</span>
            <div className="unitButtons">
              <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatDay" type="button">
                Day
              </button>
              <button className="btn btn-ghost small unitBtn isOn" id="taskDefaultFormatHour" type="button">
                Hour
              </button>
              <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatMinute" type="button">
                Minute
              </button>
            </div>
          </div>
          <div className="toggleRow" id="taskDynamicColorsToggleRow">
            <span>Dynamic colors for progress and history</span>
            <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="footerBtns">
            <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button">
              Save
            </button>
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="categoryManagerOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Configure Modes">
          <h2>Configure Modes</h2>
          <div className="field categoryFieldRow">
            <label htmlFor="categoryMode1Input">Default Mode</label>
            <div className="categoryFieldControl">
              <input id="categoryMode1Input" type="text" maxLength={10} />
              <input className="categoryColorInput" id="categoryMode1Color" type="color" aria-label="Mode 1 color" />
              <input className="categoryColorHex" id="categoryMode1ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 1 hex color" />
            </div>
          </div>
          <div className="modeSwitchesLabel">Modes</div>
          <div className="toggleRow">
            <span id="categoryMode2ToggleLabel">Disable Mode 2</span>
            <button className="switch on" id="categoryMode2Toggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="field categoryFieldRow" id="categoryMode2Row">
            <label htmlFor="categoryMode2Input">Mode 2</label>
            <div className="categoryFieldControl">
              <input id="categoryMode2Input" type="text" maxLength={10} />
              <input className="categoryColorInput" id="categoryMode2Color" type="color" aria-label="Mode 2 color" />
              <input className="categoryColorHex" id="categoryMode2ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 2 hex color" />
              <button className="categoryTrashBtn" id="categoryMode2TrashBtn" type="button" aria-label="Delete Mode 2 category">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                </svg>
              </button>
            </div>
          </div>
          <div className="toggleRow">
            <span id="categoryMode3ToggleLabel">Disable Mode 3</span>
            <button className="switch on" id="categoryMode3Toggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="field categoryFieldRow" id="categoryMode3Row">
            <label htmlFor="categoryMode3Input">Mode 3</label>
            <div className="categoryFieldControl">
              <input id="categoryMode3Input" type="text" maxLength={10} />
              <input className="categoryColorInput" id="categoryMode3Color" type="color" aria-label="Mode 3 color" />
              <input className="categoryColorHex" id="categoryMode3ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 3 hex color" />
              <button className="categoryTrashBtn" id="categoryMode3TrashBtn" type="button" aria-label="Delete Mode 3 category">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                </svg>
              </button>
            </div>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="categoryResetBtn" type="button">
              Reset Defaults
            </button>
            <button className="btn btn-accent" id="categorySaveBtn" type="button">
              Save
            </button>
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="contactOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Contact">
          <h2>Contact</h2>
          <p className="modalSubtext">Coming soon...</p>
          <div className="footerBtns">
            <button className="btn btn-accent closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
