import AppImg from "@/components/AppImg";

export default function TimeGoalCompleteNoteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteNoteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Notes">
        <h2 id="timeGoalCompleteNoteTitle">Task Notes</h2>
        <p className="modalSubtext" id="timeGoalCompleteNoteText">
          Add a note for this saved session before the timer resets.
        </p>
        <div className="timeGoalCompleteNoteBody">
          <div
            className="richNoteToolbar"
            role="toolbar"
            aria-label="Session note formatting"
            data-rich-note-toolbar="true"
            data-rich-note-for="timeGoalCompleteNoteInput"
          >
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Bold" aria-label="Bold" data-rich-note-command="bold" aria-pressed="false">B</button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Italic" aria-label="Italic" data-rich-note-command="italic" aria-pressed="false">I</button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Underline" aria-label="Underline" data-rich-note-command="underline" aria-pressed="false">U</button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Bulleted list" aria-label="Bulleted list" data-rich-note-command="insertUnorderedList" aria-pressed="false">
              <AppImg className="richNoteToolbarIcon" src="/icons/list.png" alt="" aria-hidden="true" />
            </button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Numbered list" aria-label="Numbered list" data-rich-note-command="insertOrderedList" aria-pressed="false">
              <AppImg className="richNoteToolbarIcon" src="/icons/numbered_list.png" alt="" aria-hidden="true" />
            </button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Add link" aria-label="Add link" data-rich-note-command="createLink" aria-pressed="false">
              <AppImg className="richNoteToolbarIcon" src="/icons/link.png" alt="" aria-hidden="true" />
            </button>
            <button className="btn btn-ghost small richNoteToolbarBtn" type="button" title="Attach File(s)" aria-label="Attach File(s)" data-rich-note-command="attachFiles" aria-pressed="false">Attach File(s)</button>
          </div>
          <div className="sessionNoteEditorGrid">
            <div
              className="text focusSessionNotesInput richNoteEditor"
              id="timeGoalCompleteNoteInput"
              role="textbox"
              aria-multiline="true"
              aria-label="Notes for this session"
              contentEditable
              suppressContentEditableWarning
              data-rich-note-editor="true"
            />
            <div className="sessionNoteAttachments" id="timeGoalCompleteNoteAttachments" aria-live="polite" />
          </div>
        </div>
        <div className="footerBtns">
          <button className="btn btn-accent" id="timeGoalCompleteNoteDoneBtn" type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
