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
