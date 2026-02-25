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
              <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 700 }}>Focused task timing with progress and history</div>
            </div>
          </div>

          <div className="aboutText" style={{ marginTop: 10 }}>
            <p style={{ marginTop: 0 }}>
              TaskTimer is built for tracking focused work across multiple tasks and modes, with a fast workflow for
              start/stop timing, reviewing progress, and managing your history.
            </p>
            <p>
              Key features include:
            </p>
            <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
              <li>Multiple task categories (Mode 1, Mode 2, Mode 3) with configurable labels and colors</li>
              <li>Per-task timers with start, stop, reset, duplication, and manual editing controls</li>
              <li>Checkpoint milestones and progress tracking on each task</li>
              <li>Inline history charts with entry/day views, selection tools, export, analysis, and manager access</li>
              <li>Focus Mode for a single-task timer view with dedicated controls and insights</li>
              <li>Backup export/import, including import merge/overwrite options</li>
              <li>Dashboard and guide pages for overview and onboarding</li>
            </ul>
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
          <p className="modalSubtext">Appearance settings are now available in Settings &gt; Preferences.</p>
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
          <p className="modalSubtext">Task settings are now available in Settings &gt; Preferences.</p>
          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="categoryManagerOverlay">
        <div className="modal" role="dialog" aria-modal="true" aria-label="Configure Modes">
          <h2>Configure Modes</h2>
          <p className="modalSubtext">Mode configuration is now available in Settings &gt; Preferences.</p>
          <div className="footerBtns">
            <button className="btn btn-ghost closePopup" type="button">
              Close
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
