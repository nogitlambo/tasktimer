"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithRedirect,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
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
const AVATAR_SELECTION_STORAGE_PREFIX = "tasktimer:avatarSelection:";
const DEFAULT_AVATARS = [
  { id: "initials-AN", src: "/avatars/initials-AN.svg", label: "Initials AN" },
];
type AvatarOption = { id: string; src: string; label: string };
function formatMemberSinceDate(value: string | null) {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function shouldUseRedirectAuth() {
  if (typeof window === "undefined") return false;
  const w = window as Window & { Capacitor?: unknown };
  return !!w.Capacitor || window.location.protocol === "file:";
}
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
  const [authUserAlias, setAuthUserAlias] = useState("");
  const [authMemberSince, setAuthMemberSince] = useState<string | null>(null);
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);
  const [isEmailLinkFlow, setIsEmailLinkFlow] = useState(false);
  const [friendInviteKey, setFriendInviteKey] = useState<string | null>(null);
  const [friendInviteKeyExpiresAt, setFriendInviteKeyExpiresAt] = useState<number | null>(null);
  const [friendInviteKeyNow, setFriendInviteKeyNow] = useState<number>(Date.now());
  const [friendKeyCopyStatus, setFriendKeyCopyStatus] = useState("");
  const [showRemoveFriendKeyConfirm, setShowRemoveFriendKeyConfirm] = useState(false);
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>(DEFAULT_AVATARS);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(DEFAULT_AVATARS[0]?.id || "");
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
      const nextAlias = (user?.displayName || "").trim();
      setAuthUserAlias(nextAlias);
      setAliasDraft(nextAlias);
      setAuthMemberSince(user?.metadata?.creationTime || null);
      setIsEditingAlias(false);
      if (user) setShowEmailLoginForm(false);
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
    if (!authUserUid) {
      setSelectedAvatarId((prev) => prev || avatarOptions[0]?.id || "");
      return;
    }
    const nextId = avatarOptions.some((a) => a.id === selectedAvatarId) ? selectedAvatarId : avatarOptions[0]?.id || "";
    if (nextId !== selectedAvatarId) setSelectedAvatarId(nextId);
  }, [avatarOptions, selectedAvatarId]);

  useEffect(() => {
    let cancelled = false;
    const loadAvatarOptions = async () => {
      try {
        const res = await fetch("/api/avatars", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { avatars?: AvatarOption[] };
        const next = Array.isArray(data.avatars)
          ? data.avatars.filter(
              (a): a is AvatarOption =>
                !!a &&
                typeof a.id === "string" &&
                typeof a.src === "string" &&
                typeof a.label === "string" &&
                a.id.trim() !== "" &&
                a.src.trim() !== ""
            )
          : [];
        if (!cancelled && next.length) setAvatarOptions(next);
      } catch {
        // ignore and keep defaults
      }
    };
    void loadAvatarOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showAvatarPickerModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAvatarPickerModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAvatarPickerModal]);

  useEffect(() => {
    if (!authUserUid) {
      setSelectedAvatarId(avatarOptions[0]?.id || "");
      return;
    }
    try {
      const saved = localStorage.getItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${authUserUid}`) || "";
      const nextId = avatarOptions.some((a) => a.id === saved) ? saved : avatarOptions[0]?.id || "";
      setSelectedAvatarId(nextId);
    } catch {
      setSelectedAvatarId(avatarOptions[0]?.id || "");
    }
  }, [authUserUid, avatarOptions]);

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

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const applyRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled || !result?.user) return;
        setAuthStatus("Signed in successfully.");
        setAuthError("");
      } catch (err: unknown) {
        if (cancelled) return;
        setAuthError(getErrorMessage(err, "Could not complete Google sign-in."));
        setAuthStatus("");
      }
    };
    void applyRedirectResult();
    return () => {
      cancelled = true;
    };
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

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Signing in with Google...");
    try {
      const provider = new GoogleAuthProvider();
      if (shouldUseRedirectAuth()) {
        await signInWithRedirect(auth, provider);
        return;
      }
      await signInWithPopup(auth, provider);
      setAuthStatus("Signed in successfully.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not sign in with Google."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveAlias = async () => {
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    if (!auth || !user) {
      setAuthError("You must be signed in to update your alias.");
      setAuthStatus("");
      return;
    }
    const nextAlias = aliasDraft.trim().slice(0, 15);
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Saving alias...");
    try {
      await updateProfile(user, { displayName: nextAlias || null });
      setAuthUserAlias(nextAlias);
      setAliasDraft(nextAlias);
      setIsEditingAlias(false);
      setAuthStatus("Alias updated.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not update alias."));
      setAuthStatus("");
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

  const handleSelectAvatar = (avatarId: string) => {
    setSelectedAvatarId(avatarId);
    if (!authUserUid) return;
    try {
      localStorage.setItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${authUserUid}`, avatarId);
    } catch {
      // ignore
    }
    setShowAvatarPickerModal(false);
  };

  const selectedAvatar = avatarOptions.find((a) => a.id === selectedAvatarId) || avatarOptions[0] || null;

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
            subtitle={authUserEmail ? "" : ""}
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                {!authUserEmail ? (
                  <>
                    <div className="settingsInlineSectionHead">
                      <img className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
                      <div className="settingsInlineSectionTitle">Sign Up or Sign In with email or Google</div>
                    </div>
                  </>
                ) : null}
                {authUserEmail ? (
                  <div className="settingsAvatarPicker" aria-label="Avatar selection">
                    <div className="settingsAccountProfileRow">
                      <div className="settingsAvatarCol">
                        <button
                          type="button"
                          className="accountAvatarFrameBtn"
                          onClick={() => setShowAvatarPickerModal(true)}
                          aria-label="Choose avatar"
                        >
                          <div className="accountAvatarPlaceholder">
                            {selectedAvatar ? (
                              <img
                                className="accountAvatarImage"
                                src={selectedAvatar.src}
                                alt={`${selectedAvatar.label} avatar`}
                              />
                            ) : (
                              <div className="accountAvatarPlaceholderInner" />
                            )}
                          </div>
                        </button>
                        <div className="settingsAvatarPickerLabel">Tap avatar to change</div>
                      </div>
                      <div className="settingsAccountMeta">
                        <div className="settingsAccountFieldRow">
                          <div className="settingsAccountFieldLabel">Name/Alias</div>
                          {isEditingAlias ? (
                            <div className="settingsAccountAliasEditor">
                              <input
                                type="text"
                                value={aliasDraft}
                                maxLength={15}
                                onChange={(e) => setAliasDraft(e.target.value.slice(0, 15))}
                                className="settingsAccountAliasInput"
                                aria-label="Edit name alias"
                              />
                              <button
                                type="button"
                                className="btn btn-ghost small"
                                onClick={handleSaveAlias}
                                disabled={authBusy}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost small"
                                onClick={() => {
                                  setAliasDraft(authUserAlias);
                                  setIsEditingAlias(false);
                                }}
                                disabled={authBusy}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="settingsAccountFieldValueRow">
                              <div className="settingsAccountFieldValue">{authUserAlias || "-"}</div>
                              <button
                                type="button"
                                className="iconBtn settingsAliasEditBtn"
                                aria-label="Edit alias"
                                onClick={() => setIsEditingAlias(true)}
                              >
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                  <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92-9.06 9.06zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.14z" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="settingsAccountFieldRow">
                          <div className="settingsAccountFieldLabel">Member since</div>
                          <div className="settingsAccountFieldValue">{formatMemberSinceDate(authMemberSince)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!authUserEmail ? (
                  <div className="settingsAuthChooser">
                    <button
                      type="button"
                      className="settingsAuthOptionBtn"
                      onClick={() => setShowEmailLoginForm((v) => !v)}
                      aria-expanded={showEmailLoginForm ? "true" : "false"}
                    >
                      <span className="settingsAuthOptionIcon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v.4l8 5.1 8-5.1V8H4zm16 8V10.76l-7.46 4.75a1 1 0 0 1-1.08 0L4 10.76V16h16z" />
                        </svg>
                      </span>
                      <span>{showEmailLoginForm ? "Email login" : "Login with email"}</span>
                    </button>
                    <button
                      className="settingsAuthOptionBtn"
                      id="signInGoogleBtn"
                      type="button"
                      disabled={authBusy}
                      onClick={handleGoogleSignIn}
                    >
                      <span className="settingsAuthOptionIcon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path fill="#EA4335" d="M12.24 10.29v3.93h5.47c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.42-.19-2.09h-9.57z"/>
                          <path fill="#4285F4" d="M12 22c2.75 0 5.06-.91 6.74-2.47l-3.3-2.56c-.91.61-2.08.98-3.44.98-2.65 0-4.89-1.79-5.69-4.19H2.9v2.63A10 10 0 0 0 12 22z"/>
                          <path fill="#FBBC05" d="M6.31 13.76A5.99 5.99 0 0 1 6 12c0-.61.11-1.2.31-1.76V7.61H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13.9 4.39l3.41-2.63z"/>
                          <path fill="#34A853" d="M12 6.05c1.49 0 2.82.51 3.87 1.51l2.9-2.9C17.05 3.05 14.74 2 12 2A10 10 0 0 0 2.9 7.61l3.41 2.63c.8-2.4 3.04-4.19 5.69-4.19z"/>
                        </svg>
                      </span>
                      <span>Login with Google</span>
                    </button>
                    {showEmailLoginForm ? (
                      <div className="settingsAuthEmailForm">
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
                      </div>
                    ) : null}
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
                    <>
                      {showEmailLoginForm ? (
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
                    </>
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
                  {authUserEmail ? (
                    <button
                      className="btn btn-accent"
                      id="signInGoogleBtn"
                      type="button"
                      disabled={authBusy}
                      onClick={handleSignOut}
                    >
                      Sign Out
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
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
            {showAvatarPickerModal ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowAvatarPickerModal(false)}>
                <div
                  className="modal settingsAvatarModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Choose Avatar"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="settingsInlineConfirmTitle">Choose Avatar</h3>
                  <div className="settingsAvatarOptions" role="list" aria-label="Available avatars">
                    {avatarOptions.map((avatar) => (
                      <button
                        key={avatar.id}
                        type="button"
                        className={`settingsAvatarOption${selectedAvatarId === avatar.id ? " isSelected" : ""}`}
                        onClick={() => handleSelectAvatar(avatar.id)}
                        aria-pressed={selectedAvatarId === avatar.id}
                        title={avatar.label}
                      >
                        <img src={avatar.src} alt={avatar.label} className="settingsAvatarOptionImg" />
                        <span className="settingsAvatarOptionLabel">{avatar.label}</span>
                        {selectedAvatarId === avatar.id ? (
                          <span className="settingsAvatarOptionSelected" aria-hidden="true">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                  <div className="footerBtns settingsInlineConfirmBtns">
                    <button className="btn btn-ghost" type="button" onClick={() => setShowAvatarPickerModal(false)}>
                      Cancel
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
