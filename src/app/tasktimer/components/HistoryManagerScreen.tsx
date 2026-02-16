import React from "react";

export default function HistoryManagerScreen() {
  return (
    <section id="historyManagerScreen" aria-hidden="true">
      <div className="hmHead">
        <div className="hmTitle">History Manager</div>
        <button className="btn btn-ghost small" id="historyManagerBackBtn" type="button">
          Back
        </button>
      </div>
      <div className="hmList" id="hmList" />
    </section>
  );
}
