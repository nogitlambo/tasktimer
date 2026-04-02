
export default function ExportTaskOverlay() {
  return (
    <div className="overlay" id="exportTaskOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Export Task">
        <div className="editHead">
          <h2 id="exportTaskTitle">Export Task</h2>
        </div>
        <div className="chkRow" id="exportTaskIncludeHistoryRow">
          <input type="checkbox" id="exportTaskIncludeHistory" />
          <label htmlFor="exportTaskIncludeHistory" id="exportTaskIncludeHistoryLabel">
            Include history entries
          </label>
        </div>
        <div className="footerBtns">
          <button className="btn btn-ghost" id="exportTaskCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="exportTaskConfirmBtn" type="button">
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
