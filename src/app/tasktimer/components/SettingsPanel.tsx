"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  deleteUser,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  signOut,
  type User,
  updateProfile,
} from "firebase/auth";
import { AVATAR_CATALOG, type AvatarOption } from "@/app/tasktimer/lib/avatarCatalog";

type SettingsPaneKey =
  | "general"
  | "preferences"
  | "notifications"
  | "privacy"
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

const FRIEND_KEY_STORAGE_PREFIX = "tasktimer:friendInviteKey:";
const AVATAR_SELECTION_STORAGE_PREFIX = "tasktimer:avatarSelection:";
const ACCOUNT_DELETE_REAUTH_PENDING_KEY = "tasktimer:accountDeletePendingReauth";
const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";
type AvatarGroup = { key: string; title: string; items: AvatarOption[] };
function formatMemberSinceDate(value: string | null) {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

function shouldUseRedirectAuth() {
  if (typeof window === "undefined") return false;
  const w = window as Window & { Capacitor?: unknown };
  return !!w.Capacitor || window.location.protocol === "file:";
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
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [authUserAlias, setAuthUserAlias] = useState("");
  const [authMemberSince, setAuthMemberSince] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("Sign in to sync preferences.");
  const [syncAtMs, setSyncAtMs] = useState<number | null>(null);
  const [isEditingAlias, setIsEditingAlias] = useState(false);
  const [aliasDraft, setAliasDraft] = useState("");
  const [friendInviteKey, setFriendInviteKey] = useState<string | null>(null);
  const [friendInviteKeyExpiresAt, setFriendInviteKeyExpiresAt] = useState<number | null>(null);
  const [friendInviteKeyNow, setFriendInviteKeyNow] = useState<number>(Date.now());
  const [friendKeyCopyStatus, setFriendKeyCopyStatus] = useState("");
  const [showRemoveFriendKeyConfirm, setShowRemoveFriendKeyConfirm] = useState(false);
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [avatarOptions] = useState<AvatarOption[]>(AVATAR_CATALOG);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(AVATAR_CATALOG[0]?.id || "");
  const navItems = useMemo(
    () => [
      { key: "general" as const, label: "Account" },
      { key: "preferences" as const, label: "Preferences" },
      { key: "notifications" as const, label: "Notifications" },
      { key: "privacy" as const, label: "Privacy Policy" },
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
  const avatarGroups = useMemo<AvatarGroup[]>(() => {
    const groups = new Map<string, AvatarOption[]>();
    for (const avatar of avatarOptions) {
      const normalizedId = String(avatar.id || "").replace(/\\/g, "/");
      const parts = normalizedId.split("/");
      const folder = parts.length > 1 ? parts[parts.length - 2] || "misc" : "misc";
      const key = folder.trim() || "misc";
      const existing = groups.get(key);
      if (existing) existing.push(avatar);
      else groups.set(key, [avatar]);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({
        key,
        title: key.replace(/[-_]+/g, " ").trim().toUpperCase(),
        items: items.slice().sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [avatarOptions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
    if (!isMobileViewport) {
      setActivePane((prev) => prev ?? "general");
    }
  }, []);

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
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const onSyncState = (evt: Event) => {
      const custom = evt as CustomEvent<{ status?: unknown; message?: unknown; atMs?: unknown }>;
      const nextStatus = String(custom.detail?.status || "").trim();
      const nextMessage = String(custom.detail?.message || "").trim();
      const nextAtMs = Number(custom.detail?.atMs || 0);
      if (nextStatus === "idle" || nextStatus === "syncing" || nextStatus === "synced" || nextStatus === "error") {
        setSyncState(nextStatus);
      }
      if (nextMessage) setSyncMessage(nextMessage);
      if (Number.isFinite(nextAtMs) && nextAtMs > 0) setSyncAtMs(nextAtMs);
    };
    window.addEventListener("tasktimer:preferences-sync-state", onSyncState as EventListener);
    return () => {
      window.removeEventListener("tasktimer:preferences-sync-state", onSyncState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (authUserEmail) {
      if (syncState === "idle") {
        setSyncState("syncing");
        setSyncMessage("Syncing preferences...");
      }
      return;
    }
    setSyncState("idle");
    setSyncMessage("Sign in to sync preferences.");
    setSyncAtMs(null);
  }, [authUserEmail, syncState]);

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
  }, [authUserUid, avatarOptions, selectedAvatarId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const resumePendingDelete = async () => {
      let pendingDelete = false;
      try {
        pendingDelete = localStorage.getItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY) === "1";
      } catch {
        pendingDelete = false;
      }
      if (!pendingDelete) return;
      try {
        await getRedirectResult(auth);
      } catch (err: unknown) {
        if (cancelled) return;
        try {
          localStorage.removeItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY);
        } catch {
          // ignore
        }
        setAuthError(getErrorMessage(err, "Could not complete Google re-authentication for account deletion."));
        setAuthStatus("");
        return;
      }
      if (cancelled) return;
      if (!auth.currentUser) return;
      try {
        localStorage.removeItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY);
      } catch {
        // ignore
      }
      setShowDeleteAccountConfirm(false);
      setAuthStatus("Re-authentication complete. Deleting account...");
      setAuthError("");
      setAuthBusy(true);
      try {
        const deleteUid = auth.currentUser.uid;
        await deleteUser(auth.currentUser);
        try {
          localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${deleteUid}`);
          localStorage.removeItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${deleteUid}`);
        } catch {
          // ignore
        }
        setAuthStatus("Account deleted.");
        if (typeof window !== "undefined") window.location.assign("/");
      } catch (err: unknown) {
        setAuthError(getErrorMessage(err, "Could not delete account."));
        setAuthStatus("");
      } finally {
        setAuthBusy(false);
      }
    };
    void resumePendingDelete();
    return () => {
      cancelled = true;
    };
  }, [authUserUid]);

  useEffect(() => {
    if (!authUserUid) return;
    const onCloudApplied = () => {
      try {
        const saved = localStorage.getItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${authUserUid}`) || "";
        const nextId = avatarOptions.some((a) => a.id === saved) ? saved : avatarOptions[0]?.id || "";
        setSelectedAvatarId(nextId);
      } catch {
        setSelectedAvatarId(avatarOptions[0]?.id || "");
      }
    };
    window.addEventListener("tasktimer:preferences-cloud-applied", onCloudApplied as EventListener);
    return () => {
      window.removeEventListener("tasktimer:preferences-cloud-applied", onCloudApplied as EventListener);
    };
  }, [authUserUid, avatarOptions]);

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
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SIGN_OUT_LANDING_BYPASS_KEY, "1");
        } catch {
          // ignore
        }
        window.location.assign("/?signedOut=1");
      }
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not sign out."));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    if (!auth || !user) {
      setAuthError("You must be signed in to delete your account.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Deleting account...");
    setShowDeleteAccountConfirm(false);
    const deleteSignedInUser = async (targetUser: User) => {
      const deleteUid = targetUser.uid;
      await deleteUser(targetUser);
      try {
        localStorage.removeItem(`${FRIEND_KEY_STORAGE_PREFIX}${deleteUid}`);
        localStorage.removeItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${deleteUid}`);
        localStorage.removeItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY);
      } catch {
        // ignore
      }
      setAuthStatus("Account deleted.");
      if (typeof window !== "undefined") window.location.assign("/");
    };
    try {
      await deleteSignedInUser(user);
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
      const providerIds = new Set(
        (user.providerData || []).map((provider) => String(provider?.providerId || "")).filter(Boolean)
      );
      const canUseGoogleReauth = providerIds.has("google.com");
      if (code === "auth/requires-recent-login") {
        if (canUseGoogleReauth) {
          const provider = new GoogleAuthProvider();
          try {
            setAuthStatus("Recent sign-in required. Re-authenticating with Google...");
            setAuthError("");
            if (shouldUseRedirectAuth()) {
              try {
                localStorage.setItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY, "1");
              } catch {
                // ignore
              }
              await reauthenticateWithRedirect(user, provider);
              return;
            }
            await reauthenticateWithPopup(user, provider);
            const currentUser = auth.currentUser || user;
            await deleteSignedInUser(currentUser);
            return;
          } catch (reauthErr: unknown) {
            setAuthError(getErrorMessage(reauthErr, "Could not re-authenticate to delete your account."));
            setAuthStatus("");
            try {
              localStorage.removeItem(ACCOUNT_DELETE_REAUTH_PENDING_KEY);
            } catch {
              // ignore
            }
            return;
          }
        }
        setAuthError(
          "Recent sign-in required. Sign out, sign in again, then retry Delete Account."
        );
        setAuthStatus("");
        return;
      }
      setAuthError(getErrorMessage(err, "Could not delete account."));
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
            <button className="btn btn-ghost small settingsNavExitBtn" id="closeMenuBtn" type="button" aria-label="Close">
              Close
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
            subtitle=""
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
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
                {authUserEmail ? (
                  <div className="settingsDetailNote">
                    <div>Signed in as: {authUserEmail}</div>
                    {authUserUid ? <div>UID: {authUserUid}</div> : null}
                    <div className={`settingsSyncStatus is-${syncState}`}>
                      <span className="settingsSyncStatusDot" aria-hidden="true" />
                      <span className="settingsSyncStatusText">{syncMessage}</span>
                      {syncAtMs && syncState === "synced" ? (
                        <span className="settingsSyncStatusTime">
                          ({new Date(syncAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      ) : null}
                    </div>
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
                  {authUserEmail ? (
                    <>
                      <button
                        className="btn btn-accent"
                        id="signInGoogleBtn"
                        type="button"
                        disabled={authBusy}
                        onClick={handleSignOut}
                      >
                        Sign Out
                      </button>
                    </>
                  ) : null}
                </div>
                {authUserEmail ? (
                  <>
                    <div className="settingsInlineSectionHead">
                      <div className="settingsInlineSectionTitle">Delete Account</div>
                    </div>
                    <div className="settingsDetailNote settingsDangerDisclosure">
                      <div className="settingsDangerDisclosureBody">
                        Deleting your account removes your Firebase sign-in account. Local task and history data on this
                        device is not removed automatically. Use Reset All if you want to clear local device data.
                      </div>
                      <details className="settingsDangerDisclosureToggle">
                        <summary className="settingsDangerDisclosureSummary" aria-label="Show delete account button" />
                        <div className="settingsInlineFooter settingsAuthActions settingsDangerDisclosureActions">
                          <button
                            className="btn btn-warn"
                            type="button"
                            disabled={authBusy}
                            onClick={() => setShowDeleteAccountConfirm(true)}
                          >
                            Delete Account
                          </button>
                        </div>
                      </details>
                    </div>
                  </>
                ) : null}
                {!authUserEmail ? (
                  <div className="settingsDetailNote">
                    Account details are available after signing in from the landing page.
                    {" "}
                    <a href="/privacy">Privacy Policy</a>
                  </div>
                ) : null}
              </section>
            </div>
            {showDeleteAccountConfirm ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowDeleteAccountConfirm(false)}>
                <div
                  className="modal settingsInlineConfirmModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Delete Account"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="settingsInlineConfirmTitle">Delete Account</h3>
                  <p className="settingsInlineConfirmText">
                    Permanently delete your sign-in account for this app? This action cannot be undone.
                  </p>
                  <p className="settingsInlineConfirmText">
                    Local task and history data on this device are not deleted automatically. Use Reset All separately
                    if needed.
                  </p>
                  <div className="footerBtns settingsInlineConfirmBtns">
                    <button className="btn btn-ghost" type="button" onClick={() => setShowDeleteAccountConfirm(false)}>
                      Cancel
                    </button>
                    <button className="btn btn-warn" type="button" onClick={handleDeleteAccount} disabled={authBusy}>
                      Delete Account
                    </button>
                  </div>
                </div>
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
            {showAvatarPickerModal ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowAvatarPickerModal(false)}>
                <div
                  className="modal settingsInlineConfirmModal settingsAvatarModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Choose Avatar"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="settingsInlineConfirmTitle">Choose Avatar</h3>
                  <div className="settingsAvatarOptions" role="list" aria-label="Available avatars">
                    {avatarGroups.map((group) => (
                      <section key={group.key} className="settingsAvatarGroup" aria-label={group.title}>
                        <h4 className="settingsAvatarGroupTitle">{group.title}</h4>
                        <div className="settingsAvatarGroupRow" role="list">
                          {group.items.map((avatar) => (
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
                      </section>
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
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Task Settings</div>
                </div>
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
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Modes.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Configure Modes</div>
                </div>
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
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Appearance</div>
                </div>
                <div className="toggleRow" id="themeToggleRow">
                  <span>Toggle between light and dark mode</span>
                  <button className="switch on" id="themeToggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="toggleRow" id="taskDynamicColorsToggleRow">
                  <span>Dynamic colors for progress and history</span>
                  <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
                </div>
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Dashboard.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Dashboard Settings</div>
                </div>
                <div className="settingsDetailNote">
                  Dashboard settings controls can be added here. The section is now part of Preferences and no longer opens a separate modal.
                </div>
                <button className="menuItem settingsActionRow" id="dashboardSettingsBtn" type="button">
                  <MenuIconLabel icon="/Dashboard.svg" label="Dashboard Settings" />
                </button>
              </section>
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
            active={activePane === "privacy"}
            title="Privacy Policy"
            subtitle="View TaskTimer privacy information and account deletion details."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/file.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Privacy Policy</div>
                </div>
                <div className="settingsDetailNote">
                  Review TaskTimer&apos;s privacy policy, including data handling, local storage behavior, and account
                  deletion information.
                </div>
                <div className="settingsInlineFooter">
                  <a className="btn btn-ghost" href="/privacy">
                    Open Privacy Policy
                  </a>
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
