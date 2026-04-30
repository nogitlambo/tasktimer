
export default function HistoryEntryNoteOverlay() {
  return (
    <div className="overlay" id="historyEntryNoteOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Session Summary">
        <div className="historyEntryNoteHeader">
          <h2 id="historyEntryNoteTitle">Task</h2>
          <p className="modalSubtext" id="historyEntryNoteMeta" style={{ display: "none" }} />
        </div>
        <div className="historyEntryNoteBody" id="historyEntryNoteBody">
          No session summary available.
        </div>
        <div className="historyEntryNoteEditor" id="historyEntryNoteEditor" style={{ display: "none" }}>
          <label className="historyEntryNoteEditorLabel" htmlFor="historyEntryNoteInput">
            Session note
          </label>
          <textarea
            className="text focusSessionNotesInput"
            id="historyEntryNoteInput"
            rows={4}
            aria-label="Session note"
          />
        </div>
        <div className="confirmBtns">
          <button className="btn btn-ghost" id="historyEntryNoteCancelBtn" type="button" style={{ display: "none" }}>
            Cancel
          </button>
          <button className="btn btn-accent" id="historyEntryNoteSaveBtn" type="button" style={{ display: "none" }}>
            Save Note
          </button>
          <button className="btn btn-accent closePopup" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
