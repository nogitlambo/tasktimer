
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
            <textarea
              className="text focusSessionNotesInput"
              id="focusSessionNotesInput"
              rows={1}
              aria-label="Session Notes"
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
