import React from "react";

export default function HistoryAnalysisOverlay() {
  return (
    <div className="overlay" id="historyAnalysisOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="History Analysis">
        <h2 id="historyAnalysisTitle">History Analysis</h2>
        <div id="historyAnalysisSummary" />
        <div className="footerBtns">
          <button className="btn btn-accent closePopup" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
