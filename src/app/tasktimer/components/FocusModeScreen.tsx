import React from "react";

export default function FocusModeScreen() {
  return (
    <section id="focusModeScreen" aria-hidden="true">
      <div className="focusModeHead">
        <div className="focusModeHeadSpacer" aria-hidden="true" />
        <div className="focusModeTitle">Focus Mode</div>
        <div className="focusModeHeadSpacer" aria-hidden="true" />
      </div>
      <div className="focusTaskTitle" id="focusTaskName">
        TASKTIMER
      </div>
      <div className="focusDialWrap">
        <div className="focusDialPanel">
          <div className="focusDial" id="focusDial">
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
                <button className="btn btn-accent small" id="focusStartBtn" type="button">
                  Start
                </button>
                <button className="btn btn-warn small" id="focusStopBtn" type="button">
                  Stop
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="focusCheckpointToggleTop">
        <div className="focusCheckpointToggleRow">
          <span>Show checkpoints</span>
          <button className="switch on" id="focusCheckpointToggle" type="button" role="switch" aria-checked="true" />
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
          <span className="focusInsightLabel">Top productivity weekday</span>
          <span className="focusInsightValue" id="focusInsightWeekday">
            Need at least 14 logged days
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
      </div>
      <div className="focusModeExitWrap">
        <button className="btn btn-ghost small" id="focusModeBackBtn" type="button">
          Exit
        </button>
      </div>
    </section>
  );
}
