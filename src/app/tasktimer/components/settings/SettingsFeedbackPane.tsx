"use client";

import type { SettingsFeedbackState } from "./types";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsFeedbackPane({
  active,
  exiting = false,
  feedback,
  setFeedback,
  canSubmitFeedback,
}: {
  active: boolean;
  exiting?: boolean;
  feedback: SettingsFeedbackState;
  setFeedback: (next: SettingsFeedbackState) => void;
  canSubmitFeedback: boolean;
}) {
  return (
    <SettingsDetailPane active={active} exiting={exiting} title="Feedback" subtitle="Share product feedback and suggestions.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <div className="settingsInlineSectionTitle">Send Feedback</div>
          </div>
          <label className="settingsFormRow">
            <span>Email</span>
            <input
              id="feedbackEmailInput"
              className="settingsInput"
              type="email"
              value={feedback.email}
              onChange={(event) => setFeedback({ ...feedback, email: event.target.value })}
              disabled={feedback.anonymous}
              placeholder="you@example.com"
            />
          </label>
          <label className="chkRow">
            <input type="checkbox" checked={feedback.anonymous} onChange={(event) => setFeedback({ ...feedback, anonymous: event.target.checked })} />
            <span>Send anonymously</span>
          </label>
          <label className="settingsFormRow">
            <span>Type</span>
            <select id="feedbackTypeSelect" className="settingsInput" value={feedback.type} onChange={(event) => setFeedback({ ...feedback, type: event.target.value })}>
              <option value="">Select feedback type</option>
              <option value="bug">Bug Report</option>
              <option value="feature">Feature Request</option>
              <option value="general">General Feedback</option>
            </select>
          </label>
          <label className="settingsFormRow">
            <span>Details</span>
            <textarea
              id="feedbackDetailsInput"
              className="settingsInput settingsTextarea"
              value={feedback.details}
              onChange={(event) => setFeedback({ ...feedback, details: event.target.value })}
              rows={7}
              placeholder="Tell us what happened or what would help."
            />
          </label>
          <div className="settingsInlineFooter">
            <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={!canSubmitFeedback}>
              Send Feedback
            </button>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
