import AppImg from "@/components/AppImg";

export default function HistoryEntryNoteOverlay() {
  return (
    <div className="overlay" id="historyEntryNoteOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Session Summary">
        <div className="historyEntryNoteHeader">
          <h2 id="historyEntryNoteTitle">Task</h2>
          <p className="modalSubtext" id="historyEntryNoteMeta" style={{ display: "none" }} />
        </div>
        <div className="historyEntryNoteBody" id="historyEntryNoteBody">
          No session summary available.
        </div>
        <div className="historyEntryNoteEditor" id="historyEntryNoteEditor" style={{ display: "none" }}>
          <label className="historyEntryNoteEditorLabel" htmlFor="historyEntryNoteInput">
            Session note
          </label>
          <div
            className="richNoteToolbar"
            role="toolbar"
            aria-label="Session note formatting"
            data-rich-note-toolbar="true"
            data-rich-note-for="historyEntryNoteInput"
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
              id="historyEntryNoteInput"
              role="textbox"
              aria-multiline="true"
              aria-label="Session note"
              contentEditable
              suppressContentEditableWarning
              data-rich-note-editor="true"
            />
            <div className="sessionNoteAttachments" id="historyEntryNoteAttachments" aria-live="polite" />
          </div>
        </div>
        <div className="confirmBtns">
          <button className="btn btn-ghost" id="historyEntryNoteCancelBtn" type="button" style={{ display: "none" }}>
            Cancel
          </button>
          <button className="btn btn-accent" id="historyEntryNoteSaveBtn" type="button" style={{ display: "none" }}>
            Save Note
          </button>
          <button className="btn btn-accent historyEntryNoteSaveAndCloseBtn" id="historyEntryNoteSaveAndCloseBtn" type="button" style={{ display: "none" }}>
            Save &amp; Close
          </button>
          <button className="btn btn-accent closePopup" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
