import React from "react";

export default function TimeGoalCompleteNoteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteNoteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Notes">
        <h2 id="timeGoalCompleteNoteTitle">Task Notes</h2>
        <p className="modalSubtext" id="timeGoalCompleteNoteText">
          Add a note for this saved session before the timer resets.
        </p>
        <div className="timeGoalCompleteNoteBody">
          <textarea
            className="text focusSessionNotesInput"
            id="timeGoalCompleteNoteInput"
            rows={3}
            aria-label="Notes for this session"
          />
        </div>
        <div className="footerBtns">
          <button className="btn btn-accent" id="timeGoalCompleteNoteDoneBtn" type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
