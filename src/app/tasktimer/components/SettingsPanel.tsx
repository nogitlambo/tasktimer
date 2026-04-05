"use client";

import { useMemo, useState } from "react";
import { SettingsNav } from "./settings/SettingsShared";
import { SettingsAccountPane } from "./settings/SettingsAccountPane";
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
import { useSettingsAvatarState } from "./settings/useSettingsAvatarState";
import { useSettingsNavItems, useSettingsPaneState } from "./settings/useSettingsPaneState";
import { useSettingsPushState } from "./settings/useSettingsPushState";

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
  const pushState = useSettingsPushState(accountState.authUserUid);
  const avatarState = useSettingsAvatarState({
    authUserUid: accountState.authUserUid,
    authHasGoogleProvider: accountState.authHasGoogleProvider,
    authGooglePhotoUrl: accountState.authGooglePhotoUrl,
    setAuthError: accountState.setAuthError,
    setAuthStatus: accountState.setAuthStatus,
  });
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
        <SettingsNav navItems={navItems} activePane={paneState.activePane} onSelectPane={paneState.selectPane} />

        <div className={`settingsDetailPanel dashboardCard${paneState.mobileDetailOpen ? " isMobileOpen" : ""}`}>
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

          <SettingsAccountPane active={paneState.activePane === "general"} account={accountState.account} avatar={avatarState} push={pushState} />
          <SettingsPreferencesPane active={paneState.activePane === "preferences"} />
          <SettingsAppearancePane active={paneState.activePane === "appearance"} />
          <SettingsNotificationsPane active={paneState.activePane === "notifications"} />
          <SettingsPrivacyPane active={paneState.activePane === "privacy"} />
          <SettingsHelpPane active={paneState.activePane === "userGuide"} />
          <SettingsAboutPane active={paneState.activePane === "about"} />
          <SettingsFeedbackPane
            active={paneState.activePane === "feedback"}
            feedback={{ ...feedback, email: feedback.anonymous ? feedback.email : feedback.email || accountState.authUserEmail || "" }}
            setFeedback={setFeedback}
            canSubmitFeedback={canSubmitFeedback}
          />
          <SettingsDataPane active={paneState.activePane === "data"} />
        </div>
      </div>
    </div>
  );
}
