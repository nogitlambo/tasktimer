import AppImg from "@/components/AppImg";

export default function FocusModeScreen() {
  return (
    <section id="focusModeScreen" aria-hidden="true">
      <div className="focusModeHead">
        <div className="focusModeHeadSpacer" aria-hidden="true" />
        <div className="focusModeTitle">Focus Mode</div>
        <div className="focusModeHeadAction" aria-hidden="true" />
      </div>
      <div className="focusTaskTitle" id="focusTaskName">
        TASKTIMER
      </div>
      <div className="focusDialWrap">
        <div className="focusDialPanel">
          <button
            className="focusDial"
            id="focusDial"
            type="button"
            aria-label="Focus dial. Tap to launch timer"
            aria-pressed="false"
          >
            <div className="focusDialOuter" aria-hidden="true" />
            <div className="focusDialChassis" aria-hidden="true" />
            <div className="focusDialTickRing" aria-hidden="true" />
            <div className="focusDialGlowRing" aria-hidden="true" />
            <svg className="focusDialProgress" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
              <path className="focusDialProgressFill" d="" />
            </svg>
            <div className="focusCheckpointRing" id="focusCheckpointRing" aria-hidden="true" />
            <div className="focusDialInner" aria-hidden="true" />
            <div className="focusDialFace" aria-hidden="true" />
            <div className="focusDialCenter">
              <div className="focusDialDays" id="focusTimerDays">
                00d
              </div>
              <div className="focusDialTime" id="focusTimerClock">
                00:00:00
              </div>
              <div className="focusDialControls">
                <div className="focusDialHint" id="focusDialHint">
                  Tap to Launch
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>
      <div className="focusInsightsRow">
        <div className="focusSessionNotes" id="focusSessionNotesSection">
          <div className="focusInsightsTitle">Session Notes</div>
          <div className="focusSessionNotesBody">
            <div
              className="richNoteToolbar"
              role="toolbar"
              aria-label="Session note formatting"
              data-rich-note-toolbar="true"
              data-rich-note-for="focusSessionNotesInput"
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
            <div
              className="text focusSessionNotesInput richNoteEditor"
              id="focusSessionNotesInput"
              role="textbox"
              aria-multiline="true"
              aria-label="Session Notes"
              contentEditable
              suppressContentEditableWarning
              data-rich-note-editor="true"
            />
            <div className="focusSessionNotesSavedText" id="focusSessionNotesSavedText" aria-live="polite" />
          </div>
        </div>
      </div>
      <div className="focusDndSetup" id="focusDndSetup" hidden>
        <div className="focusInsightsTitle">Do Not Disturb Setup</div>
        <div className="focusDndSetupText" id="focusDndSetupText" aria-live="polite">
          Grant Android Do Not Disturb access to silence interruptions during Focus Mode.
        </div>
        <div className="focusDndSetupActions">
          <button className="btn btn-ghost small" id="focusDndAccessBtn" type="button">
            DND Access
          </button>
        </div>
      </div>
      <div className="focusModeExitBar">
        <button className="btn btn-ghost small" id="focusModeBackBtn" type="button">
          Exit
        </button>
      </div>
    </section>
  );
}
