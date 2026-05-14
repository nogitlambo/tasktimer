
export default function FocusModeScreen() {
  return (
    <section id="focusModeScreen" aria-hidden="true">
      <div className="focusModeHead">
        <div className="focusModeHeadSpacer" aria-hidden="true" />
        <div className="focusModeTitle">Focus Mode</div>
        <div className="focusModeHeadAction">
          <button className="btn btn-ghost small" id="focusModeBackBtn" type="button">
            Exit
          </button>
        </div>
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
            <div className="focusDialProgress" aria-hidden="true" />
            <div className="focusCheckpointRing" id="focusCheckpointRing" aria-hidden="true" />
            <div className="focusDialInner" aria-hidden="true" />
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
      <div className="focusCheckpointToggleTop">
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
      <div className="focusInsights" id="focusInsights">
        <div className="focusInsightsTitle">Quick Stats</div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">Highest logged time</span>
          <span className="focusInsightValue" id="focusInsightBest">
            --
          </span>
        </div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">Top optimal-day weekday</span>
          <span className="focusInsightValue" id="focusInsightWeekday">
            No logged sessions yet
          </span>
        </div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">Today vs yesterday</span>
          <span className="focusInsightValue" id="focusInsightTodayDelta">
            --
          </span>
        </div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">This week vs last week</span>
          <span className="focusInsightValue" id="focusInsightWeekDelta">
            --
          </span>
        </div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">Recent challenge level</span>
          <span className="focusInsightValue" id="focusInsightDifficulty">
            No challenge ratings yet
          </span>
        </div>
        <div className="focusInsightRow">
          <span className="focusInsightLabel">In productivity period on optimal days</span>
          <span className="focusInsightValue" id="focusInsightProductivityPeriod">
            --
          </span>
        </div>
      </div>
    </section>
  );
}
