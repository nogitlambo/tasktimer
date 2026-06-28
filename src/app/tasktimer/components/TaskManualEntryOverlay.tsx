import AppImg from "@/components/AppImg";

export default function TaskManualEntryOverlay() {
  return (
    <div className="overlay" id="taskManualEntryOverlay" style={{ display: "none" }}>
      <div className="modal hmManualEntryModal" role="dialog" aria-modal="true" aria-label="Add manual history entry">
        <h2 id="taskManualEntryTitle">Add Manual Entry for This Task</h2>
        <div className="modalSubtext" id="taskManualEntryMeta" hidden />

        <div className="hmManualEntryModalBody">
          <div className="hmManualEntryTopRow">
            <div className="hmManualEntryField hmManualEntryDateTimeField">
              <label className="hmManualEntryLabel" htmlFor="taskManualDateTimeInput">
                Date/Time
              </label>
              <div className="hmManualEntryDateTimeWrap">
                <input
                  aria-readonly="true"
                  className="hmManualEntryInput hmManualEntryDateTimeInput"
                  id="taskManualDateTimeInput"
                  placeholder="---------- --:--"
                  tabIndex={-1}
                  type="datetime-local"
                />
                <button
                  aria-label="Open date and time picker"
                  className="hmManualEntryDateTimeBtn"
                  id="taskManualDateTimeBtn"
                  type="button"
                >
                  <svg aria-hidden="true" className="hmManualEntryDateTimeBtnIcon" viewBox="0 0 24 24">
                    <rect x="3.5" y="5" width="17" height="15" rx="2.5" ry="2.5" />
                    <path d="M8 3.5v4" />
                    <path d="M16 3.5v4" />
                    <path d="M3.5 9.5h17" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="hmManualEntryGoalRow">
              <div className="hmManualEntryGoalText">
                <span className="hmManualEntryLabel">Log Time Goal</span>
              </div>
              <button
                aria-checked="false"
                aria-label="Log time goal"
                className="switch"
                id="taskManualLogTimeGoalToggle"
                role="switch"
                type="button"
              />
            </div>

            <div className="hmManualEntryField hmManualEntryElapsedField" id="taskManualElapsedField">
              <label className="hmManualEntryLabel">Elapsed</label>
              <div className="hmManualEntryElapsedInputs">
                <input
                  aria-label="Elapsed hours"
                  className="hmManualEntryInput hmManualEntryNumber"
                  id="taskManualHoursInput"
                  inputMode="numeric"
                  spellCheck={false}
                  type="text"
                />
                <span className="hmManualEntryUnit">h</span>
                <input
                  aria-label="Elapsed minutes"
                  className="hmManualEntryInput hmManualEntryNumber"
                  id="taskManualMinutesInput"
                  inputMode="numeric"
                  spellCheck={false}
                  type="text"
                />
                <span className="hmManualEntryUnit">m</span>
              </div>
            </div>
          </div>

          <div className="hmManualEntryField hmManualEntryNoteField">
            <label className="hmManualEntryLabel historyEntryNoteEditorLabel" htmlFor="taskManualNoteInput">
              Session Notes
            </label>
            <div
              className="richNoteToolbar"
              role="toolbar"
              aria-label="Session note formatting"
              data-rich-note-toolbar="true"
              data-rich-note-for="taskManualNoteInput"
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
            </div>
            <div className="sessionNoteEditorGrid">
              <div
                className="text focusSessionNotesInput richNoteEditor hmManualEntryNoteInput"
                id="taskManualNoteInput"
                role="textbox"
                aria-multiline="true"
                aria-label="Session note"
                contentEditable
                suppressContentEditableWarning
                data-rich-note-editor="true"
              />
            </div>
          </div>

          <div className="hmManualEntryError" id="taskManualEntryError" style={{ display: "none" }} />
        </div>

        <div className="footerBtns hmManualEntryFooterBtns">
          <button className="btn btn-ghost" id="taskManualEntryCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="taskManualEntrySaveBtn" type="button">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
