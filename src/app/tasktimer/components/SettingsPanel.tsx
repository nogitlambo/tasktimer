"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { normalizeUsername, validateUsername } from "@/lib/username";
import {
  buildDefaultCloudPreferences,
  clearScopedStorageState,
  loadCachedPreferences,
  saveCloudPreferences,
  STORAGE_KEY,
  waitForPendingTaskSync,
} from "@/app/tasktimer/lib/storage";
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
import {
  buildRewardProgressForRankSelection,
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  RANK_LADDER,
  RANK_MODAL_THUMBNAIL_BY_ID,
  RANK_OVERRIDE_ADMIN_UID,
  normalizeRewardProgress,
} from "@/app/tasktimer/lib/rewards";
import { subscribeCachedPreferences } from "@/app/tasktimer/lib/storage";
import { claimUsernameClient } from "@/app/tasktimer/lib/usernameClaim";
import { getTaskTimerPushDiagnostics, type PushDiagnostics } from "@/app/tasktimer/lib/pushNotifications";
import { sendPushTestNotification } from "@/app/tasktimer/lib/pushFunctions";
import { syncCurrentUserPlanCache } from "@/app/tasktimer/lib/planFunctions";
import RankThumbnail from "./RankThumbnail";

export type SettingsPaneKey =
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

const SETTINGS_PANE_KEYS: SettingsPaneKey[] = [
  "general",
  "preferences",
  "appearance",
  "notifications",
  "privacy",
  "userGuide",
  "about",
  "feedback",
  "data",
  "reset",
];

function isSettingsPaneKey(value: string): value is SettingsPaneKey {
  return SETTINGS_PANE_KEYS.includes(value as SettingsPaneKey);
}

function MenuIconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <AppImg className="settingsMenuItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsMenuItemText">{label}</span>
    </>
  );
}

const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";
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
  id,
  icon,
  label,
  active,
  danger,
  onClick,
}: {
  id?: string;
  icon: string;
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      className={`menuItem settingsNavTile${active ? " isActive" : ""}${danger ? " isDanger" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <AppImg className="settingsMenuItemIcon settingsNavItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsNavRowText">{label}</span>
    </button>
  );
}

function SettingsDetailPane({
  active,
  paneClassName = "",
  title,
  subtitle,
  children,
}: {
  active: boolean;
  paneClassName?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`settingsDetailPane${active ? " isActive" : ""}${paneClassName ? ` ${paneClassName}` : ""}`}
      aria-hidden={active ? "false" : "true"}
    >
      <div className="settingsDetailHead">
        <h2 className="settingsDetailTitle">{title}</h2>
        <p className="settingsDetailText">{subtitle}</p>
      </div>
      <div className="settingsDetailBody">{children}</div>
    </section>
  );
}

export default function SettingsPanel({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  const [activePane, setActivePane] = useState<SettingsPaneKey | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackAnonymous, setFeedbackAnonymous] = useState(false);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [authUserAlias, setAuthUserAlias] = useState("");
  const [authUserAliasDraft, setAuthUserAliasDraft] = useState("");
  const [authUserAliasEditing, setAuthUserAliasEditing] = useState(false);
  const [authUserAliasBusy, setAuthUserAliasBusy] = useState(false);
  const [authMemberSince, setAuthMemberSince] = useState<string | null>(null);
  const [authHasGoogleProvider, setAuthHasGoogleProvider] = useState(false);
  const [authGooglePhotoUrl, setAuthGooglePhotoUrl] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState("Sign in to sync preferences.");
  const [syncAtMs, setSyncAtMs] = useState<number | null>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushTestStatus, setPushTestStatus] = useState("");
  const [pushDiagnostics, setPushDiagnostics] = useState<PushDiagnostics | null>(null);
  const [uidCopyStatus, setUidCopyStatus] = useState("");
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const hasInitializedPaneRef = useRef(false);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>(() => AVATAR_CATALOG.slice());
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(AVATAR_CATALOG[0]?.id || "");
  const [avatarSyncNotice, setAvatarSyncNotice] = useState("");
  const [avatarSyncNoticeIsError, setAvatarSyncNoticeIsError] = useState(false);
  const avatarSyncNoticeTimerRef = useRef<number | null>(null);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);
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
      { key: "general" as const, label: "Account", icon: "/Settings.svg" },
      { key: "preferences" as const, label: "Preferences", icon: "/Task_Settings.svg" },
      { key: "appearance" as const, label: "Appearance", icon: "/Appearance.svg" },
      { key: "notifications" as const, label: "Notifications", icon: "/Settings.svg" },
      { key: "userGuide" as const, label: "Help Center", icon: "/About.svg", id: "commandCenterHelpCenterBtn" },
      { key: "data" as const, label: "Data", icon: "/History_Manager.svg" },
      { key: "about" as const, label: "About", icon: "/About.svg" },
    ],
    []
  );
  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback = (feedbackAnonymous || isValidFeedbackEmail) && !!feedbackType && feedbackDetails.trim().length > 0;
  const canTriggerPushTest = !!authUserUid;
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
    if (typeof window === "undefined" || hasInitializedPaneRef.current) return;
    hasInitializedPaneRef.current = true;
    const queryPaneRaw = String(new URLSearchParams(window.location.search).get("pane") || "").trim();
    const requestedPane = isSettingsPaneKey(queryPaneRaw) ? queryPaneRaw : initialPane;
    if (requestedPane) {
      setActivePane((prev) => prev ?? requestedPane);
      setMobileDetailOpen(true);
      return;
    }
    const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
    if (!isMobileViewport) {
      setActivePane((prev) => prev ?? "general");
    }
  }, [initialPane]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUserEmail(user?.email || null);
      setAuthUserUid(user?.uid || null);
      const nextAlias = (user?.displayName || "").trim();
      setAuthUserAlias(nextAlias);
      setAuthUserAliasDraft(nextAlias);
      setAuthUserAliasEditing(false);
      setAuthUserAliasBusy(false);
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
        void syncCurrentUserPlanCache(user.uid).catch(() => {
          // Keep rendering from the cached/default plan if plan sync is temporarily unavailable.
        });
        void saveUserDocPatch(user.uid, {
          email: user.email || "",
          displayName: user.displayName || null,
          googlePhotoUrl: hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null,
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
      setAuthUserAlias("");
      setAuthUserAliasDraft("");
      return;
    }
    let cancelled = false;
    const loadClaimedUsername = async () => {
      const ref = userDocRef(authUserUid);
      if (!ref) return;
      try {
        const snap = await getDoc(ref);
        if (!snap.exists() || cancelled) return;
        const claimedUsername = String(snap.get("username") || "").trim();
        if (!claimedUsername) return;
        setAuthUserAlias(claimedUsername);
        setAuthUserAliasDraft((prev) => (authUserAliasEditing ? prev : claimedUsername));
      } catch {
        // Keep the auth/display-name fallback when the claimed username cannot be loaded.
      }
    };
    void loadClaimedUsername();
    return () => {
      cancelled = true;
    };
  }, [authUserUid, authUserAliasEditing, userDocRef]);

  useEffect(() => {
    if (feedbackAnonymous) return;
    setFeedbackEmail(authUserEmail || "");
  }, [authUserEmail, feedbackAnonymous]);

  useEffect(() => {
    if (authUserAliasEditing) return;
    setAuthUserAliasDraft(authUserAlias);
  }, [authUserAlias, authUserAliasEditing]);

  useEffect(() => {
    let cancelled = false;
    if (!authUserUid) {
      setPushDiagnostics(null);
      return;
    }
    const loadDiagnostics = async () => {
      const nextDiagnostics = await getTaskTimerPushDiagnostics(authUserUid);
      if (!cancelled) setPushDiagnostics(nextDiagnostics);
    };
    void loadDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [authUserUid, pushTestStatus]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowRankLadderModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRankLadderModal]);

  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const currentRankIndex = useMemo(
    () => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === rewardProgress.currentRankId)),
    [rewardProgress.currentRankId]
  );
  const canSelectRankInsignia = authUserUid === RANK_OVERRIDE_ADMIN_UID;
  const displayedRankLabel = rewardsHeader.rankLabel;
  const rankLadderSummary =
    rewardsHeader.xpToNext != null
      ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
      : "You have reached the highest configured rank.";

  const openRankLadderModal = () => {
    setShowRankLadderModal(true);
  };

  const handleSelectRankThumbnail = useCallback(
    async (rankId: string) => {
      if (!authUserUid || authUserUid !== RANK_OVERRIDE_ADMIN_UID) return;
      const nextRewards = buildRewardProgressForRankSelection(rewardProgress, rankId);
      const nextSrc = String(RANK_MODAL_THUMBNAIL_BY_ID[rankId] || "").trim();
      setRankThumbnailSrc(nextSrc);
      setRewardProgress(nextRewards);
      writeStoredRankThumbnailSrc(authUserUid, nextSrc);
      const currentPrefs = loadCachedPreferences() || buildDefaultCloudPreferences();
      saveCloudPreferences({
        ...currentPrefs,
        rewards: nextRewards,
      });
      try {
        await saveUserDocPatch(authUserUid, { rankThumbnailSrc: nextSrc || null });
        void syncOwnFriendshipProfile(authUserUid, {
          rankThumbnailSrc: nextSrc || null,
          currentRankId: nextRewards.currentRankId,
        }).catch(() => {
          // Ignore friendship profile sync failures from the settings surface.
        });
      } catch {
        // ignore rank thumbnail save failures from the settings surface
      }
    },
    [authUserUid, rewardProgress, saveUserDocPatch]
  );

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
      await waitForPendingTaskSync().catch(() => {
        // Fall back to the existing sign-out flow when pending task sync cannot complete.
      });
      await signOut(auth);
      clearScopedStorageState();
      setAuthStatus("Signed out.");
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(SIGN_OUT_LANDING_BYPASS_KEY, "1");
        } catch {
          // ignore
        }
        window.location.assign("/signed-out?signedOut=1");
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
          provider.setCustomParameters({ prompt: "select_account" });
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

  const handlePushTest = async () => {
    if (!authUserUid) {
      setPushTestStatus("Sign in first to send a test push.");
      return;
    }
    setPushTestBusy(true);
    setPushTestStatus("");
    try {
      const result = await sendPushTestNotification({
        title: "TaskLaunch Test",
        body: `Push check sent at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        data: {
          screen: "tasktimer",
          source: "settings-hidden-test",
        },
      });
      const successCount = Number(result.successCount || 0);
      const failureCount = Number(result.failureCount || 0);
      const tokenCount = Number(result.tokenCount || 0);
      setPushTestStatus(
        failureCount > 0
          ? `Push sent to ${successCount}/${tokenCount} device${tokenCount === 1 ? "" : "s"} (${failureCount} failed).`
          : `Push sent to ${successCount}/${tokenCount} device${tokenCount === 1 ? "" : "s"}.`
      );
    } catch (err: unknown) {
      setPushTestStatus(getErrorMessage(err, "Unable to send test push right now."));
    } finally {
      setPushTestBusy(false);
    }
  };

  const handleStartAliasEdit = () => {
    setAuthUserAliasDraft(authUserAlias);
    setAuthUserAliasEditing(true);
    setAuthError("");
    setAuthStatus("");
  };

  const handleCancelAliasEdit = () => {
    setAuthUserAliasDraft(authUserAlias);
    setAuthUserAliasEditing(false);
    setAuthUserAliasBusy(false);
  };

  const handleSaveAlias = async () => {
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    const uid = String(user?.uid || authUserUid || "").trim();
    const nextAlias = authUserAliasDraft.trim();
    if (!user || !uid) {
      setAuthError("Sign in is required to update your username.");
      setAuthStatus("");
      return;
    }
    if (!nextAlias) {
      setAuthError("Username cannot be empty.");
      setAuthStatus("");
      return;
    }
    const validationError = validateUsername(nextAlias);
    if (validationError) {
      setAuthError(validationError);
      setAuthStatus("");
      return;
    }
    const normalizedNextAlias = normalizeUsername(nextAlias);
    if (normalizedNextAlias === authUserAlias) {
      setAuthUserAliasEditing(false);
      setAuthError("");
      setAuthStatus("");
      return;
    }
    setAuthUserAliasBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      const result = await claimUsernameClient(nextAlias);
      const claimedUsername = String(result.usernameKey || normalizedNextAlias).trim();
      await syncOwnFriendshipProfile(uid, { alias: claimedUsername });
      setAuthUserAlias(claimedUsername);
      setAuthUserAliasDraft(claimedUsername);
      setAuthUserAliasEditing(false);
      setAuthStatus("Username updated.");
      setSyncState("synced");
      setSyncMessage("Cloud data connected.");
      setSyncAtMs(Date.now());
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Unable to update username right now."));
      setAuthStatus("");
    } finally {
      setAuthUserAliasBusy(false);
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
    const googleId = googleAvatarIdForUid(authUserUid);
    const isCustomAvatar = avatarId === customId;
    const isGoogleAvatar = avatarId === googleId;
    const customAvatarSrc = readStoredCustomAvatarSrc(authUserUid);
    const patch: Record<string, unknown> = {
      avatarId,
      avatarCustomSrc: isCustomAvatar ? customAvatarSrc || null : null,
      googlePhotoUrl: authHasGoogleProvider ? authGooglePhotoUrl || null : null,
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
        googlePhotoUrl: isGoogleAvatar ? authGooglePhotoUrl || null : null,
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
                id={item.id}
                icon={item.icon}
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
                    <div className="settingsAccountIdCard" aria-label="Account profile card">
                      <div className="settingsAccountIdCardHeader">
                        <div className="settingsAccountIdCardBrandBlock">
                          <div className="settingsAccountIdCardBrandEyebrow">TASKLAUNCH</div>
                          <div className="settingsAccountIdCardBrandTitle">PROFILE.</div>
                        </div>
                        <div className="settingsAccountIdCardHeaderRankCluster">
                          <div className="settingsAccountFieldRow settingsAccountRankCol settingsAccountIdCardHeaderRankMeta">
                            <div className="settingsAccountFieldLabel settingsAccountIdCardLabel">Current Rank</div>
                            <div className="settingsAccountIdCardRankValue">{displayedRankLabel}</div>
                          </div>
                          <button
                            className="settingsAccountRankBtn settingsAccountIdCardHeaderRankBtn"
                            type="button"
                            aria-label={`Open rank ladder. Current rank: ${displayedRankLabel}`}
                            onClick={openRankLadderModal}
                          >
                            <div className="settingsAccountRankPlaceholder settingsAccountIdCardHeaderRankBadge">
                              <RankThumbnail
                                rankId={rewardProgress.currentRankId}
                                storedThumbnailSrc={rankThumbnailSrc}
                                className="settingsAccountRankPlaceholderShell settingsAccountIdCardHeaderRankBadgeShell"
                                imageClassName="settingsAccountRankImage"
                                placeholderClassName="settingsAccountRankPlaceholderInner"
                                alt="Rank thumbnail"
                                size={44}
                              />
                            </div>
                          </button>
                        </div>
                      </div>
                      <div className="settingsAccountProfileRow settingsAccountIdCardBody">
                      <div className="settingsAvatarCol settingsAccountIdCardAvatarDock">
                        <button
                          type="button"
                          className="accountAvatarFrameBtn"
                          onClick={() => setShowAvatarPickerModal(true)}
                          aria-label="Choose avatar"
                        >
                          <div className="accountAvatarPlaceholder">
                            {selectedAvatar ? (
                              <AppImg
                                className="accountAvatarImage"
                                src={selectedAvatar.src}
                                alt={`${selectedAvatar.label} avatar`}
                              />
                            ) : (
                              <div className="accountAvatarPlaceholderInner" />
                            )}
                          </div>
                        </button>
                        <div className="settingsAccountIdCardAvatarCaption">Tap avatar to update profile badge</div>
                      </div>
                      <div className="settingsAccountIdCardIdentity">
                        <div className="settingsAccountFieldRow settingsAccountIdentityBlock">
                          <div className="settingsAccountFieldLabel settingsAccountIdCardLabel">Name</div>
                          <div className="settingsAccountFieldValueRow settingsAccountAliasValueRow">
                            {authUserAliasEditing ? (
                              <>
                                <input
                                  className="settingsAccountAliasInput"
                                  type="text"
                                  value={authUserAliasDraft}
                                  onChange={(event) => setAuthUserAliasDraft(event.target.value)}
                                  disabled={authUserAliasBusy}
                                  aria-label="Username"
                                  maxLength={60}
                                />
                                <div className="settingsAccountAliasActions">
                                  <button
                                    className="iconBtn settingsAccountAliasAction settingsAccountAliasActionSave"
                                    type="button"
                                    onClick={handleSaveAlias}
                                    disabled={authUserAliasBusy}
                                    aria-label="Save username"
                                    title="Save username"
                                  >
                                    âœ“
                                  </button>
                                  <button
                                    className="iconBtn settingsAccountAliasAction settingsAccountAliasActionCancel"
                                    type="button"
                                    onClick={handleCancelAliasEdit}
                                    disabled={authUserAliasBusy}
                                    aria-label="Cancel username edit"
                                    title="Cancel username edit"
                                  >
                                    âœ•
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="settingsAccountFieldValue settingsAccountFieldValueWrap settingsAccountIdCardNameValue">
                                  {authUserAlias || "-"}
                                </div>
                                <button
                                  className="iconBtn settingsAccountAliasAction"
                                  type="button"
                                  onClick={handleStartAliasEdit}
                                  aria-label="Edit username"
                                  title="Edit username"
                                >
                                  âœŽ
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="settingsAccountIdCardMetaGrid">
                        <div className="settingsAccountIdCardMetaItem">
                          <span className="settingsAccountUidLabel">Email Address</span>
                          <span className="settingsAccountUidValue">{authUserEmail}</span>
                        </div>
                        {authUserUid ? (
                          <div className="settingsAccountIdCardMetaItem settingsAccountUidRow">
                            <span className="settingsAccountUidLabel">UID</span>
                            <span className="settingsAccountUidValue">{authUserUid}</span>
                            <button className="btn btn-ghost small settingsUidCopyBtn" type="button" onClick={handleCopyUid}>
                              {uidCopyStatus || "Copy"}
                            </button>
                          </div>
                        ) : null}
                        <div className="settingsAccountIdCardMetaItem settingsAccountMemberSinceRow">
                          <span className="settingsAccountUidLabel">Member Since</span>
                          <span className="settingsAccountUidValue">{formatMemberSinceDate(authMemberSince)}</span>
                        </div>
                      </div>
                      <div className="settingsAccountIdCardDecor" aria-hidden="true">
                        <div className="settingsAccountIdCardDecorSignature">
                          <span className="settingsAccountFieldLabel settingsAccountIdCardLabel">Verified Identity</span>
                          <span className="settingsAccountIdCardDecorSignatureText">TaskTimer Member</span>
                        </div>
                        <div className="settingsAccountIdCardBarcode">
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                    </div>
                  </div>
                ) : null}
                {showRankLadderModal ? (
                  <div className="overlay" id="rankLadderOverlay" onClick={() => setShowRankLadderModal(false)}>
                    <div
                      className="modal rankLadderModal"
                      role="dialog"
                      aria-modal="true"
                      aria-label="Rank ladder"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <h2>Rank Ladder</h2>
                      <p className="modalSubtext">
                        {displayedRankLabel} is your current rank at {rewardsHeader.totalXp} XP. {rankLadderSummary}
                      </p>
                      <div className="rankLadderList" role="list" aria-label="Available ranks">
                        {RANK_LADDER.map((rank, index) => {
                          const isCurrent = rank.id === rewardProgress.currentRankId;
                          const isUnlocked = index <= currentRankIndex;
                          const thresholdLabel = Number.isFinite(rank.minXp) ? `${rank.minXp} XP` : "Threshold pending";
                          const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
                          const isSelectable = canSelectRankInsignia;
                          const isSelectedThumbnail = rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
                          const content = (
                            <>
                              <div className="rankLadderItemBadge" aria-hidden="true">
                                <RankThumbnail
                                  rankId={rank.id}
                                  storedThumbnailSrc=""
                                  className="rankLadderItemBadgeShell"
                                  imageClassName="rankLadderItemBadgeImage"
                                  placeholderClassName="rankLadderItemBadgePlaceholder"
                                  alt=""
                                  size={34}
                                  aria-hidden
                                />
                              </div>
                              <div className="rankLadderItemBody">
                                <div className="rankLadderItemTitleRow">
                                  <span className="rankLadderItemTitle">{rank.label}</span>
                                  {isSelectedThumbnail ? <span className="rankLadderItemFlag">Selected</span> : null}
                                  {isCurrent ? <span className="rankLadderItemFlag">Current</span> : null}
                                  {!isCurrent && isUnlocked ? <span className="rankLadderItemFlag">Unlocked</span> : null}
                                </div>
                                <div className="rankLadderItemMeta">Unlocks at {thresholdLabel}</div>
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
                {authUserEmail ? (
                  <div className="settingsDetailNote settingsAccountIdCardFooter">
                    <div className={`settingsSyncStatus is-${syncState}`}>
                      <span className="settingsSyncStatusDot" aria-hidden="true" />
                      <span className="settingsSyncStatusText">{syncMessage}</span>
                      {syncAtMs && syncState === "synced" ? (
                        <span className="settingsSyncStatusTime">
                          ({new Date(syncAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                        </span>
                      ) : null}
                    </div>
                    {pushDiagnostics ? (
                      <div className="settingsPushDiagnostics" aria-label="Push notification diagnostics">
                        <div className="settingsPushDiagnosticsRow">
                          <span className="settingsPushDiagnosticsLabel">Push Runtime</span>
                          <span className="settingsPushDiagnosticsValue">
                            {pushDiagnostics.runtime === "native" ? `${pushDiagnostics.platform} native` : "web"}
                          </span>
                        </div>
                        <div className="settingsPushDiagnosticsRow">
                          <span className="settingsPushDiagnosticsLabel">Permission</span>
                          <span className="settingsPushDiagnosticsValue">{pushDiagnostics.permission}</span>
                        </div>
                        <div className="settingsPushDiagnosticsRow">
                          <span className="settingsPushDiagnosticsLabel">Device ID</span>
                          <span className="settingsPushDiagnosticsValue settingsPushDiagnosticsMono">
                            {pushDiagnostics.deviceId || "--"}
                          </span>
                        </div>
                        <div className="settingsPushDiagnosticsRow">
                          <span className="settingsPushDiagnosticsLabel">Push Token</span>
                          <span className="settingsPushDiagnosticsValue">
                            {pushDiagnostics.cloudTokenPresent
                              ? "saved to cloud"
                              : pushDiagnostics.localTokenPresent
                                ? "local only"
                                : "not registered"}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div className="settingsInlineFooter settingsAuthActions settingsAuthActionsInline">
                      {canTriggerPushTest ? (
                        <button
                          className="btn btn-ghost small settingsPushTestBtn"
                          type="button"
                          disabled={authBusy || pushTestBusy}
                          onClick={handlePushTest}
                          title="Send a hidden push test to your registered devices"
                          aria-label="Send push test"
                        >
                          {pushTestBusy ? "Sending..." : "Push Test"}
                        </button>
                      ) : null}
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
                    {pushTestStatus ? <div className="settingsPushTestStatus">{pushTestStatus}</div> : null}
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
                              <AppImg src={avatar.src} alt={avatar.label} className="settingsAvatarOptionImg" />
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
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "preferences"}
            paneClassName="settingsDisplayTypographyPane"
            title="Preferences"
            subtitle="Configure task behavior and dashboard options."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Task Settings</div>
                </div>
                <div className="unitRow">
                  <span>Default Task Timer Format</span>
                  <div className="unitButtons">
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatDay" type="button">
                      D
                    </button>
                    <button className="btn btn-ghost small unitBtn isOn" id="taskDefaultFormatHour" type="button">
                      H
                    </button>
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatMinute" type="button">
                      M
                    </button>
                  </div>
                </div>
                <div className="toggleRow" id="taskAutoFocusOnLaunchToggleRow">
                  <span>Auto switch to Focus Mode on launch</span>
                  <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
                </div>
                <div className="unitRow" id="taskViewRow">
                  <span>Task View</span>
                  <div className="unitButtons" role="group" aria-label="Task view">
                    <button className="btn btn-ghost small unitBtn" id="taskViewList" type="button" aria-pressed="false">
                      List
                    </button>
                    <button className="btn btn-ghost small unitBtn isOn" id="taskViewTile" type="button" aria-pressed="true">
                      Tile
                    </button>
                  </div>
                </div>
                <div className="unitRow" id="taskWeekStartingRow">
                  <span>Week Starting</span>
                  <div className="unitButtons" role="group" aria-label="Week starting">
                    <button className="btn btn-ghost small unitBtn isOn" id="taskWeekStartingMon" type="button" aria-pressed="true">
                      MON
                    </button>
                    <button className="btn btn-ghost small unitBtn" id="taskWeekStartingSun" type="button" aria-pressed="false">
                      SUN
                    </button>
                  </div>
                </div>
              </section>

            </div>
            <div className="settingsInlineFooter">
              <button className="btn btn-ghost" id="preferencesLoadDefaultsBtn" type="button">
                Load Defaults
              </button>
            </div>
            <div style={{ display: "none" }} aria-hidden="true">
              <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button" tabIndex={-1}>
                Save Task Settings
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "appearance"}
            paneClassName="settingsDisplayTypographyPane"
            title="Appearance"
            subtitle="Choose your theme and visual display options."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Appearance</div>
                </div>
                <div className="unitRow" id="themeToggleRow">
                  <span>Theme</span>
                  <div className="unitButtons" role="group" aria-label="Theme mode">
                    <button className="btn btn-ghost small unitBtn" id="themePurpleBtn" type="button" aria-pressed="false">
                      Purple
                    </button>
                    <button className="btn btn-ghost small unitBtn" id="themeCyanBtn" type="button" aria-pressed="false">
                      Cyan
                    </button>
                  </div>
                </div>
                <div className="unitRow" id="menuButtonStyleRow">
                  <span>Menu and button style</span>
                  <div className="unitButtons" role="group" aria-label="Menu and button style">
                    <button
                      className="btn btn-ghost small unitBtn"
                      id="menuButtonStyleParallelogramBtn"
                      type="button"
                      aria-pressed="false"
                    >
                      Parallelogram
                    </button>
                    <button
                      className="btn btn-ghost small unitBtn"
                      id="menuButtonStyleSquareBtn"
                      type="button"
                      aria-pressed="false"
                    >
                      Square
                    </button>
                  </div>
                </div>
                <div className="toggleRow" id="taskDynamicColorsToggleRow">
                  <span>Use dynamic colors on progress bar and charts</span>
                  <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
                </div>
              </section>
            </div>
            <div className="settingsInlineFooter">
              <button className="btn btn-ghost" id="appearanceLoadDefaultsBtn" type="button">
                Load Defaults
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "notifications"}
            paneClassName="settingsDisplayTypographyPane"
            title="Notifications"
            subtitle="Manage checkpoint sound and toast alerts."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Checkpoint Alerts</div>
                </div>
                <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
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

              <a className="menuItem settingsDataTile" id="commandCenterFeedbackBtn" href="/tasktimer/feedback" aria-label="Feedback">

                <MenuIconLabel icon="/Feedback.svg" label="Feedback" />

              </a>

            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "about"}
            title="About"
            subtitle="App summary, version information, and feature overview."
          >
            <div className="aboutText" style={{ fontFamily: "var(--font-geist-sans)" }}>
              <p style={{ marginTop: 0 }}>
                TaskLaunch is a focused productivity app built for people who want fast, intentional control over
                timed work, routines, and momentum-building sessions.
              </p>
              <p>
                It is designed to make it easy to launch into work quickly, track progress clearly, and review how your
                time is actually being spent across both mobile and desktop layouts.
              </p>

              <p style={{ marginBottom: 6, fontWeight: 700 }}>What TaskLaunch is for</p>
              <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                <li>Launching focused work sessions with less friction</li>
                <li>Tracking habits, routines, and repeatable personal workflows</li>
                <li>Monitoring progress against checkpoints, milestones, and time goals</li>
                <li>Reviewing trends, session history, and task performance over time</li>
                <li>Keeping task and history data portable through backup export and import</li>
              </ul>

              <p style={{ marginBottom: 6, fontWeight: 700 }}>Core features</p>
              <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                <li>Task timers with start, stop, reset, duplication, editing, and per-task configuration</li>
                <li>Time goals, checkpoints, and milestone systems for structuring longer sessions</li>
                <li>Focus Mode with a dedicated dial view, checkpoint markers, and session notes</li>
                <li>Sound and toast checkpoint alerts, including repeat-until-dismiss behaviors</li>
                <li>Dashboard insights, heatmaps, averages, and history views for reviewing progress</li>
                <li>History management tools with export, cleanup, and analysis workflows</li>
                <li>Optional sign-in, friend features, and shared task summaries for connected use cases</li>
              </ul>

              <p style={{ margin: "12px 0 6px", fontWeight: 700 }}>Design approach</p>
              <ul style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Fast access to common actions with minimal interruption</li>
                <li>High-contrast feedback for active timing, progress, and alerts</li>
                <li>Responsive layouts that stay usable on smaller screens without losing depth</li>
                <li>A productivity workflow that balances quick session control with longer-term review</li>
              </ul>

              <div className="settingsInlineFooter" style={{ marginTop: 16 }}>
                <a className="btn btn-ghost" href="/privacy">
                  Privacy Policy
                </a>
              </div>
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
                  <AppImg className="settingsInlineSectionIcon" src="/Feedback.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Feedback Form</div>
                </div>

                <div className={`field settingsFeedbackEmailField${feedbackAnonymous ? " isDisabled" : ""}`}>
                  <label className={feedbackAnonymous ? "isDisabled" : undefined} htmlFor="feedbackEmailInput">
                    {feedbackAnonymous ? "Email Address (anonymous)" : "Email Address"}
                  </label>
                  <input
                    id="feedbackEmailInput"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    value={feedbackEmail}
                    disabled={feedbackAnonymous}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                  />
                </div>

                <label className="chkRow settingsFeedbackAnonymousRow">
                  <input
                    type="checkbox"
                    checked={feedbackAnonymous}
                    onChange={(e) => setFeedbackAnonymous(e.target.checked)}
                  />
                  <span>Log as anonymous</span>
                </label>

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
                  <button className="btn btn-ghost small settingsFeedbackUploadBtn" type="button" disabled>
                    Upload Screenshot
                  </button>
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
            <div className="settingsInlineStack settingsDataListStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/History_Manager.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">History</div>
                </div>
                <button className="menuItem settingsNavTile settingsDataListItem" data-menu="historyManager" id="historyManagerBtn" type="button">
                  <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
                </button>
              </section>
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/Export.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Import/Export</div>
                </div>
                <button className="menuItem settingsNavTile settingsDataListItem" id="exportBtn" type="button">
                  <MenuIconLabel icon="/Export.svg" label="Export Backup" />
                </button>
                <button className="menuItem settingsNavTile settingsDataListItem" id="importBtn" type="button">
                  <MenuIconLabel icon="/Import.svg" label="Import Backup" />
                </button>
              </section>
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <AppImg className="settingsInlineSectionIcon" src="/Reset.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Reset</div>
                </div>
                <button className="menuItem settingsNavTile settingsDataListItem settingsDataListItemDanger" id="resetAllBtn" type="button">
                  <MenuIconLabel icon="/Reset.svg" label="Reset All Data" />
                </button>
              </section>
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


