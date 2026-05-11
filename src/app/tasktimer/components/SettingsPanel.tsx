"use client";

import { useMemo, useState } from "react";
import { SettingsNav } from "./settings/SettingsShared";
import { SettingsAppearancePane } from "./settings/SettingsAppearancePane";
import { SettingsDataPane } from "./settings/SettingsDataPane";
import { SettingsFeedbackPane } from "./settings/SettingsFeedbackPane";
import { SettingsHelpPane } from "./settings/SettingsHelpPane";
import { SettingsNotificationsPane } from "./settings/SettingsNotificationsPane";
import { SettingsPreferencesPane } from "./settings/SettingsPreferencesPane";
import { SettingsPrivacyPane } from "./settings/SettingsPrivacyPane";
import { SettingsAboutPane } from "./settings/SettingsAboutPane";
import type { SettingsFeedbackState, SettingsPaneKey } from "./settings/types";
import { useSettingsAccountState } from "./settings/useSettingsAccountState";
import { useSettingsNavItems, useSettingsPaneState } from "./settings/useSettingsPaneState";

export type { SettingsPaneKey } from "./settings/types";

const EMPTY_FEEDBACK: SettingsFeedbackState = {
  email: "",
  anonymous: false,
  type: "",
  details: "",
};

export default function SettingsPanel({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  const navItems = useSettingsNavItems();
  const paneState = useSettingsPaneState(initialPane);
  const accountState = useSettingsAccountState();
  const [feedback, setFeedback] = useState<SettingsFeedbackState>(EMPTY_FEEDBACK);

  const canSubmitFeedback = useMemo(() => {
    const feedbackEmail = feedback.anonymous ? feedback.email : feedback.email || accountState.authUserEmail || "";
    const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
    return (feedback.anonymous || isValidFeedbackEmail) && !!feedback.type && feedback.details.trim().length > 0;
  }, [accountState.authUserEmail, feedback]);

  return (
    <div className="menu settingsMenu settingsDashboardShell dashboardShell" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Settings
        </div>
      </div>

      <div className={`settingsSplitLayout${paneState.mobileDetailOpen ? " isMobileDetailOpen" : ""}`}>
        <SettingsNav
          navItems={navItems}
          activePane={paneState.activePane}
          onSelectPane={paneState.selectPane}
        />

        <div
          className={`settingsDetailPanel dashboardCard${paneState.mobileDetailOpen ? " isMobileOpen" : ""}`}
          data-settings-slide-direction={paneState.paneSlideDirection || undefined}
        >
          <div className="settingsMobileDetailHead">
            <button
              type="button"
              className="btn btn-ghost small settingsMobileBackBtn"
              onClick={() => paneState.setMobileDetailOpen(false)}
              aria-label="Back to settings sections"
            >
              Back
            </button>
            <div className="settingsMobileDetailHeadTitle">{navItems.find((item) => item.key === paneState.activePane)?.label || "Settings"}</div>
          </div>

          {!paneState.activePane ? (
            <div className="settingsDetailEmpty" aria-live="polite">
              Select a module to view settings.
            </div>
          ) : null}

          <SettingsPreferencesPane active={paneState.activePane === "preferences"} exiting={paneState.exitingPane === "preferences"} />
          <SettingsAppearancePane active={paneState.activePane === "appearance"} exiting={paneState.exitingPane === "appearance"} />
          <SettingsNotificationsPane active={paneState.activePane === "notifications"} exiting={paneState.exitingPane === "notifications"} />
          <SettingsPrivacyPane active={paneState.activePane === "privacy"} exiting={paneState.exitingPane === "privacy"} />
          <SettingsHelpPane active={paneState.activePane === "help"} exiting={paneState.exitingPane === "help"} />
          <SettingsAboutPane active={paneState.activePane === "about"} exiting={paneState.exitingPane === "about"} />
          <SettingsFeedbackPane
            active={paneState.activePane === "feedback"}
            exiting={paneState.exitingPane === "feedback"}
            feedback={{ ...feedback, email: feedback.anonymous ? feedback.email : feedback.email || accountState.authUserEmail || "" }}
            setFeedback={setFeedback}
            canSubmitFeedback={canSubmitFeedback}
          />
          <SettingsDataPane active={paneState.activePane === "data"} exiting={paneState.exitingPane === "data"} />
        </div>
      </div>
    </div>
  );
}
