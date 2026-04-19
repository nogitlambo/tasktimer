
export default function HistoryEntryNoteOverlay() {
  return (
    <div className="overlay" id="historyEntryNoteOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Session Summary">
        <div className="historyEntryNoteHeader">
          <h2 id="historyEntryNoteTitle">Session Summary</h2>
          <p className="modalSubtext" id="historyEntryNoteMeta" style={{ display: "none" }} />
        </div>
        <div className="historyEntryNoteBody" id="historyEntryNoteBody">
          No session summary available.
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
