"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";

type SettingsPaneKey =
  | "general"
  | "preferences"
  | "notifications"
  | "userGuide"
  | "about"
  | "feedback"
  | "data"
  | "reset";

function MenuIconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <img className="settingsMenuItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsMenuItemText">{label}</span>
    </>
  );
}

const EMAIL_LINK_STORAGE_KEY = "tasktimer:authEmailLinkPendingEmail";
const FRIEND_KEY_STORAGE_PREFIX = "tasktimer:friendInviteKey:";
function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}
function generateFriendInviteKey(length = 24) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+?";
  let out = "";
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const arr = new Uint32Array(length);
    window.crypto.getRandomValues(arr);
    for (let i = 0; i < length; i++) out += chars[arr[i] % chars.length];
    return out;
  }
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function formatRemainingTime(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

function SettingsNavTile({
  label,
  active,
  danger,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`menuItem settingsNavTile${active ? " isActive" : ""}${danger ? " isDanger" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="settingsNavRowText">{label}</span>
    </button>
  );
}

function SettingsDetailPane({
  active,
  title,
  subtitle,
  children,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`settingsDetailPane${active ? " isActive" : ""}`} aria-hidden={active ? "false" : "true"}>
      <div className="settingsDetailHead">
        <h2 className="settingsDetailTitle">{title}</h2>
        <p className="settingsDetailText">{subtitle}</p>
      </div>
      <div className="settingsDetailBody">{children}</div>
    </section>
  );
}

export default function SettingsPanel() {
  const [activePane, setActivePane] = useState<SettingsPaneKey | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [isEmailLinkFlow, setIsEmailLinkFlow] = useState(false);
  const [friendInviteKey, setFriendInviteKey] = useState<string | null>(null);
  const [friendInviteKeyExpiresAt, setFriendInviteKeyExpiresAt] = useState<number | null>(null);
  const [friendInviteKeyNow, setFriendInviteKeyNow] = useState<number>(Date.now());
  const [friendKeyCopyStatus, setFriendKeyCopyStatus] = useState("");
  const [showRemoveFriendKeyConfirm, setShowRemoveFriendKeyConfirm] = useState(false);
  const navItems = useMemo(
    () => [
      { key: "general" as const, label: "Account" },
      { key: "preferences" as const, label: "Preferences" },
      { key: "notifications" as const, label: "Notifications" },
      { key: "userGuide" as const, label: "Support" },
      { key: "about" as const, label: "About" },
      { key: "feedback" as const, label: "Feedback" },
      { key: "data" as const, label: "Data" },
      { key: "reset" as const, label: "Reset All" },
    ],
    []
  );
  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback = isValidFeedbackEmail && !!feedbackType && feedbackDetails.trim().length > 0;
  const isValidAuthEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || "";
      if (saved && !authEmail) setAuthEmail(saved);
    } catch {
      // ignore
    }
  }, [authEmail]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUserEmail(user?.email || null);
      setAuthUserUid(user?.uid || null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUserUid) {
      setFriendInviteKey(null);
      setFriendInviteKeyExpiresAt(null);
      return;
    }
    try {
      const raw = localStorage.getItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`);
      if (!raw) {
        setFriendInviteKey(null);
        setFriendInviteKeyExpiresAt(null);
        return;
      }
      const parsed = JSON.parse(raw) as { key?: unknown; expiresAt?: unknown };
      const key = typeof parsed.key === "string" ? parsed.key : "";
      const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : Number(parsed.expiresAt || 0);
      if (!key || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`);
        setFriendInviteKey(null);
        setFriendInviteKeyExpiresAt(null);
        return;
      }
      setFriendInviteKey(key);
      setFriendInviteKeyExpiresAt(expiresAt);
      setFriendInviteKeyNow(Date.now());
    } catch {
      setFriendInviteKey(null);
      setFriendInviteKeyExpiresAt(null);
    }
  }, [authUserUid]);

  useEffect(() => {
    if (!friendInviteKeyExpiresAt) return;
    if (friendInviteKeyExpiresAt <= Date.now()) {
      if (authUserUid) {
        try {
          localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`);
        } catch {
          // ignore
        }
      }
      setFriendInviteKey(null);
      setFriendInviteKeyExpiresAt(null);
      return;
    }
    const timer = window.setInterval(() => {
      const now = Date.now();
      setFriendInviteKeyNow(now);
      if (friendInviteKeyExpiresAt <= now) {
        if (authUserUid) {
          try {
            localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`);
          } catch {
            // ignore
          }
        }
        setFriendInviteKey(null);
        setFriendInviteKeyExpiresAt(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [friendInviteKeyExpiresAt, authUserUid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const href = window.location.href;
    const emailLink = isSignInWithEmailLink(auth, href);
    setIsEmailLinkFlow(emailLink);
    if (!emailLink) return;

    const complete = async () => {
      let email = "";
      try {
        email = (localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || "").trim();
      } catch {
        email = "";
      }
      if (!email) {
        setAuthStatus("Email sign-in link detected. Enter your email below, then click Complete Sign-In.");
        return;
      }
      setAuthBusy(true);
      setAuthError("");
      setAuthStatus("Completing sign-in...");
      try {
        await signInWithEmailLink(auth, email, href);
        try {
          localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
        } catch {
          // ignore
        }
        setAuthEmail(email);
        setAuthStatus("Signed in successfully.");
        try {
          const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
          window.history.replaceState({}, "", cleanUrl);
        } catch {
          // ignore
        }
        setIsEmailLinkFlow(false);
      } catch (err: unknown) {
        setAuthError(getErrorMessage(err, "Could not complete email sign-in."));
        setAuthStatus("");
      } finally {
        setAuthBusy(false);
      }
    };
    void complete();
  }, []);

  const getEmailLinkContinueUrl = () => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (/^https?:/i.test(origin)) return `${origin}/tasktimer/settings`;
    }
    return "https://tasktimer-prod.firebaseapp.com/tasktimer/settings";
  };

  const handleSendEmailLink = async () => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Enter a valid email address.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Sending sign-in link...");
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: getEmailLinkContinueUrl(),
        handleCodeInApp: true,
      });
      try {
        localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
      } catch {
        // ignore
      }
      setAuthStatus("Sign-in link sent. Open the link from your email on this device to complete sign-in.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not send sign-in link."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCompleteEmailLink = async () => {
    if (typeof window === "undefined") return;
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      setAuthError("No email sign-in link detected in this page URL.");
      setAuthStatus("");
      return;
    }
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Enter the same email address used to request the sign-in link.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Completing sign-in...");
    try {
      await signInWithEmailLink(auth, email, href);
      try {
        localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
      } catch {
        // ignore
      }
      setAuthStatus("Signed in successfully.");
      try {
        const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
        window.history.replaceState({}, "", cleanUrl);
      } catch {
        // ignore
      }
      setIsEmailLinkFlow(false);
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not complete email sign-in."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      await signOut(auth);
      setAuthStatus("Signed out.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not sign out."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGenerateFriendKey = () => {
    if (!authUserUid) return;
    const key = generateFriendInviteKey(24);
    const expiresAt = Date.now() + 60 * 60 * 1000;
    setFriendInviteKey(key);
    setFriendInviteKeyExpiresAt(expiresAt);
    setFriendInviteKeyNow(Date.now());
    try {
      localStorage.setItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`, JSON.stringify({ key, expiresAt }));
    } catch {
      // ignore
    }
    setFriendKeyCopyStatus("");
  };

  const handleRemoveFriendKey = () => {
    if (authUserUid) {
      try {
        localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${authUserUid}`);
      } catch {
        // ignore
      }
    }
    setFriendInviteKey(null);
    setFriendInviteKeyExpiresAt(null);
    setFriendKeyCopyStatus("");
    setShowRemoveFriendKeyConfirm(false);
  };

  const handleCopyFriendKey = async () => {
    if (!friendInviteKey) return;
    try {
      await navigator.clipboard.writeText(friendInviteKey);
      setFriendKeyCopyStatus("Copied");
      window.setTimeout(() => setFriendKeyCopyStatus(""), 1500);
    } catch {
      setFriendKeyCopyStatus("Copy failed");
      window.setTimeout(() => setFriendKeyCopyStatus(""), 1500);
    }
  };

  return (
    <div className="menu settingsMenu settingsDashboardShell dashboardShell" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Settings
        </div>
      </div>

      <div className={`settingsSplitLayout${mobileDetailOpen ? " isMobileDetailOpen" : ""}`}>
        <aside className="settingsNavPanel dashboardCard" aria-label="Settings navigation">
          <div className="settingsNavTopActions">
            <button className="menuIcon settingsCloseIcon settingsNavExitBtn" id="closeMenuBtn" type="button" aria-label="Back">
              &lt; Back
            </button>
          </div>
          <div className="settingsNavGrid">
            {navItems.map((item) => (
              <SettingsNavTile
                key={item.key}
                label={item.label}
                active={activePane === item.key}
                danger={item.key === "reset"}
                onClick={() => {
                  setActivePane(item.key);
                  setMobileDetailOpen(true);
                }}
              />
            ))}
          </div>
        </aside>

        <div className={`settingsDetailPanel dashboardCard${mobileDetailOpen ? " isMobileOpen" : ""}`}>
          <div className="settingsMobileDetailHead">
            <button
              type="button"
              className="btn btn-ghost small settingsMobileBackBtn"
              onClick={() => setMobileDetailOpen(false)}
              aria-label="Back to settings sections"
            >
              Back
            </button>
            <div className="settingsMobileDetailHeadTitle">
              {navItems.find((n) => n.key === activePane)?.label || "Settings"}
            </div>
          </div>
          {!activePane ? (
            <div className="settingsDetailEmpty" aria-live="polite">
              Select a module to view settings.
            </div>
          ) : null}
          <SettingsDetailPane
            active={activePane === "general"}
            title="Account"
            subtitle={authUserEmail ? "" : "Continue with email using a passwordless sign-in link."}
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                {!authUserEmail ? (
                  <>
                    <div className="settingsInlineSectionHead">
                      <img className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
                      <div className="settingsInlineSectionTitle">Continue with Email</div>
                    </div>
                  </>
                ) : null}
                {authUserEmail ? (
                  <div className="accountAvatarPlaceholder" aria-hidden="true">
                    <div className="accountAvatarPlaceholderInner" />
                  </div>
                ) : null}
                {!authUserEmail ? (
                  <div className="field">
                    <label htmlFor="authEmailInput">Email Address</label>
                    <input
                      id="authEmailInput"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={authEmail}
                      onChange={(e) => {
                        setAuthEmail(e.target.value);
                        setAuthError("");
                      }}
                    />
                  </div>
                ) : null}
                {authUserEmail ? (
                  <div className="settingsDetailNote">
                    <div>Signed in as: {authUserEmail}</div>
                    {authUserUid ? <div>UID: {authUserUid}</div> : null}
                    {authUserUid ? (
                      <div className="settingsFriendKeyBlock">
                        <button
                          className="btn btn-ghost small settingsFriendKeyBtn"
                          type="button"
                          onClick={handleGenerateFriendKey}
                        >
                          Generate Random Key
                        </button>
                        {friendInviteKey ? (
                          <>
                            <div className="settingsFriendKeyRow">
                              <div className="settingsFriendKeyValue">{friendInviteKey}</div>
                              <div className="settingsFriendKeyActions">
                                <button
                                  className="btn btn-ghost small settingsFriendKeyActionBtn"
                                  type="button"
                                  onClick={handleCopyFriendKey}
                                >
                                  Copy
                                </button>
                                  <button
                                    className="btn btn-ghost small settingsFriendKeyActionBtn settingsFriendKeyRemoveBtn"
                                    type="button"
                                    onClick={() => setShowRemoveFriendKeyConfirm(true)}
                                  >
                                    Remove
                                  </button>
                              </div>
                            </div>
                            {friendKeyCopyStatus ? (
                              <div className="settingsFriendKeyCopyStatus">{friendKeyCopyStatus}</div>
                            ) : null}
                            {friendInviteKeyExpiresAt ? (
                              <div className="settingsFriendKeyExpiry">
                                Expires in {formatRemainingTime(friendInviteKeyExpiresAt - friendInviteKeyNow)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="settingsFriendKeyExpiry">No active key. Keys expire after 60 minutes.</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {authStatus ? <div className="settingsAuthNotice">{authStatus}</div> : null}
                {authError ? <div className="settingsAuthError">{authError}</div> : null}
                <div className="settingsInlineFooter settingsAuthActions">
                  {!authUserEmail ? (
                    <button
                      className="btn btn-accent"
                      id="signInEmailBtn"
                      type="button"
                      disabled={authBusy || !isValidAuthEmail}
                      onClick={handleSendEmailLink}
                    >
                      Send Link
                    </button>
                  ) : null}
                  {!authUserEmail && isEmailLinkFlow ? (
                    <button
                      className="btn btn-ghost"
                      id="signUpBtn"
                      type="button"
                      disabled={authBusy || !isValidAuthEmail}
                      onClick={handleCompleteEmailLink}
                    >
                      Complete Sign-In
                    </button>
                  ) : null}
                  <button
                    className={authUserEmail ? "btn btn-accent" : "btn btn-ghost"}
                    id="signInGoogleBtn"
                    type="button"
                    disabled={authBusy || !authUserEmail}
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              </section>
            </div>
            {!authUserEmail ? (
              <div className="settingsDetailNote">
                Open the email link on this device to complete sign-in.
              </div>
            ) : null}
            {showRemoveFriendKeyConfirm ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowRemoveFriendKeyConfirm(false)}>
                <div
                  className="modal settingsInlineConfirmModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Remove Random Key"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="settingsInlineConfirmTitle">Remove Random Key</h3>
                  <p className="settingsInlineConfirmText">
                    Remove the current random key? This key will no longer be available to share.
                  </p>
                  <div className="footerBtns settingsInlineConfirmBtns">
                    <button className="btn btn-ghost" type="button" onClick={() => setShowRemoveFriendKeyConfirm(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-accent" type="button" onClick={handleRemoveFriendKey}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "preferences"}
            title="Preferences"
            subtitle="Configure task behavior, modes, dashboard options, and appearance."
          >
            <div className="settingsInlineStack">
              <details className="settingsInlineSection settingsInlineSectionCollapsible">
                <summary className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Task Settings</div>
                </summary>
                <div className="unitRow">
                  <span>Default Task Timer Format</span>
                  <div className="unitButtons">
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatDay" type="button">
                      Day
                    </button>
                    <button className="btn btn-ghost small unitBtn isOn" id="taskDefaultFormatHour" type="button">
                      Hour
                    </button>
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatMinute" type="button">
                      Minute
                    </button>
                  </div>
                </div>
              </details>

              <details className="settingsInlineSection settingsInlineSectionCollapsible">
                <summary className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Modes.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Configure Modes</div>
                </summary>
                <div className="field categoryFieldRow">
                  <label htmlFor="categoryMode1Input">Default Mode</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode1Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode1Color" type="color" aria-label="Mode 1 color" />
                    <input className="categoryColorHex" id="categoryMode1ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 1 hex color" />
                  </div>
                </div>
                <div className="modeSwitchesLabel">Modes</div>
                <div className="toggleRow">
                  <span id="categoryMode2ToggleLabel">Disable Mode 2</span>
                  <button className="switch on" id="categoryMode2Toggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="field categoryFieldRow" id="categoryMode2Row">
                  <label htmlFor="categoryMode2Input">Mode 2</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode2Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode2Color" type="color" aria-label="Mode 2 color" />
                    <input className="categoryColorHex" id="categoryMode2ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 2 hex color" />
                    <button className="categoryTrashBtn" id="categoryMode2TrashBtn" type="button" aria-label="Delete Mode 2 category">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="toggleRow">
                  <span id="categoryMode3ToggleLabel">Disable Mode 3</span>
                  <button className="switch on" id="categoryMode3Toggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="field categoryFieldRow" id="categoryMode3Row">
                  <label htmlFor="categoryMode3Input">Mode 3</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode3Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode3Color" type="color" aria-label="Mode 3 color" />
                    <input className="categoryColorHex" id="categoryMode3ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 3 hex color" />
                    <button className="categoryTrashBtn" id="categoryMode3TrashBtn" type="button" aria-label="Delete Mode 3 category">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </details>

              <details className="settingsInlineSection settingsInlineSectionCollapsible">
                <summary className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Appearance</div>
                </summary>
                <div className="toggleRow" id="themeToggleRow">
                  <span>Toggle between light and dark mode</span>
                  <button className="switch on" id="themeToggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="toggleRow" id="taskDynamicColorsToggleRow">
                  <span>Dynamic colors for progress and history</span>
                  <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
                </div>
              </details>

              <details className="settingsInlineSection settingsInlineSectionCollapsible">
                <summary className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Dashboard.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Dashboard Settings</div>
                </summary>
                <div className="settingsDetailNote">
                  Dashboard settings controls can be added here. The section is now part of Preferences and no longer opens a separate modal.
                </div>
                <button className="menuItem settingsActionRow" id="dashboardSettingsBtn" type="button">
                  <MenuIconLabel icon="/Dashboard.svg" label="Dashboard Settings" />
                </button>
              </details>
            </div>
            <div style={{ display: "none" }} aria-hidden="true">
              <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button" tabIndex={-1}>
                Save
              </button>
              <button className="btn btn-accent" id="categorySaveBtn" type="button" tabIndex={-1}>
                Save
              </button>
              <button className="btn btn-ghost" id="categoryResetBtn" type="button" tabIndex={-1}>
                Reset Defaults
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "notifications"}
            title="Notifications"
            subtitle="Manage checkpoint sound and toast alerts."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Checkpoint Alerts</div>
                </div>
                <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
                  <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
                  <div className="toggleRow" id="taskCheckpointSoundToggleRow">
                    <span>Enable sound alerts</span>
                    <button className="switch on" id="taskCheckpointSoundToggle" type="button" role="switch" aria-checked="true" />
                  </div>
                  <div className="toggleRow" id="taskCheckpointToastToggleRow">
                    <span>Enable toast alerts</span>
                    <button className="switch on" id="taskCheckpointToastToggle" type="button" role="switch" aria-checked="true" />
                  </div>
                </div>
              </section>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "userGuide"}
            title="Support"
            subtitle="Open the TaskTimer user guide and walkthrough content."
          >
            <div className="settingsActionGrid settingsDataTileGrid">
              <button className="menuItem settingsDataTile" data-menu="howto" type="button">
                <MenuIconLabel icon="/User_Guide.svg" label="Open User Guide" />
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "about"}
            title="About"
            subtitle="App summary, version information, and feature overview."
          >
            <div className="aboutText">
              <p style={{ marginTop: 0 }}>
                TaskTimer is a focused time-tracking app built to help you create better habits, manage repeatable
                routines, and review progress over time.
              </p>
              <p>
                It is designed for fast task control during active sessions, clear checkpoint visibility, and a workflow
                that works well on both mobile and desktop.
              </p>

              <p style={{ marginBottom: 6, fontWeight: 700 }}>What TaskTimer is for</p>
              <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                <li>Tracking focused work sessions and personal routines</li>
                <li>Monitoring progress against time checkpoints</li>
                <li>Reviewing completed sessions through history and charts</li>
                <li>Keeping task timing data portable with backup export/import</li>
              </ul>

              <p style={{ marginBottom: 6, fontWeight: 700 }}>Core features</p>
              <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                <li>Task timers with start/stop/reset, duplication, editing, and per-task settings</li>
                <li>Checkpoint milestones with labels, progress markers, and task-level alert behavior</li>
                <li>Sound and toast checkpoint notifications, including repeat-until-dismiss options</li>
                <li>Inline history charts with export, analysis, manage actions, and selectable data points</li>
                <li>Focus Mode with dial view, checkpoint markers, and completed checkpoint log</li>
                <li>Dashboard, Settings modules, and User Guide/Support flows optimized for desktop and mobile</li>
                <li>Backup export/import for tasks, history, modes, and task-specific configuration</li>
              </ul>

              <p style={{ margin: "12px 0 6px", fontWeight: 700 }}>Design approach</p>
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Fast access to common actions with minimal navigation</li>
                <li>High-contrast visuals for active timing and checkpoint feedback</li>
                <li>Responsive layouts that preserve usability on smaller screens</li>
              </ul>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "feedback"}
            title="Feedback"
            subtitle="Share product feedback and suggestions."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Feedback.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Feedback Form</div>
                </div>

                <div className="field">
                  <label htmlFor="feedbackEmailInput">Email Address</label>
                  <input
                    id="feedbackEmailInput"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    value={feedbackEmail}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="feedbackTypeSelect">Feedback Type</label>
                  <select
                    id="feedbackTypeSelect"
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value)}
                  >
                    <option value="" disabled>
                      --Please Select--
                    </option>
                    <option value="bug">Report a bug</option>
                    <option value="general">General feedback</option>
                    <option value="feature">Request a feature/enhancement</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="feedbackDetailsInput">Details</label>
                  <textarea
                    id="feedbackDetailsInput"
                    rows={6}
                    placeholder="Share details, steps to reproduce (if reporting a bug), or what you would like improved."
                    value={feedbackDetails}
                    onChange={(e) => setFeedbackDetails(e.target.value)}
                  />
                </div>

                <div className="settingsInlineFooter">
                  <button className="btn btn-accent" id="feedbackBtn" type="button" disabled={!canSubmitFeedback}>
                    Submit Feedback
                  </button>
                </div>
              </section>
            </div>
            <div className="settingsDetailNote">
              This is a mock feedback form layout. Submission handling can be wired to email, API, or issue tracking later.
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "data"}
            title="Data"
            subtitle="Manage history, export or import backups, and reset local data."
          >
            <div className="settingsActionGrid settingsDataTileGrid">
              <button className="menuItem settingsDataTile" data-menu="historyManager" id="historyManagerBtn" type="button">
                <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
              </button>
              <button className="menuItem settingsDataTile" id="exportBtn" type="button">
                <MenuIconLabel icon="/Export.svg" label="Export Backup" />
              </button>
              <button className="menuItem settingsDataTile" id="importBtn" type="button">
                <MenuIconLabel icon="/Import.svg" label="Import Backup" />
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "reset"}
            title="Reset All"
            subtitle="Clear local app data and reset the app state on this device."
          >
            <div className="settingsActionGrid settingsActionGridStack settingsActionRows">
              <button className="menuItem settingsActionRow" id="resetAllBtn" type="button">
                <MenuIconLabel icon="/Reset.svg" label="Reset All Data" />
              </button>
            </div>
            <div className="settingsDetailNote">
              This action is destructive. Export a backup first if you want to preserve tasks, history, and settings.
            </div>
          </SettingsDetailPane>

          <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
