import React from "react";

export default function HistoryManagerScreen() {
  return (
    <section id="historyManagerScreen" aria-hidden="true">
      <div className="hmHead">
        <div className="hmTitle">History Manager</div>
        <div className="hmHeadActions">
          <button className="btn btn-ghost small" id="historyManagerBulkBtn" type="button">
            Bulk Edit
          </button>
          <button className="btn btn-warn small" id="historyManagerBulkDeleteBtn" type="button" style={{ display: "none" }}>
            Delete
          </button>
          <button className="btn btn-ghost small" id="historyManagerBackBtn" type="button">
            Back to Settings
          </button>
        </div>
      </div>
      <div className="hmList" id="hmList" />
    </section>
  );
}
