import { resolveTaskTimerRouteHref } from "../lib/routeHref";

export default function AddTaskChoiceOverlay() {
  const brainDumpHref = resolveTaskTimerRouteHref("/executive?view=brain-dump");

  return (
    <div
      className="overlay primitiveSciFiModalOverlay addTaskChoicePrimitiveOverlay"
      id="addTaskChoiceOverlay"
      style={{ display: "none" }}
    >
      <div
        className="modal addTaskChoicePrimitiveModal modalConfirmation"
        role="dialog"
        aria-modal="true"
        aria-label="Choose task creation method"
      >
        <h2>New Task</h2>
        <p className="modalSubtext confirmText">Choose how you want to create the next task.</p>
        <div className="addTaskChoiceGrid">
          <button
            className="btn btn-ghost modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction addTaskChoicePrimitiveAction addTaskChoicePrimitivePrimaryAction addTaskChoiceTile"
            type="button"
            data-add-task-choice="manual"
          >
            <span className="addTaskChoiceTileTitle">Manual Task Creation</span>
          </button>
          <a
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction addTaskChoicePrimitiveAction addTaskChoicePrimitiveSecondaryAction addTaskChoiceTile"
            href={brainDumpHref}
            data-add-task-choice="brain-dump"
            data-brain-dump-entry="add-task-choice"
            aria-label="Brain Dump"
          >
            <span className="addTaskChoiceTileTitle">Brain Dump</span>
          </a>
        </div>
        <div className="confirmBtns addTaskChoicePrimitiveFooter">
          <button
            className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction addTaskChoicePrimitiveAction addTaskChoicePrimitiveSecondaryAction"
            id="addTaskChoiceCancelBtn"
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
