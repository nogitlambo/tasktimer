"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { createFeedbackItem, type FeedbackType } from "../lib/feedbackStore";
import { SettingsNav } from "./settings/SettingsShared";
import { SettingsAccountPane } from "./settings/SettingsAccountPane";
import { SettingsAppearancePane } from "./settings/SettingsAppearancePane";
import { SettingsDataPane } from "./settings/SettingsDataPane";
import { SettingsFeedbackPane } from "./settings/SettingsFeedbackPane";
import { SettingsHelpPane } from "./settings/SettingsHelpPane";
import { SettingsNotificationsPane, SettingsSoundsPane } from "./settings/SettingsNotificationsPane";
import { SettingsPreferencesPane } from "./settings/SettingsPreferencesPane";
import { SettingsPrivacyPane } from "./settings/SettingsPrivacyPane";
import { SettingsAboutPane } from "./settings/SettingsAboutPane";
import type { SettingsFeedbackState, SettingsPaneKey } from "./settings/types";
import { useSettingsAccountState } from "./settings/useSettingsAccountState";
import { useSettingsAvatarState } from "./settings/useSettingsAvatarState";
import { useSettingsNavItems, useSettingsPaneState } from "./settings/useSettingsPaneState";

export type { SettingsPaneKey } from "./settings/types";

const EMPTY_FEEDBACK: SettingsFeedbackState = {
  email: "",
  anonymous: false,
  type: "",
  details: "",
};

function buildSettingsFeedbackTitle(feedback: SettingsFeedbackState) {
  const details = feedback.details.trim().replace(/\s+/g, " ");
  if (!details) return "";
  return details.length > 120 ? `${details.slice(0, 117)}...` : details;
}

const SETTINGS_DETAIL_TITLES: Partial<Record<SettingsPaneKey, string>> = {
  general: "Profile",
  preferences: "Preferences",
  appearance: "Appearance",
  sounds: "Sounds & Alerts",
  notifications: "Notifications",
  privacy: "Privacy Policy",
  help: "Help Center",
  about: "About",
  feedback: "Feedback",
  data: "Data",
};

const SETTINGS_DETAIL_SUBTITLES: Partial<Record<SettingsPaneKey, string>> = {
  preferences: "Configure task behavior and dashboard options.",
  appearance: "Primary color and visual display options.",
  sounds: "Manage in-app sounds and checkpoint audio alerts.",
  notifications: "Manage push notifications and checkpoint toast alerts.",
  privacy: "Review Timebase's privacy policy, including data handling, local storage behavior, and account deletion information.",
  help: "Open privacy and feedback resources.",
  about: "TaskLaunch version and current build information",
  feedback: "Share product feedback and suggestions.",
  data: "Manage history, export or import backups, and reset local data.",
};

const TASKTIMER_SETTINGS_PREFERENCES_ACTIVE_EVENT = "tasktimer:settings-preferences-active";

export default function SettingsPanel({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  const navItems = useSettingsNavItems();
  const paneState = useSettingsPaneState(initialPane);
  const { setMobileDetailOpen } = paneState;
  const accountState = useSettingsAccountState({ nativeCheckoutReturnPath: "/settings" });
  const avatarState = useSettingsAvatarState({
    authUserUid: accountState.authUserUid,
    authUserEmail: accountState.authUserEmail,
    authIsAnonymous: accountState.authIsAnonymous,
    authHasGoogleProvider: accountState.authHasGoogleProvider,
    authGooglePhotoUrl: accountState.authGooglePhotoUrl,
    setAuthError: accountState.setAuthError,
    setAuthStatus: accountState.setAuthStatus,
  });
  const [feedback, setFeedback] = useState<SettingsFeedbackState>(EMPTY_FEEDBACK);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const canSubmitFeedback = useMemo(() => {
    const feedbackEmail = feedback.anonymous ? feedback.email : feedback.email || accountState.authUserEmail || "";
    const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
    return !feedbackSubmitting && (feedback.anonymous || isValidFeedbackEmail) && !!feedback.type && feedback.details.trim().length > 0;
  }, [accountState.authUserEmail, feedback, feedbackSubmitting]);

  const handleSubmitFeedback = useCallback(async () => {
    if (feedbackSubmitting) return;
    const feedbackEmail = feedback.anonymous ? "" : String(feedback.email || accountState.authUserEmail || "").trim();
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser || null;
    const uid = String(currentUser?.uid || accountState.authUserUid || "").trim();
    const type = String(feedback.type || "").trim() as FeedbackType;
    const title = buildSettingsFeedbackTitle(feedback);
    const details = feedback.details.trim();
    if (!uid) {
      setFeedbackStatus("");
      setFeedbackError("You must be signed in to submit feedback.");
      return;
    }
    if (!feedback.anonymous && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail)) {
      setFeedbackStatus("");
      setFeedbackError("Enter a valid email address before submitting feedback.");
      return;
    }
    if (type !== "bug" && type !== "feature" && type !== "general") {
      setFeedbackStatus("");
      setFeedbackError("Select a feedback type before submitting.");
      return;
    }
    if (!details || !title) {
      setFeedbackStatus("");
      setFeedbackError("Enter feedback details before submitting.");
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackStatus("");
    setFeedbackError("");
    try {
      const idToken = await currentUser?.getIdToken();
      const result = await createFeedbackItem({
        authToken: idToken || "",
        ownerUid: uid,
        authorDisplayName: accountState.account.authUserAlias || null,
        authorEmail: feedback.anonymous ? null : feedbackEmail,
        authorRankThumbnailSrc: null,
        authorCurrentRankId: null,
        isAnonymous: feedback.anonymous,
        type,
        title,
        details,
      });
      if (!result.ok) {
        setFeedbackError(result.message);
        return;
      }
      setFeedback(EMPTY_FEEDBACK);
      setFeedbackStatus("Feedback submitted successfully.");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "Could not submit feedback.";
      setFeedbackError(message);
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [accountState.account.authUserAlias, accountState.authUserEmail, accountState.authUserUid, feedback, feedbackSubmitting]);

  const activeDetailTitle = paneState.activePane ? SETTINGS_DETAIL_TITLES[paneState.activePane] || "Settings" : "Settings";
  const activeDetailSubtitle = paneState.activePane ? SETTINGS_DETAIL_SUBTITLES[paneState.activePane] || "" : "";

  useEffect(() => {
    function closeMobileDetail() {
      setMobileDetailOpen(false);
    }

    window.addEventListener("tasktimer:closeSettingsMobileDetail", closeMobileDetail);
    return () => window.removeEventListener("tasktimer:closeSettingsMobileDetail", closeMobileDetail);
  }, [setMobileDetailOpen]);

  useEffect(() => {
    if (paneState.activePane !== "preferences") return;
    const dispatchPreferencesActive = () => {
      window.dispatchEvent(new Event(TASKTIMER_SETTINGS_PREFERENCES_ACTIVE_EVENT));
    };
    dispatchPreferencesActive();
    const timerId = window.setTimeout(dispatchPreferencesActive, 0);
    return () => window.clearTimeout(timerId);
  }, [paneState.activePane]);

  return (
    <div
      className={`menu settingsMenu settingsDashboardShell dashboardShell${paneState.mobileDetailOpen ? " isMobileDetailOpen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
    >
      <div className="menuHead">
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

          <SettingsAccountPane
            active={paneState.activePane === "general"}
            exiting={paneState.exitingPane === "general"}
            account={accountState.account}
            avatar={avatarState}
          />
          <SettingsPreferencesPane active={paneState.activePane === "preferences"} exiting={paneState.exitingPane === "preferences"} />
          <SettingsAppearancePane active={paneState.activePane === "appearance"} exiting={paneState.exitingPane === "appearance"} />
          <SettingsSoundsPane active={paneState.activePane === "sounds"} exiting={paneState.exitingPane === "sounds"} />
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
            feedbackSubmitting={feedbackSubmitting}
            feedbackStatus={feedbackStatus}
            feedbackError={feedbackError}
            onSubmitFeedback={handleSubmitFeedback}
          />
          <SettingsDataPane active={paneState.activePane === "data"} exiting={paneState.exitingPane === "data"} />
        </div>
      </div>
      <div className="settingsMobileBackFooter" aria-hidden={paneState.mobileDetailOpen ? "false" : "true"}>
        <button
          type="button"
          className="btn btn-ghost small modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction settingsMobileBackBtn"
          onClick={paneState.closeMobileDetail}
          aria-label="Back to settings sections"
        >
          Back
        </button>
      </div>
    </div>
  );
}
