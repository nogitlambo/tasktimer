import React from "react";

export default function HistoryScreen() {
  return (
    <section id="historyScreen" aria-hidden="true">
      <div className="historyTop">
        <div className="historyMeta">
          <button className="btn btn-ghost small" id="historyBackBtn" type="button">
            Back
          </button>
          <div className="historyTitle" id="historyTitle">
            History
          </div>
        </div>

        <div className="historyMeta">
          <button
            className="iconBtn historyEditBtn"
            id="historyEditBtn"
            type="button"
            aria-label="Toggle edit mode"
            title="Edit mode"
          >
            Edit
          </button>

          <button className="btn btn-warn small historyDeleteBtn" id="historyDeleteBtn" type="button" disabled>
            Delete selected
          </button>
        </div>
      </div>

      <div className="historyCanvasWrap" id="historyCanvasWrap">
        <canvas id="historyChart" />
      </div>

      <div className="historyTrashRow" id="historyTrashRow" />

      <div className="historyRangeRow">
        <div className="historyMeta" id="historyRangeText">
          &nbsp;
        </div>

        <div className="historyMeta">
          <button className="btn btn-ghost small" id="historyOlderBtn" type="button">
            Older
          </button>
          <button className="btn btn-ghost small" id="historyNewerBtn" type="button">
            Newer
          </button>
        </div>
      </div>

      <div className="historyBest" id="historyBest" />
    </section>
  );
}
