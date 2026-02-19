import React from "react";

export default function ConfirmOverlay() {
  return (
    <div className="overlay" id="confirmOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm">
        <h2 id="confirmTitle">Confirm</h2>
        <div className="confirmText" id="confirmText" />

        <div className="chkRow" id="confirmChkRow" style={{ display: "none" }}>
          <input type="checkbox" id="confirmDeleteAll" />
          <label htmlFor="confirmDeleteAll" id="confirmChkLabel">
            Also delete all tasks
          </label>
        </div>
        <div className="confirmChkNote" id="confirmChkNote" style={{ display: "none" }} />

        <div className="chkRow" id="confirmChkRow2" style={{ display: "none" }}>
          <input type="checkbox" id="confirmLogChk" />
          <label htmlFor="confirmLogChk" id="confirmChkLabel2">
            Log eligible sessions to History
          </label>
        </div>

        <div className="confirmBtns">
          <button className="btn btn-ghost" id="confirmCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-warn" id="confirmAltBtn" type="button" style={{ display: "none" }}>
            Alt
          </button>
          <button className="btn btn-accent" id="confirmOkBtn" type="button">
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
