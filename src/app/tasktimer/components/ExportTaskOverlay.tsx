
export default function ExportTaskOverlay() {
  return (
    <div className="overlay primitiveSciFiModalOverlay exportTaskPrimitiveOverlay" id="exportTaskOverlay">
      <div className="modal exportTaskPrimitiveModal" role="dialog" aria-modal="true" aria-label="Export Task">
        <header className="editHead exportTaskPrimitiveHeader">
          <h2 id="exportTaskTitle">Export Task</h2>
        </header>
        <div className="exportTaskPrimitiveBody">
          <div className="chkRow" id="exportTaskIncludeHistoryRow">
            <input type="checkbox" id="exportTaskIncludeHistory" />
            <label htmlFor="exportTaskIncludeHistory" id="exportTaskIncludeHistoryLabel">
              Include history entries
            </label>
          </div>
        </div>
        <footer className="footerBtns exportTaskPrimitiveFooter">
          <button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction exportTaskPrimitiveAction exportTaskPrimitiveSecondaryAction" id="exportTaskCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction exportTaskPrimitiveAction exportTaskPrimitivePrimaryAction" id="exportTaskConfirmBtn" type="button">
            Export
          </button>
        </footer>
      </div>
    </div>
  );
}
