import React from "react";

export default function HeatmapDaySummaryOverlay() {
  return (
    <div className="overlay" id="dashboardHeatSummaryOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Focus Heatmap Summary">
        <h2 id="dashboardHeatSummaryTitle">Focus Heatmap</h2>
        <p className="modalSubtext" id="dashboardHeatSummaryDate">
          Select a day to review logged time.
        </p>
        <div className="confirmText dashboardHeatSummaryBody" id="dashboardHeatSummaryBody">
          <div className="dashboardHeatSummaryEmpty">No logged sessions for this day.</div>
        </div>
        <div className="confirmBtns">
          <button className="btn btn-accent closePopup" id="dashboardHeatSummaryCloseBtn" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
