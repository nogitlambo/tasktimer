export default function TimeGoalCompleteNextTaskModal() {
  return (
    <div
      className="overlay primitiveSciFiModalOverlay timeGoalCompleteNextTaskPrimitiveOverlay"
      id="timeGoalCompleteNextTaskOverlay"
      style={{ display: "none" }}
    >
      <div className="modal modalConfirmation timeGoalCompleteNextTaskPrimitiveModal" role="dialog" aria-modal="true" aria-label="Next Task">
        <h2 id="timeGoalCompleteNextTaskModalTitle">Launch Next Task</h2>
        <p className="modalSubtext confirmText" id="timeGoalCompleteNextTaskModalText">
          Pick your next incomplete task to launch immediately.
        </p>
        <div
          className="timeGoalCompleteNextTaskGrid timeGoalCompleteNextTaskModalGrid"
          id="timeGoalCompleteNextTaskModalGrid"
          aria-label="Incomplete tasks for today"
        />
        <div className="confirmBtns timeGoalCompleteNextTaskModalActions">
          <button
            className="btn btn-ghost primitiveConfirmationModalAction timeGoalCompleteNextTaskPrimitiveAction"
            id="timeGoalCompleteNextTaskCloseBtn"
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
