import React from "react";

export default function HistoryEntryNoteOverlay() {
  return (
    <div className="overlay" id="historyEntryNoteOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Session Note">
        <div className="historyEntryNoteHeader">
          <h2 id="historyEntryNoteTitle">Task Notes</h2>
          <p className="modalSubtext" id="historyEntryNoteMeta">
            Session note
          </p>
        </div>
        <div className="confirmText historyEntryNoteBody" id="historyEntryNoteBody">
          No note available.
        </div>
        <div className="confirmBtns">
          <button className="btn btn-accent closePopup" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
