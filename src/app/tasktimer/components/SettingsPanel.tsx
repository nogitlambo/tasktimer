"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { clearScopedStorageState, STORAGE_KEY } from "@/app/tasktimer/lib/storage";
import {
  deleteUser,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { AVATAR_CATALOG, type AvatarOption } from "@/app/tasktimer/lib/avatarCatalog";
import { syncOwnFriendshipProfile } from "@/app/tasktimer/lib/friendsStore";
import Image from "next/image";
import {
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  getRankLadderThumbnailSrc,
  normalizeRewardProgress,
  RANK_LADDER,
  RANK_MODAL_THUMBNAIL_BY_ID,
} from "@/app/tasktimer/lib/rewards";
import { subscribeCachedPreferences } from "@/app/tasktimer/lib/storage";

type SettingsPaneKey =
  | "general"
  | "preferences"
  | "appearance"
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

const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";
const RANK_INSIGNIA_ADMIN_UID = "mWN9rMhO4xMq410c4E4VYyThw0x2";
const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;
const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";

function avatarStorageKeyForUid(uid: string) {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`;
}
function avatarCustomStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`;
}
function customAvatarIdForUid(uid: string) {
  return `custom-upload:${uid}`;
}
function googleAvatarIdForUid(uid: string) {
  return `google/profile-photo:${uid}`;
}
function rankThumbnailStorageKeyForUid(uid: string) {
  return `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`;
}

function readStoredAvatarId(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarStorageKeyForUid(uid)) || "").trim();
}
function readStoredCustomAvatarSrc(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarCustomStorageKeyForUid(uid)) || "").trim();
}
function readStoredRankThumbnailSrc(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(rankThumbnailStorageKeyForUid(uid)) || "").trim();
}

function writeStoredAvatarId(uid: string, avatarId: string) {
  if (typeof window === "undefined" || !uid) return;
  const value = String(avatarId || "").trim();
  if (!value) {
    window.localStorage.removeItem(avatarStorageKeyForUid(uid));
    return;
  }
  window.localStorage.setItem(avatarStorageKeyForUid(uid), value);
}
function writeStoredCustomAvatarSrc(uid: string, src: string) {
  if (typeof window === "undefined" || !uid) return;
  const value = String(src || "").trim();
  if (!value) {
    window.localStorage.removeItem(avatarCustomStorageKeyForUid(uid));
    return;
  }
  window.localStorage.setItem(avatarCustomStorageKeyForUid(uid), value);
}
function writeStoredRankThumbnailSrc(uid: string, src: string) {
  if (typeof window === "undefined" || !uid) return;
  const value = String(src || "").trim();
  if (!value) {
    window.localStorage.removeItem(rankThumbnailStorageKeyForUid(uid));
    return;
  }
  window.localStorage.setItem(rankThumbnailStorageKeyForUid(uid), value);
}

function notifyAccountAvatarUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_AVATAR_UPDATED_EVENT));
}

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
function shouldUseRedirectAuth() {
  return isNativeOrFileRuntime();
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
  const [authHasGoogleProvider, setAuthHasGoogleProvider] = useState(false);
  const [authGooglePhotoUrl, setAuthGooglePhotoUrl] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("Sign in to sync preferences.");
  const [syncAtMs, setSyncAtMs] = useState<number | null>(null);
  const [uidCopyStatus, setUidCopyStatus] = useState("");
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [showAdminConsoleModal, setShowAdminConsoleModal] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>(() => AVATAR_CATALOG.slice());
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(AVATAR_CATALOG[0]?.id || "");
  const [avatarSyncNotice, setAvatarSyncNotice] = useState("");
  const [avatarSyncNoticeIsError, setAvatarSyncNoticeIsError] = useState(false);
  const avatarSyncNoticeTimerRef = useRef<number | null>(null);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);
  const rankThumbnailUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));

  const accountStateDocRef = (uid: string) => {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    return doc(db, "users", uid, "accountState", "v1");
  };

  const userDocRef = useCallback((uid: string) => {
    const db = getFirebaseFirestoreClient();
    if (!db) return null;
    return doc(db, "users", uid);
  }, []);

  const saveUserDocPatch = useCallback(async (uid: string, patch: Record<string, unknown>) => {
    const ref = userDocRef(uid);
    if (!ref) throw new Error("Cloud Firestore is not available.");
    await setDoc(
      ref,
      {
        schemaVersion: 1,
        updatedAt: serverTimestamp(),
        ...patch,
      },
      { merge: true }
    );
  }, [userDocRef]);

  const showAvatarSyncNotice = useCallback((message: string, isError = false) => {
    setAvatarSyncNotice(message);
    setAvatarSyncNoticeIsError(isError);
    if (typeof window === "undefined") return;
    if (avatarSyncNoticeTimerRef.current != null) {
      window.clearTimeout(avatarSyncNoticeTimerRef.current);
    }
    avatarSyncNoticeTimerRef.current = window.setTimeout(() => {
      setAvatarSyncNotice("");
      setAvatarSyncNoticeIsError(false);
      avatarSyncNoticeTimerRef.current = null;
    }, 2200);
  }, []);
  const navItems = useMemo(
    () => [
      { key: "general" as const, label: "Account" },
      { key: "preferences" as const, label: "Preferences" },
      { key: "appearance" as const, label: "Appearance" },
      { key: "notifications" as const, label: "Notifications" },
      { key: "privacy" as const, label: "Privacy Policy" },
      { key: "userGuide" as const, label: "Support" },
      { key: "about" as const, label: "About" },
      { key: "feedback" as const, label: "Feedback" },
      { key: "data" as const, label: "Data" },
    ],
    []
  );
  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback = isValidFeedbackEmail && !!feedbackType && feedbackDetails.trim().length > 0;
  const avatarGroups = useMemo<AvatarGroup[]>(() => {
    const groups = new Map<string, AvatarOption[]>();
    for (const avatar of avatarOptions) {
      const normalizedId = String(avatar.id || "").replace(/\\/g, "/");
      const isCustomUpload = normalizedId.startsWith("custom-upload:");
      const parts = normalizedId.split("/");
      const folder = isCustomUpload ? "uploads" : (parts.length > 1 ? parts[parts.length - 2] || "misc" : "misc");
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
    const initialPane = String(new URLSearchParams(window.location.search).get("pane") || "").trim();
    if (initialPane === "general") {
      setActivePane((prev) => prev ?? "general");
      setMobileDetailOpen(true);
      return;
    }
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
      setAuthMemberSince(user?.metadata?.creationTime || null);
      const providerIds = new Set((user?.providerData || []).map((provider) => String(provider?.providerId || "")));
      const hasGoogleProvider = providerIds.has("google.com");
      const googleProviderProfile = (user?.providerData || []).find(
        (provider) => String(provider?.providerId || "") === "google.com"
      );
      const googlePhotoCandidate = String(user?.photoURL || googleProviderProfile?.photoURL || "").trim();
      setAuthHasGoogleProvider(hasGoogleProvider);
      setAuthGooglePhotoUrl(hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null);
      if (user?.uid) {
        void saveUserDocPatch(user.uid, {
          email: user.email || "",
          displayName: user.displayName || null,
        }).catch(() => {
          // ignore root profile sync failures here; avatar write path handles user-facing errors.
        });
        setSyncState("synced");
        setSyncMessage("Cloud data connected.");
        setSyncAtMs(Date.now());
      } else {
        setSyncState("idle");
        setSyncMessage("Sign in to sync preferences.");
        setSyncAtMs(null);
      }
    });
    return () => unsub();
  }, [saveUserDocPatch]);

  useEffect(() => {
    if (!authUserUid) {
      setAvatarOptions(AVATAR_CATALOG.slice());
      setSelectedAvatarId(AVATAR_CATALOG[0]?.id || "");
      setRankThumbnailSrc("");
      return;
    }
    const customSrc = readStoredCustomAvatarSrc(authUserUid);
    const savedRankThumbnail = readStoredRankThumbnailSrc(authUserUid);
    setRankThumbnailSrc(savedRankThumbnail);
    const baseOptions = AVATAR_CATALOG.slice();
    if (authHasGoogleProvider && authGooglePhotoUrl) {
      baseOptions.push({
        id: googleAvatarIdForUid(authUserUid),
        label: "Google Profile Photo",
        src: authGooglePhotoUrl,
      });
    }
    if (customSrc) {
      const customId = customAvatarIdForUid(authUserUid);
      baseOptions.push({ id: customId, label: "Custom Upload", src: customSrc });
      setAvatarOptions(baseOptions);
    } else {
      setAvatarOptions(baseOptions);
    }
  }, [authGooglePhotoUrl, authHasGoogleProvider, authUserUid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const resumePendingDelete = async () => {
      const uid = String(auth.currentUser?.uid || authUserUid || "").trim();
      if (!uid) return;
      const ref = accountStateDocRef(uid);
      if (!ref) return;
      let stateSnap;
      try {
        stateSnap = await getDoc(ref);
      } catch (err: unknown) {
        const code =
          err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
        if (code === "permission-denied") return;
        throw err;
      }
      const pendingDelete = stateSnap.exists() && stateSnap.get("deleteReauthPending") === true;
      if (!pendingDelete) return;
      try {
        await getRedirectResult(auth);
      } catch (err: unknown) {
        if (cancelled) return;
        try {
          await setDoc(ref, { deleteReauthPending: false, updatedAt: serverTimestamp() }, { merge: true });
        } catch {
          // ignore account-state write failures
        }
        setAuthError(getErrorMessage(err, "Could not complete Google re-authentication for account deletion."));
        setAuthStatus("");
        return;
      }
      if (cancelled) return;
      if (!auth.currentUser) return;
      try {
        await setDoc(ref, { deleteReauthPending: false, updatedAt: serverTimestamp() }, { merge: true });
      } catch {
        // ignore account-state write failures
      }
      setShowDeleteAccountConfirm(false);
      setAuthStatus("Re-authentication complete. Deleting account...");
      setAuthError("");
      setAuthBusy(true);
      try {
        await deleteUser(auth.currentUser);
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
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUserUid) return;
    void syncOwnFriendshipProfile(authUserUid, { currentRankId: rewardProgress.currentRankId }).catch(() => {
      // Ignore friendship profile rank sync failures from the settings surface.
    });
  }, [authUserUid, rewardProgress.currentRankId]);

  useEffect(() => {
    if (!showAvatarPickerModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAvatarPickerModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAvatarPickerModal]);

  useEffect(() => {
    if (!showRankLadderModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowRankLadderModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRankLadderModal]);

  useEffect(() => {
    if (!showAdminConsoleModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAdminConsoleModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAdminConsoleModal]);

  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const currentRankIndex = useMemo(
    () => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === rewardProgress.currentRankId)),
    [rewardProgress.currentRankId]
  );
  const canSelectRankInsignia = authUserUid === RANK_INSIGNIA_ADMIN_UID;
  const canAccessAdminConsole = authUserUid === RANK_INSIGNIA_ADMIN_UID;
  const displayedRankLabel = rewardsHeader.rankLabel;
  const displayedRankThumbnailSrc = useMemo(
    () => getRankLadderThumbnailSrc(rewardProgress.currentRankId, rankThumbnailSrc),
    [rewardProgress.currentRankId, rankThumbnailSrc]
  );
  const handleRankThumbnailClick = useCallback(() => {
    if (canAccessAdminConsole) {
      setShowAdminConsoleModal(true);
      return;
    }
    setShowRankLadderModal(true);
  }, [canAccessAdminConsole]);

  useEffect(() => {
    if (!authUserUid) {
      setSelectedAvatarId(avatarOptions[0]?.id || "");
      return;
    }
    let cancelled = false;
    const loadAvatar = async () => {
      const cached = readStoredAvatarId(authUserUid);
      if (cached && avatarOptions.some((a) => a.id === cached) && !cancelled) {
        setSelectedAvatarId(cached);
      }
      const ref = userDocRef(authUserUid);
      if (!ref) {
        if (!cancelled) {
          const fallback = avatarOptions.some((a) => a.id === cached) ? cached : avatarOptions[0]?.id || "";
          setSelectedAvatarId(fallback);
        }
        return;
      }
      const snap = await getDoc(ref);
      const saved = snap.exists() ? String(snap.get("avatarId") || "") : "";
      const savedCustomSrc = snap.exists() ? String(snap.get("avatarCustomSrc") || "").trim() : "";
      const savedRankThumbnail = snap.exists() ? String(snap.get("rankThumbnailSrc") || "").trim() : "";
      const customId = customAvatarIdForUid(authUserUid);
      const cachedCustomSrc = readStoredCustomAvatarSrc(authUserUid);
      if (savedCustomSrc) {
        setAvatarOptions((prev) => {
          const base = prev.filter((opt) => String(opt.id) !== customId);
          return [...base, { id: customId, label: "Custom Upload", src: savedCustomSrc }];
        });
        writeStoredCustomAvatarSrc(authUserUid, savedCustomSrc);
      } else if (cachedCustomSrc) {
        await saveUserDocPatch(authUserUid, { avatarCustomSrc: cachedCustomSrc });
      }
      const validSaved =
        avatarOptions.some((a) => a.id === saved) || (saved === customId && !!savedCustomSrc) ? saved : "";
      const validCached = avatarOptions.some((a) => a.id === cached) ? cached : "";
      const nextId = validSaved || validCached || avatarOptions[0]?.id || "";
      const cachedRankThumbnail = readStoredRankThumbnailSrc(authUserUid);
      const nextRankThumbnail = savedRankThumbnail || cachedRankThumbnail;
      if (validSaved) {
        writeStoredAvatarId(authUserUid, validSaved);
      } else if (validCached) {
        // Backfill missing cloud avatar from local cache.
        await saveUserDocPatch(authUserUid, { avatarId: validCached });
      }
      if (savedRankThumbnail) {
        writeStoredRankThumbnailSrc(authUserUid, savedRankThumbnail);
      } else if (cachedRankThumbnail) {
        await saveUserDocPatch(authUserUid, { rankThumbnailSrc: cachedRankThumbnail });
      }
      if (!cancelled) setRankThumbnailSrc(nextRankThumbnail);
      if (!cancelled) setSelectedAvatarId(nextId);
    };
    void loadAvatar().catch(() => {
      if (!cancelled) {
        const cached = readStoredAvatarId(authUserUid);
        const fallback = avatarOptions.some((a) => a.id === cached) ? cached : avatarOptions[0]?.id || "";
        setSelectedAvatarId(fallback);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authUserUid, avatarOptions, saveUserDocPatch, userDocRef]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && avatarSyncNoticeTimerRef.current != null) {
        window.clearTimeout(avatarSyncNoticeTimerRef.current);
      }
    };
  }, []);

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
      clearScopedStorageState();
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
      const accountRef = accountStateDocRef(deleteUid);
      if (accountRef) {
        try {
          await deleteDoc(accountRef);
        } catch {
          // ignore
        }
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
              const ref = accountStateDocRef(user.uid);
              if (ref) {
                try {
                  await setDoc(ref, { deleteReauthPending: true, updatedAt: serverTimestamp() }, { merge: true });
                } catch {
                  // ignore account-state write failures
                }
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
            const ref = accountStateDocRef(user.uid);
            if (ref) {
              try {
                await setDoc(ref, { deleteReauthPending: false, updatedAt: serverTimestamp() }, { merge: true });
              } catch {
                // ignore account-state write failures
              }
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

  const handleCopyUid = async () => {
    if (!authUserUid) return;
    try {
      await navigator.clipboard.writeText(authUserUid);
      setUidCopyStatus("Copied");
      window.setTimeout(() => setUidCopyStatus(""), 1200);
    } catch {
      setUidCopyStatus("Copy failed");
      window.setTimeout(() => setUidCopyStatus(""), 1500);
    }
  };

  const handleSelectAvatar = async (avatarId: string) => {
    setSelectedAvatarId(avatarId);
    if (!authUserUid) {
      setAuthError("Sign in is required to save avatar selection.");
      setAuthStatus("");
      return;
    }
    const customId = customAvatarIdForUid(authUserUid);
    const isCustomAvatar = avatarId === customId;
    const customAvatarSrc = readStoredCustomAvatarSrc(authUserUid);
    const patch: Record<string, unknown> = {
      avatarId,
      avatarCustomSrc: isCustomAvatar ? customAvatarSrc || null : null,
    };
    if (!isCustomAvatar) writeStoredCustomAvatarSrc(authUserUid, "");
    writeStoredAvatarId(authUserUid, avatarId);
    notifyAccountAvatarUpdated();
    setAuthError("");
    try {
      await saveUserDocPatch(authUserUid, patch);
      await syncOwnFriendshipProfile(authUserUid, {
        avatarId,
        avatarCustomSrc: isCustomAvatar ? customAvatarSrc || null : null,
      });
      showAvatarSyncNotice("Avatar saved.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not save avatar selection to cloud."));
      setAuthStatus("");
      showAvatarSyncNotice("Avatar saved locally. Cloud sync failed.", true);
    }
    setShowAvatarPickerModal(false);
  };

  const handleUploadAvatarClick = () => {
    avatarUploadInputRef.current?.click();
  };

  const handleUploadAvatarFile = async (file: File | null) => {
    if (!file) return;
    if (!authUserUid) {
      setAuthError("Sign in is required to upload an avatar.");
      setAuthStatus("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setAuthError("Please choose an image file.");
      setAuthStatus("");
      return;
    }
    const maxBytes = 2 * 1024 * 1024;
    if (file.size > maxBytes) {
      setAuthError("Image is too large. Max size is 2MB.");
      setAuthStatus("");
      return;
    }
    const fileReader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      fileReader.onload = () => resolve(String(fileReader.result || ""));
      fileReader.onerror = () => reject(new Error("Could not read selected image."));
      fileReader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setAuthError("Could not read selected image.");
      setAuthStatus("");
      return;
    }
    const customId = customAvatarIdForUid(authUserUid);
    const customAvatar: AvatarOption = { id: customId, label: "Custom Upload", src: dataUrl };
    setAvatarOptions((prev) => {
      const base = prev.filter((opt) => !String(opt.id).startsWith("custom-upload:"));
      return [...base, customAvatar];
    });
    setSelectedAvatarId(customId);
    writeStoredCustomAvatarSrc(authUserUid, dataUrl);
    writeStoredAvatarId(authUserUid, customId);
    notifyAccountAvatarUpdated();
    setAuthError("");
    try {
      await saveUserDocPatch(authUserUid, { avatarId: customId, avatarCustomSrc: dataUrl });
      await syncOwnFriendshipProfile(authUserUid, { avatarId: customId, avatarCustomSrc: dataUrl });
      showAvatarSyncNotice("Avatar uploaded.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not save uploaded avatar selection to cloud."));
      setAuthStatus("");
      showAvatarSyncNotice("Avatar uploaded locally. Cloud sync failed.", true);
    }
    setShowAvatarPickerModal(false);
  };

  const handleUploadRankThumbnailFile = async (file: File | null) => {
    if (!file) return;
    if (!authUserUid) {
      setAuthError("Sign in is required to upload a rank thumbnail.");
      setAuthStatus("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setAuthError("Please choose an image file.");
      setAuthStatus("");
      return;
    }
    const maxBytes = 300 * 1024;
    if (file.size > maxBytes) {
      setAuthError("Image is too large. Max size is 300KB.");
      setAuthStatus("");
      return;
    }
    const fileReader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      fileReader.onload = () => resolve(String(fileReader.result || ""));
      fileReader.onerror = () => reject(new Error("Could not read selected image."));
      fileReader.readAsDataURL(file);
    });
    if (!dataUrl) {
      setAuthError("Could not read selected image.");
      setAuthStatus("");
      return;
    }
    setRankThumbnailSrc(dataUrl);
    setAuthError("");
    try {
      await saveUserDocPatch(authUserUid, { rankThumbnailSrc: dataUrl });
      writeStoredRankThumbnailSrc(authUserUid, dataUrl);
      showAvatarSyncNotice("Rank thumbnail saved.");
    } catch (err: unknown) {
      writeStoredRankThumbnailSrc(authUserUid, dataUrl);
      setAuthError(getErrorMessage(err, "Could not save rank thumbnail to cloud."));
      setAuthStatus("");
      showAvatarSyncNotice("Rank thumbnail saved locally. Cloud sync failed.", true);
      return;
    }
    try {
      await syncOwnFriendshipProfile(authUserUid, { rankThumbnailSrc: dataUrl });
    } catch {
      showAvatarSyncNotice("Rank thumbnail saved to your profile. Friend sync failed.", true);
    }
  };

  const handleSelectRankThumbnail = async (rankId: string) => {
    if (!authUserUid || authUserUid !== RANK_INSIGNIA_ADMIN_UID) return;
    const nextSrc = String(RANK_MODAL_THUMBNAIL_BY_ID[rankId] || "").trim();
    if (!nextSrc) return;
    setRankThumbnailSrc(nextSrc);
    writeStoredRankThumbnailSrc(authUserUid, nextSrc);
    notifyAccountAvatarUpdated();
    setAuthError("");
    try {
      await saveUserDocPatch(authUserUid, { rankThumbnailSrc: nextSrc });
      showAvatarSyncNotice("Rank insignia saved.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not save rank insignia to cloud."));
      setAuthStatus("");
      showAvatarSyncNotice("Rank insignia saved locally. Cloud sync failed.", true);
      return;
    }
    try {
      await syncOwnFriendshipProfile(authUserUid, { rankThumbnailSrc: nextSrc });
    } catch {
      showAvatarSyncNotice("Rank insignia saved to your profile. Friend sync failed.", true);
    }
    setShowRankLadderModal(false);
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
                        <div className="settingsAccountFieldRow settingsAccountIdentityBlock">
                          <div className="settingsAccountFieldLabel">Username:</div>
                          <div className="settingsAccountFieldValue settingsAccountFieldValueWrap">{authUserAlias || "-"}</div>
                        </div>
                      </div>
                      <div className="settingsAccountFieldRow settingsAccountRankCol">
                        <div className="settingsAccountRankText">
                          <div className="settingsAccountFieldLabel">Rank:</div>
                        </div>
                        <button
                          type="button"
                          className="settingsAccountRankBtn"
                          onClick={handleRankThumbnailClick}
                          aria-label={canAccessAdminConsole ? "Open Admin Console" : "Open rank ladder"}
                          title={canAccessAdminConsole ? "Open Admin Console" : "Open rank ladder"}
                        >
                          <div className="settingsAccountRankPlaceholder">
                            {displayedRankThumbnailSrc ? (
                              <img className="settingsAccountRankImage" src={displayedRankThumbnailSrc} alt="Rank thumbnail" />
                            ) : (
                              <div className="settingsAccountRankPlaceholderInner" />
                            )}
                          </div>
                        </button>
                        <input
                          ref={rankThumbnailUploadInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files && e.target.files.length ? e.target.files[0] : null;
                            void handleUploadRankThumbnailFile(file);
                            e.currentTarget.value = "";
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
                {authUserEmail ? (
                  <div className="settingsDetailNote">
                    <div className="settingsAccountMetaSummary">
                      <div className="settingsAccountMemberSinceRow">
                        <span className="settingsAccountUidLabel">Email Address:</span>
                        <span className="settingsAccountUidValue">{authUserEmail}</span>
                      </div>
                      {authUserUid ? (
                        <div className="settingsAccountUidRow">
                          <span className="settingsAccountUidLabel">UID:</span>
                          <span className="settingsAccountUidValue">{authUserUid}</span>
                          <button className="btn btn-ghost small settingsUidCopyBtn" type="button" onClick={handleCopyUid}>
                            {uidCopyStatus || "Copy"}
                          </button>
                        </div>
                      ) : null}
                      <div className="settingsAccountMemberSinceRow">
                        <span className="settingsAccountUidLabel">Member since:</span>
                        <span className="settingsAccountUidValue">{formatMemberSinceDate(authMemberSince)}</span>
                      </div>
                    </div>
                    <div className={`settingsSyncStatus is-${syncState}`}>
                      <span className="settingsSyncStatusDot" aria-hidden="true" />
                      <span className="settingsSyncStatusText">{syncMessage}</span>
                      {syncAtMs && syncState === "synced" ? (
                        <span className="settingsSyncStatusTime">
                          ({new Date(syncAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      ) : null}
                    </div>
                    <div className="settingsInlineFooter settingsAuthActions settingsAuthActionsInline">
                      <button
                        className="btn btn-accent small settingsSignOutBtn"
                        id="signInGoogleBtn"
                        type="button"
                        disabled={authBusy}
                        onClick={handleSignOut}
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : null}
                {authStatus ? <div className="settingsAuthNotice">{authStatus}</div> : null}
                {authError ? <div className="settingsAuthError">{authError}</div> : null}
                {avatarSyncNotice ? (
                  <div className={avatarSyncNoticeIsError ? "settingsAuthError" : "settingsAuthNotice"}>
                    {avatarSyncNotice}
                  </div>
                ) : null}
                {authUserEmail ? (
                  <>
                    <div className="settingsInlineSectionHead settingsDeleteAccountHead">
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
                    <input
                      ref={avatarUploadInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files && e.target.files.length ? e.target.files[0] : null;
                        void handleUploadAvatarFile(file);
                        e.currentTarget.value = "";
                      }}
                    />
                    <button className="btn btn-accent" type="button" onClick={handleUploadAvatarClick}>
                      Upload
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => setShowAvatarPickerModal(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {showRankLadderModal ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowRankLadderModal(false)}>
                <div className="modal rankLadderModal" role="dialog" aria-modal="true" aria-label="Rank ladder" onClick={(e) => e.stopPropagation()}>
                  <h2>Rank Ladder</h2>
                  <p className="modalSubtext">
                    {displayedRankLabel} is your current rank at {rewardsHeader.totalXp} XP.{" "}
                    {rewardsHeader.xpToNext != null
                      ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
                      : "You have reached the highest configured rank."}
                  </p>
                  {canSelectRankInsignia ? (
                    <p className="modalSubtext">Click an insignia thumbnail to use it as your profile rank badge.</p>
                  ) : null}
                  <div className="rankLadderList" role="list" aria-label="Available ranks">
                    {RANK_LADDER.map((rank, index) => {
                      const isCurrent = rank.id === rewardProgress.currentRankId;
                      const isUnlocked = index <= currentRankIndex;
                      const thresholdLabel = Number.isFinite(rank.minXp) ? `${rank.minXp} XP` : "Threshold pending";
                      const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
                      const isSelectable = canSelectRankInsignia && !!rankThumbnail;
                      const isSelectedThumbnail = rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
                      const content = (
                        <>
                          <div className="rankLadderItemBadge" aria-hidden="true">
                            {rankThumbnail ? (
                              <Image className="rankLadderItemBadgeImage" src={rankThumbnail} alt="" width={34} height={34} unoptimized />
                            ) : (
                              index === 0 ? "U" : index
                            )}
                          </div>
                          <div className="rankLadderItemBody">
                            <div className="rankLadderItemTitleRow">
                              <span className="rankLadderItemTitle">{rank.label}</span>
                              {isSelectedThumbnail ? <span className="rankLadderItemFlag">Selected</span> : null}
                              {isCurrent ? <span className="rankLadderItemFlag">Current</span> : null}
                              {!isCurrent && isUnlocked ? <span className="rankLadderItemFlag">Unlocked</span> : null}
                            </div>
                            <div className="rankLadderItemMeta">
                              Unlocks at {thresholdLabel}
                              {isSelectable ? " Click to select this insignia." : ""}
                            </div>
                          </div>
                        </>
                      );
                      if (isSelectable) {
                        return (
                          <button
                            key={rank.id}
                            type="button"
                            className={`rankLadderItem isSelectable${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                            onClick={() => void handleSelectRankThumbnail(rank.id)}
                          >
                            {content}
                          </button>
                        );
                      }
                      return (
                        <div
                          key={rank.id}
                          className={`rankLadderItem${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                          role="listitem"
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                  <div className="confirmBtns">
                    <button className="btn btn-ghost" type="button" onClick={() => setShowRankLadderModal(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            {showAdminConsoleModal && canAccessAdminConsole ? (
              <div className="overlay settingsInlineConfirmOverlay" onClick={() => setShowAdminConsoleModal(false)}>
                <div
                  className="modal settingsInlineConfirmModal settingsAdminConsoleModal"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Admin Console"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="settingsInlineConfirmTitle settingsAdminConsoleTitle">Admin Console</h3>
                  <p className="confirmText">
                    Restricted to the authenticated admin account.
                  </p>
                  <p className="modalSubtext settingsAdminConsoleSubtext">
                    No admin functions are currently configured in this console.
                  </p>
                  <div className="settingsAdminConsolePanel">
                    <div className="settingsAdminConsolePanelHead">
                      <div className="settingsAdminConsolePlaceholderLabel">No functions configured</div>
                      <div className="settingsAdminConsoleHint">
                        Additional admin actions can be added here later.
                      </div>
                    </div>
                    <div className="settingsAdminConsolePlaceholder" aria-live="polite">
                      <div className="settingsAdminConsolePlaceholderLabel">Empty console</div>
                      <div className="settingsAdminConsolePlaceholderValue">
                        There are no admin functions available right now.
                      </div>
                    </div>
                  </div>
                  <div className="confirmBtns settingsInlineConfirmBtns">
                    <button className="btn btn-ghost" type="button" onClick={() => setShowAdminConsoleModal(false)}>
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "preferences"}
            title="Preferences"
            subtitle="Configure task behavior and dashboard options."
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
                <div className="toggleRow" id="taskAutoFocusOnLaunchToggleRow">
                  <span>Auto switch to Focus Mode on launch</span>
                  <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
                </div>
                <div className="field" id="taskViewRow">
                  <label htmlFor="taskViewSelect">Task View</label>
                  <select id="taskViewSelect" defaultValue="list" aria-label="Task view">
                    <option value="list">List</option>
                    <option value="tile">Tile</option>
                  </select>
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
                Save Task Settings
              </button>
              <button className="btn btn-accent" id="categorySaveBtn" type="button" tabIndex={-1}>
                Save Category
              </button>
              <button className="btn btn-ghost" id="categoryResetBtn" type="button" tabIndex={-1}>
                Reset Defaults
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "appearance"}
            title="Appearance"
            subtitle="Choose your theme, mode styling, and visual display options."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Appearance</div>
                </div>
                <div className="field" id="themeToggleRow">
                  <label htmlFor="themeSelect">Theme</label>
                  <select id="themeSelect" defaultValue="dark" aria-label="Theme mode">
                    <option value="dark">Purple</option>
                    <option value="command">Cyan</option>
                  </select>
                </div>
                <div className="field" id="menuButtonStyleRow">
                  <label htmlFor="menuButtonStyleSelect">Menu and button style</label>
                  <select id="menuButtonStyleSelect" defaultValue="parallelogram" aria-label="Menu and button style">
                    <option value="parallelogram">Parallelogram (default)</option>
                    <option value="square">Square</option>
                  </select>
                </div>
                <div className="toggleRow" id="taskDynamicColorsToggleRow">
                  <span>Use dynamic colors on progress bar and charts</span>
                  <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
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
            subtitle="Review Timebase's privacy policy, including data handling, local storage behavior, and account deletion information."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsActionGrid settingsDataTileGrid">
                  <a className="menuItem settingsDataTile settingsPrivacyTile" href="/privacy">
                    <MenuIconLabel icon="/file.svg" label="Privacy Policy" />
                  </a>
                </div>
              </section>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "userGuide"}
            title="Support"
            subtitle="Open the Timebase user guide and walkthrough content."
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
                Timebase is a focused time-tracking app built to help you create better habits, manage repeatable
                routines, and review progress over time.
              </p>
              <p>
                It is designed for fast task control during active sessions, clear checkpoint visibility, and a workflow
                that works well on both mobile and desktop.
              </p>

              <p style={{ marginBottom: 6, fontWeight: 700 }}>What Timebase is for</p>
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
                  <button className="btn btn-accent small" id="feedbackBtn" type="button" disabled={!canSubmitFeedback}>
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
              <button className="menuItem settingsDataTile" id="resetAllBtn" type="button">
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
