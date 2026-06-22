export default function HistoryManagerScreen({ showHeader = true }: { showHeader?: boolean }) {
  return (
    <>
      <section id="historyManagerScreen" aria-hidden="true">
        <div className="hmLoadingOverlay" id="historyManagerLoadingOverlay" hidden>
          <div className="hmLoadingCard" role="status" aria-live="polite">
            <div className="hmLoadingTitle">Loading History Manager</div>
            <div className="hmLoadingText">Preparing your history entries and controls.</div>
            <div className="hmLoadingBar" aria-hidden="true">
              <span className="hmLoadingBarFill" />
            </div>
          </div>
        </div>
        {showHeader ? (
          <div className="hmHead">
            <div className="hmTitle">History Manager</div>
            <div className="hmHeadActions">
              <button className="btn btn-ghost" id="historyManagerBulkBtn" type="button">
                Select
              </button>
              <button className="btn btn-ghost" id="historyManagerCloseBtn" type="button">
                Close
              </button>
              <button className="btn btn-warn small" id="historyManagerBulkDeleteBtn" type="button" style={{ display: "none" }}>
                Delete
              </button>
            </div>
          </div>
        ) : null}
        <div className="hmList" id="hmList" />
      </section>
    </>
  );
}
