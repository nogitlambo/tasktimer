import React from "react";

export default function TimeGoalCompleteSaveNoteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteSaveNoteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add Session Note">
        <h2 id="timeGoalCompleteSaveNoteTitle">Add Session Note</h2>
        <p className="modalSubtext confirmText" id="timeGoalCompleteSaveNoteText">
          Do you want to add a note to this session before it is saved and reset?
        </p>
        <div className="confirmBtns timeGoalCompleteSaveNoteBtns">
          <button className="btn btn-ghost" id="timeGoalCompleteSaveNoteNoBtn" type="button">
            No
          </button>
          <button className="btn btn-accent" id="timeGoalCompleteSaveNoteYesBtn" type="button">
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
