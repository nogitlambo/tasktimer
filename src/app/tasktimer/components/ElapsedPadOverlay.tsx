import React from "react";

export default function ElapsedPadOverlay() {
  return (
    <div className="overlay" id="elapsedPadOverlay">
      <div className="modal elapsedPadModal" role="dialog" aria-modal="true" aria-label="Enter Time Value">
        <h2 id="elapsedPadTitle">Enter Value</h2>
        <div className="elapsedPadDisplay" id="elapsedPadDisplay">
          0
        </div>
        <div className="elapsedPadError" id="elapsedPadError" aria-live="polite" />
        <div className="elapsedPadGrid" id="elapsedPadGrid">
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="1">1</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="2">2</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="3">3</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="4">4</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="5">5</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="6">6</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="7">7</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="8">8</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="9">9</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-action="clear">Clear</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-digit="0">0</button>
          <button className="btn btn-ghost elapsedPadKey" type="button" data-pad-action="dot">.</button>
        </div>
        <div className="footerBtns">
          <button className="btn btn-ghost" id="elapsedPadCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="elapsedPadDoneBtn" type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
