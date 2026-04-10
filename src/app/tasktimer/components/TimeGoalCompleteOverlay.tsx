
export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <h2 id="timeGoalCompleteTitle">Task Complete!</h2>
        <p className="modalSubtext" id="timeGoalCompleteText">
          You&apos;ve been awarded 0 XP
        </p>
        <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
        <div className="confirmBtns timeGoalCompleteActionGrid">
          <button className="btn btn-accent" id="timeGoalCompleteCloseBtn" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
