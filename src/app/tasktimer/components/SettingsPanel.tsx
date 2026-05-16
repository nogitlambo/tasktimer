"use client";

import { useEffect, useMemo, useState } from "react";
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

const SETTINGS_DETAIL_TITLES: Partial<Record<SettingsPaneKey, string>> = {
  general: "Account",
  preferences: "Preferences",
  appearance: "Appearance",
  notifications: "Notifications",
  privacy: "Privacy Policy",
  help: "Help Center",
  about: "About",
  feedback: "Feedback",
  data: "Data",
};

const SETTINGS_DETAIL_SUBTITLES: Partial<Record<SettingsPaneKey, string>> = {
  preferences: "Configure task behavior and dashboard options.",
  appearance: "Choose your theme and visual display options.",
  notifications: "Manage push notifications, in-app sounds and toast alerts.",
  privacy: "Review Timebase's privacy policy, including data handling, local storage behavior, and account deletion information.",
  help: "Open privacy and feedback resources.",
  about: "Open the public About page for TaskLaunch's mission, philosophy, features, and neurodivergent-friendly productivity approach.",
  feedback: "Share product feedback and suggestions.",
  data: "Manage history, export or import backups, and reset local data.",
};

export default function SettingsPanel({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  const navItems = useSettingsNavItems();
  const paneState = useSettingsPaneState(initialPane);
  const { setMobileDetailOpen } = paneState;
  const accountState = useSettingsAccountState();
  const [feedback, setFeedback] = useState<SettingsFeedbackState>(EMPTY_FEEDBACK);

  const canSubmitFeedback = useMemo(() => {
    const feedbackEmail = feedback.anonymous ? feedback.email : feedback.email || accountState.authUserEmail || "";
    const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
    return (feedback.anonymous || isValidFeedbackEmail) && !!feedback.type && feedback.details.trim().length > 0;
  }, [accountState.authUserEmail, feedback]);

  const activeDetailTitle = paneState.activePane ? SETTINGS_DETAIL_TITLES[paneState.activePane] || "Settings" : "Settings";
  const activeDetailSubtitle = paneState.activePane ? SETTINGS_DETAIL_SUBTITLES[paneState.activePane] || "" : "";

  useEffect(() => {
    function closeMobileDetail() {
      setMobileDetailOpen(false);
    }

    window.addEventListener("tasktimer:closeSettingsMobileDetail", closeMobileDetail);
    return () => window.removeEventListener("tasktimer:closeSettingsMobileDetail", closeMobileDetail);
  }, [setMobileDetailOpen]);

  return (
    <div
      className={`menu settingsMenu settingsDashboardShell dashboardShell${paneState.mobileDetailOpen ? " isMobileDetailOpen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className="menuHead">
        <button
          type="button"
          className="btn btn-ghost small settingsMobileBackBtn"
          onClick={paneState.closeMobileDetail}
          aria-label="Back to settings sections"
        >
          ←
        </button>
        <div className="menuTitle" aria-label={paneState.mobileDetailOpen ? activeDetailTitle : "Task Timer Settings"}>
          <span className="settingsMenuTitleDefault">Settings</span>
          <span className="settingsMenuTitleActive">{activeDetailTitle}</span>
          {activeDetailSubtitle ? <span className="settingsMenuTitleText">{activeDetailSubtitle}</span> : null}
        </div>
      </div>

      <div
        className={`settingsSplitLayout${paneState.mobileDetailOpen ? " isMobileDetailOpen" : ""}`}
        data-settings-slide-direction={paneState.paneSlideDirection || undefined}
      >
        <SettingsNav
          navItems={navItems}
          activePane={paneState.activePane}
          onSelectPane={paneState.selectPane}
        />

        <div
          className={`settingsDetailPanel dashboardCard${paneState.mobileDetailOpen ? " isMobileOpen" : ""}`}
          data-settings-slide-direction={paneState.paneSlideDirection || undefined}
        >
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
