"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppImg from "@/components/AppImg";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { AVATAR_CATALOG } from "../lib/avatarCatalog";
import { syncOwnFriendshipProfile } from "../lib/friendsStore";
import RankThumbnail from "./RankThumbnail";
import {
  buildRewardProgressForRankSelection,
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  normalizeRewardProgress,
  RANK_LADDER,
  RANK_MODAL_THUMBNAIL_BY_ID,
  RANK_OVERRIDE_ADMIN_UID,
} from "../lib/rewards";
import {
  buildDefaultCloudPreferences,
  loadCachedPreferences,
  saveCloudPreferences,
  STORAGE_KEY,
  subscribeCachedPreferences,
} from "../lib/storage";
import {
  resolveArchieAssistantResponse,
  type ArchieSuggestedAction,
} from "../lib/archieAssistant";
import {
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerPlan,
} from "../lib/entitlements";
import { syncCurrentUserPlanCache } from "../lib/planFunctions";

type DesktopRailPage = "dashboard" | "tasks" | "test2" | "settings" | "none";

type DesktopAppRailProps = {
  activePage: DesktopRailPage;
  useClientNavButtons?: boolean;
  showDesktopRail?: boolean;
  showMobileFooter?: boolean;
};

type NavItem = {
  page: DesktopRailPage;
  label: string;
  ariaLabel: string;
  iconSrc: string;
  desktopId: string;
  mobileId: string;
  href: string;
};

type ArchieBlinkPattern = "idle" | "flicker" | "slow" | "double";

const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;
const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";
const ARCHIE_DEFAULT_PROMPT = "What can I help with?";
const ARCHIE_OUTLINE_DRAW_MS = 840;
const ARCHIE_TYPE_MS = 840;
const ARCHIE_BLINK_DURATION_MS = 2000;
const ARCHIE_BLINK_MIN_DELAY_MS = 10000;
const ARCHIE_BLINK_MAX_DELAY_MS = 15000;
const ARCHIE_PENDING_PUSH_TASK_ID_KEY = `${STORAGE_KEY}:pendingPushTaskId`;
const ARCHIE_PENDING_PUSH_TASK_EVENT = "tasktimer:pendingTaskJump";
const NAV_ITEMS: NavItem[] = [
  {
    page: "dashboard",
    label: "Dashboard",
    ariaLabel: "Dashboard",
    iconSrc: "/Dashboard.svg",
    desktopId: "commandCenterDashboardBtn",
    mobileId: "footerDashboardBtn",
    href: "/tasktimer/dashboard",
  },
  {
    page: "tasks",
    label: "Tasks",
    ariaLabel: "Tasks",
    iconSrc: "/Task_List.svg",
    desktopId: "commandCenterTasksBtn",
    mobileId: "footerTasksBtn",
    href: "/tasktimer",
  },
  {
    page: "test2",
    label: "Friends",
    ariaLabel: "Friends",
    iconSrc: "/Friends.svg",
    desktopId: "commandCenterGroupsBtn",
    mobileId: "footerTest2Btn",
    href: "/tasktimer/friends",
  },
  {
    page: "settings",
    label: "Settings",
    ariaLabel: "Settings",
    iconSrc: "/Settings.svg",
    desktopId: "commandCenterSettingsBtn",
    mobileId: "footerSettingsBtn",
    href: "/tasktimer/settings",
  },
];

function avatarStorageKeyForUid(uid: string) {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`;
}

function avatarCustomStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`;
}

function rankThumbnailStorageKeyForUid(uid: string) {
  return `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`;
}

function customAvatarIdForUid(uid: string) {
  return `custom-upload:${uid}`;
}

function googleAvatarIdForUid(uid: string) {
  return `google/profile-photo:${uid}`;
}

function readStoredAvatarId(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarStorageKeyForUid(uid)) || "").trim();
}

function readStoredCustomAvatarSrc(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarCustomStorageKeyForUid(uid)) || "").trim();
}

function readStoredRankThumbnailSrc(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(rankThumbnailStorageKeyForUid(uid)) || "").trim();
}

function writeStoredRankThumbnailSrc(uid: string, src: string) {
  if (typeof window === "undefined" || !uid) return;
  const normalizedSrc = String(src || "").trim();
  if (!normalizedSrc) {
    window.localStorage.removeItem(rankThumbnailStorageKeyForUid(uid));
    return;
  }
  window.localStorage.setItem(rankThumbnailStorageKeyForUid(uid), normalizedSrc);
}

function labelFromUser(user: User | null) {
  const displayName = String(user?.displayName || "").trim();
  if (displayName) return displayName;
  const email = String(user?.email || "").trim();
  if (email) return email.split("@")[0] || email;
  return "TaskLaunch User";
}

function resolveAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string) {
  const normalizedAvatarId = String(avatarId || "").trim();
  if (avatarCustomSrc) return avatarCustomSrc;
  if (normalizedAvatarId && normalizedAvatarId === customAvatarIdForUid(uid) && avatarCustomSrc) return avatarCustomSrc;
  if (normalizedAvatarId && normalizedAvatarId === googleAvatarIdForUid(uid) && googlePhotoUrl) return googlePhotoUrl;
  if (normalizedAvatarId) {
    const match = AVATAR_CATALOG.find((avatar) => avatar.id === normalizedAvatarId);
    if (match?.src) return match.src;
  }
  return googlePhotoUrl;
}

function initialsFromLabel(label: string) {
  const parts = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "TL";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function renderDesktopNavItem(item: NavItem, activePage: DesktopRailPage, useClientNavButtons: boolean) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small dashboardRailMenuBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
    ...(isActive ? { "aria-current": "page" as const } : {}),
  };

  if (useClientNavButtons && item.page !== "settings") {
    return (
      <button key={item.desktopId} {...commonProps} id={item.desktopId} type="button">
        <AppImg
          className="dashboardRailMenuIconImage"
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        <span className="dashboardRailMenuLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a key={item.desktopId} {...commonProps} id={item.desktopId} href={item.href}>
      <AppImg
        className="dashboardRailMenuIconImage"
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      <span className="dashboardRailMenuLabel">{item.label}</span>
    </a>
  );
}

function renderMobileNavItem(item: NavItem, activePage: DesktopRailPage, useClientNavButtons: boolean) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small appFooterBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
  };

  if (useClientNavButtons && item.page !== "settings") {
    return (
      <button key={item.mobileId} {...commonProps} id={item.mobileId} type="button">
        <AppImg
          className="appFooterIconImage"
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        {item.page === "test2" ? (
          <span
            id="footerTest2AlertBadge"
            className="appFooterAlertBadge"
            aria-live="polite"
            aria-atomic="true"
            style={{ display: "none" }}
          />
        ) : null}
        <span className="appFooterLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a key={item.mobileId} {...commonProps} id={item.mobileId} href={item.href}>
      <AppImg
        className="appFooterIconImage"
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      {item.page === "test2" ? (
        <span
          id="footerTest2AlertBadge"
          className="appFooterAlertBadge"
          aria-live="polite"
          aria-atomic="true"
          style={{ display: "none" }}
        />
      ) : null}
      <span className="appFooterLabel">{item.label}</span>
    </a>
  );
}

export default function DesktopAppRail({
  activePage,
  useClientNavButtons = false,
  showDesktopRail = true,
  showMobileFooter = true,
}: DesktopAppRailProps) {
  const [signedInUserUid, setSignedInUserUid] = useState("");
  const [profileLabel, setProfileLabel] = useState("TaskLaunch User");
  const [profileAvatarSrc, setProfileAvatarSrc] = useState("");
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<TaskTimerPlan>("free");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [isArchieBubbleOpen, setIsArchieBubbleOpen] = useState(false);
  const [archieQuestion, setArchieQuestion] = useState("");
  const [archieDisplayMessage, setArchieDisplayMessage] = useState(ARCHIE_DEFAULT_PROMPT);
  const [archieTitleAnimation, setArchieTitleAnimation] = useState<"none" | "prompt" | "response">("none");
  const [archieTitleAnimationKey, setArchieTitleAnimationKey] = useState(0);
  const [archieOutlineAnimating, setArchieOutlineAnimating] = useState(false);
  const [archieOutlineComplete, setArchieOutlineComplete] = useState(false);
  const [archieInputVisible, setArchieInputVisible] = useState(false);
  const [archieSuggestedAction, setArchieSuggestedAction] = useState<ArchieSuggestedAction | null>(null);
  const [archieBlinkPattern, setArchieBlinkPattern] = useState<ArchieBlinkPattern>("idle");
  const archieInputRef = useRef<HTMLInputElement | null>(null);
  const archieTimersRef = useRef<number[]>([]);
  const archieBlinkStartTimerRef = useRef<number | null>(null);
  const archieBlinkStopTimerRef = useRef<number | null>(null);

  const syncProfileFromUser = useCallback(async (user: User | null) => {
    const uid = String(user?.uid || "").trim();
    const fallbackLabel = labelFromUser(user);
    const googlePhotoUrl = String(user?.photoURL || "").trim();

    if (!uid) {
      setSignedInUserUid("");
      setProfileLabel(fallbackLabel);
      setProfileAvatarSrc(googlePhotoUrl);
      setRankThumbnailSrc("");
      setCurrentPlan("free");
      return;
    }
    setSignedInUserUid(uid);
    void syncCurrentUserPlanCache(uid).catch(() => {
      // Keep rendering from the cached/default plan if the plan sync is temporarily unavailable.
    });

    const storedAvatarId = readStoredAvatarId(uid);
    const storedCustomAvatarSrc = readStoredCustomAvatarSrc(uid);
    const storedRankThumbnailSrc = readStoredRankThumbnailSrc(uid);
    setProfileLabel(fallbackLabel);
    setProfileAvatarSrc(resolveAvatarSrc(uid, storedAvatarId, storedCustomAvatarSrc, googlePhotoUrl));
    setRankThumbnailSrc(storedRankThumbnailSrc);

    const db = getFirebaseFirestoreClient();
    if (!db) return;

    try {
      const snap = await getDoc(doc(db, "users", uid));
      const alias = snap.exists() ? String(snap.get("alias") || snap.get("displayName") || "").trim() : "";
      const avatarId = String((snap.exists() ? snap.get("avatarId") : "") || storedAvatarId).trim();
      const avatarCustomSrc = String(snap.get("avatarCustomSrc") || storedCustomAvatarSrc).trim();
      const remoteRankThumbnailSrc = String(snap.get("rankThumbnailSrc") || storedRankThumbnailSrc).trim();
      const remoteGooglePhotoUrl = String((snap.exists() ? snap.get("googlePhotoUrl") : "") || "").trim();
      const remotePlan = snap.exists() ? String(snap.get("plan") || "").trim().toLowerCase() : "";
      if (googlePhotoUrl && remoteGooglePhotoUrl !== googlePhotoUrl) {
        void setDoc(
          doc(db, "users", uid),
          {
            schemaVersion: 1,
            updatedAt: serverTimestamp(),
            googlePhotoUrl,
          },
          { merge: true }
        ).catch(() => {
          // Keep rendering from local auth state when cloud sync is unavailable.
        });
      }
      setProfileLabel(alias || fallbackLabel);
      setProfileAvatarSrc(resolveAvatarSrc(uid, avatarId, avatarCustomSrc, remoteGooglePhotoUrl || googlePhotoUrl));
      setRankThumbnailSrc(remoteRankThumbnailSrc);
      if (remotePlan === "free" || remotePlan === "pro") {
        setCurrentPlan(remotePlan);
      }
    } catch {
      // Keep local/auth profile state if user-doc enrichment fails.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncStoredPlan = () => setCurrentPlan(readTaskTimerPlanFromStorage());
    syncStoredPlan();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncStoredPlan as EventListener);
    return () => {
      window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncStoredPlan as EventListener);
    };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void syncProfileFromUser(user);
    });
    const refreshProfile = () => {
      void syncProfileFromUser(auth.currentUser);
    };
    window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
    return () => {
      window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
      unsubscribe();
    };
  }, [syncProfileFromUser]);

  useEffect(() => {
    if (!showRankLadderModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowRankLadderModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRankLadderModal]);

  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const currentPlanLabel = currentPlan === "pro" ? "Pro" : "Free";
  const profileInitials = useMemo(() => initialsFromLabel(profileLabel), [profileLabel]);
  const currentRankIndex = Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === rewardProgress.currentRankId));
  const canSelectRankInsignia = signedInUserUid === RANK_OVERRIDE_ADMIN_UID;
  const rankLadderSummary =
    rewardsHeader.xpToNext != null
      ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
      : "You have reached the highest configured rank.";
  const mockNextPaymentDateLabel = useMemo(() => {
    if (currentPlan !== "pro") return "No upcoming charge while on Free.";
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 14);
    return nextDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [currentPlan]);

  const handleOpenPricingPage = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open("/pricing", "_blank", "noopener,noreferrer");
  }, []);

  const handleOpenBillingPortal = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    const uid = String(auth?.currentUser?.uid || "").trim();
    if (!uid || billingBusy) return;

    setBillingBusy(true);
    setBillingError("");
    try {
      const res = await fetch("/api/stripe/create-billing-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid,
          returnPath: "/tasktimer/settings?pane=general",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not open billing management.");
      }
      window.location.assign(data.url);
    } catch (error: unknown) {
      setBillingError(error instanceof Error && error.message ? error.message : "Could not open billing management.");
      setBillingBusy(false);
    }
  }, [billingBusy]);

  const handleSelectRankThumbnail = async (rankId: string) => {
    if (!signedInUserUid || signedInUserUid !== RANK_OVERRIDE_ADMIN_UID) return;
    const nextRewards = buildRewardProgressForRankSelection(rewardProgress, rankId);
    const nextSrc = String(RANK_MODAL_THUMBNAIL_BY_ID[rankId] || "").trim();
    const currentPrefs = loadCachedPreferences() || buildDefaultCloudPreferences();
    setRewardProgress(nextRewards);
    setRankThumbnailSrc(nextSrc);
    writeStoredRankThumbnailSrc(signedInUserUid, nextSrc);
    saveCloudPreferences({
      ...currentPrefs,
      rewards: nextRewards,
    });
    try {
      const db = getFirebaseFirestoreClient();
      if (db) {
        await setDoc(
          doc(db, "users", signedInUserUid),
          {
            schemaVersion: 1,
            updatedAt: serverTimestamp(),
            rankThumbnailSrc: nextSrc || null,
          },
          { merge: true }
        );
      }
    } catch {
      // Keep local selection even if cloud sync fails.
    }
    try {
      await syncOwnFriendshipProfile(signedInUserUid, {
        rankThumbnailSrc: nextSrc || null,
        currentRankId: nextRewards.currentRankId,
      });
    } catch {
      // Ignore friendship profile rank sync failures from the desktop rail.
    }
    setShowRankLadderModal(false);
  };

  const clearArchieTimers = useCallback(() => {
    archieTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    archieTimersRef.current = [];
  }, []);

  const prefersReducedMotion = useCallback(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const queueArchieTimer = useCallback((callback: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      archieTimersRef.current = archieTimersRef.current.filter((entry) => entry !== timerId);
      callback();
    }, delayMs);
    archieTimersRef.current.push(timerId);
  }, []);

  const clearArchieBlinkTimers = useCallback(() => {
    if (archieBlinkStartTimerRef.current != null) {
      window.clearTimeout(archieBlinkStartTimerRef.current);
      archieBlinkStartTimerRef.current = null;
    }
    if (archieBlinkStopTimerRef.current != null) {
      window.clearTimeout(archieBlinkStopTimerRef.current);
      archieBlinkStopTimerRef.current = null;
    }
  }, []);

  const resetArchieBubble = useCallback(() => {
    clearArchieTimers();
    setArchieQuestion("");
    setArchieDisplayMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(false);
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
  }, [clearArchieTimers]);

  const startArchiePromptSequence = useCallback(() => {
    const reducedMotion = prefersReducedMotion();
    clearArchieTimers();
    setArchieQuestion("");
    setArchieDisplayMessage(ARCHIE_DEFAULT_PROMPT);
    setArchieInputVisible(false);
    setArchieSuggestedAction(null);
    setArchieOutlineAnimating(!reducedMotion);
    setArchieOutlineComplete(reducedMotion);
    setArchieTitleAnimation("none");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation("none");
      setArchieInputVisible(true);
      return;
    }
    queueArchieTimer(() => {
      setArchieOutlineAnimating(false);
      setArchieOutlineComplete(true);
      setArchieTitleAnimation("prompt");
      setArchieTitleAnimationKey((value) => value + 1);
    }, ARCHIE_OUTLINE_DRAW_MS);
    queueArchieTimer(() => {
      setArchieTitleAnimation("none");
      setArchieInputVisible(true);
    }, ARCHIE_OUTLINE_DRAW_MS + ARCHIE_TYPE_MS);
  }, [clearArchieTimers, prefersReducedMotion, queueArchieTimer]);

  const submitArchieQuestion = useCallback(() => {
    const nextQuestion = String(archieQuestion || "").trim();
    if (!nextQuestion) return;
    const reducedMotion = prefersReducedMotion();
    const reply = resolveArchieAssistantResponse(nextQuestion, activePage);
    clearArchieTimers();
    setArchieQuestion("");
    setArchieDisplayMessage(reply.message);
    setArchieInputVisible(false);
    setArchieSuggestedAction(reply.suggestedAction || null);
    setArchieOutlineAnimating(false);
    setArchieOutlineComplete(true);
    setArchieTitleAnimation(reducedMotion ? "none" : "response");
    setArchieTitleAnimationKey((value) => value + 1);
    if (reducedMotion) {
      setArchieInputVisible(true);
      return;
    }
    queueArchieTimer(() => {
      setArchieTitleAnimation("none");
      setArchieInputVisible(true);
    }, ARCHIE_TYPE_MS);
  }, [activePage, archieQuestion, clearArchieTimers, prefersReducedMotion, queueArchieTimer]);

  const handleArchieSuggestedAction = useCallback(() => {
    if (!archieSuggestedAction || typeof window === "undefined") return;
    if (archieSuggestedAction.kind === "navigate") {
      window.location.assign(archieSuggestedAction.href);
      return;
    }
    if (archieSuggestedAction.kind === "openSettingsPane") {
      window.location.assign(`/tasktimer/settings?pane=${archieSuggestedAction.pane}`);
      return;
    }
    try {
      window.localStorage.setItem(ARCHIE_PENDING_PUSH_TASK_ID_KEY, archieSuggestedAction.taskId);
    } catch {
      // Ignore localStorage failures and still attempt event-based delivery.
    }
    try {
      window.dispatchEvent(new CustomEvent(ARCHIE_PENDING_PUSH_TASK_EVENT, { detail: { taskId: archieSuggestedAction.taskId } }));
    } catch {
      // Ignore custom event failures.
    }
    const pathname = String(window.location.pathname || "");
    const onTasksRoute = /\/tasktimer\/?$/i.test(pathname) || /\/tasktimer\/index\.html$/i.test(pathname);
    if (!onTasksRoute) window.location.assign("/tasktimer");
  }, [archieSuggestedAction]);

  const handleArchieToggle = useCallback(() => {
    if (isArchieBubbleOpen) {
      setIsArchieBubbleOpen(false);
      resetArchieBubble();
      return;
    }
    setIsArchieBubbleOpen(true);
    startArchiePromptSequence();
  }, [isArchieBubbleOpen, resetArchieBubble, startArchiePromptSequence]);

  const handleArchieInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      submitArchieQuestion();
    },
    [submitArchieQuestion]
  );

  useEffect(() => {
    if (!isArchieBubbleOpen || !archieInputVisible) return;
    archieInputRef.current?.focus();
  }, [archieInputVisible, isArchieBubbleOpen]);

  useEffect(() => {
    if (prefersReducedMotion()) {
      clearArchieBlinkTimers();
      setArchieBlinkPattern("idle");
      return;
    }

    const blinkPatterns: ArchieBlinkPattern[] = ["flicker", "slow", "double"];
    const scheduleNextBlink = () => {
      const nextDelay =
        ARCHIE_BLINK_MIN_DELAY_MS +
        Math.round(Math.random() * (ARCHIE_BLINK_MAX_DELAY_MS - ARCHIE_BLINK_MIN_DELAY_MS));
      archieBlinkStartTimerRef.current = window.setTimeout(() => {
        const nextPattern = blinkPatterns[Math.floor(Math.random() * blinkPatterns.length)] || "slow";
        setArchieBlinkPattern(nextPattern);
        archieBlinkStopTimerRef.current = window.setTimeout(() => {
          setArchieBlinkPattern("idle");
          scheduleNextBlink();
        }, ARCHIE_BLINK_DURATION_MS);
      }, nextDelay);
    };

    clearArchieBlinkTimers();
    setArchieBlinkPattern("idle");
    scheduleNextBlink();

    return () => {
      clearArchieBlinkTimers();
      setArchieBlinkPattern("idle");
    };
  }, [clearArchieBlinkTimers, prefersReducedMotion]);

  useEffect(
    () => () => {
      clearArchieTimers();
      clearArchieBlinkTimers();
    },
    [clearArchieBlinkTimers, clearArchieTimers]
  );

  return (
    <>
      {showDesktopRail ? (
        <aside className="dashboardRail desktopAppRail" aria-label="TaskLaunch navigation">
          <div className="desktopRailTopSection">
            <div className="dashboardRailSectionLabel">Modules</div>
            <nav className="dashboardRailNav">
              {NAV_ITEMS.map((item) =>
                renderDesktopNavItem(item, activePage, useClientNavButtons)
              )}
            </nav>
          </div>

          <div className="desktopRailMiddleSection">
            <div className="desktopRailMascot">
              <div
                className={`desktopRailMascotBubble${isArchieBubbleOpen ? " isOpen" : ""}${archieOutlineAnimating ? " isOutlineAnimating" : ""}${archieOutlineComplete ? " isOutlineComplete" : ""}`}
                aria-hidden={!isArchieBubbleOpen}
              >
                <span className="desktopRailMascotBubbleOutline" aria-hidden="true">
                  <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineTop" />
                  <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineRight" />
                  <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineBottomRight" />
                  <span className="desktopRailMascotBubbleTailSvg" />
                  <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineBottomLeft" />
                  <span className="desktopRailMascotBubbleLine desktopRailMascotBubbleLineLeft" />
                </span>
                <div className="desktopRailMascotBubbleTitle">
                  <span
                    key={archieTitleAnimationKey}
                    className={`desktopRailMascotBubbleTitleText${archieTitleAnimation === "prompt" ? " isTypingPrompt" : ""}${archieTitleAnimation === "response" ? " isTypingResponse" : ""}${archieTitleAnimation !== "none" || archieInputVisible ? " isVisible" : ""}`}
                    style={{ "--archie-title-width": `${Math.max(archieDisplayMessage.length, 1)}ch` } as CSSProperties}
                  >
                    {archieDisplayMessage}
                  </span>
                </div>
                {archieSuggestedAction ? (
                  <div className={`desktopRailMascotActionRow${archieInputVisible ? " isVisible" : ""}`}>
                    <button
                      className="btn btn-ghost small desktopRailMascotActionBtn"
                      type="button"
                      onClick={handleArchieSuggestedAction}
                    >
                      {archieSuggestedAction.label}
                    </button>
                  </div>
                ) : null}
                <span className={`desktopRailMascotInputRow${archieInputVisible ? " isVisible" : ""}`}>
                  <input
                    ref={archieInputRef}
                    className="desktopRailMascotInput"
                    type="text"
                    value={archieQuestion}
                    onChange={(event) => setArchieQuestion(event.target.value)}
                    onKeyDown={handleArchieInputKeyDown}
                    placeholder="Ask Archie a question..."
                    aria-label="Ask Archie a question"
                  />
                  <span className="desktopRailMascotInputCaret" aria-hidden="true" />
                </span>
              </div>
              <button
                className={`desktopRailMascotTrigger${isArchieBubbleOpen ? " isOpen" : ""}`}
                type="button"
                aria-label="Ask Archie what he can help with"
                aria-expanded={isArchieBubbleOpen}
                onClick={handleArchieToggle}
              >
                <span className="desktopRailMascotFigure" aria-hidden="true">
                  <AppImg className="desktopRailMascotImage" src="/archie/turned_in_left.png" alt="" />
                  <span className="desktopRailMascotBody" />
                  <span
                    className={`desktopRailMascotBlinkOverlay${archieBlinkPattern !== "idle" ? ` is${archieBlinkPattern[0].toUpperCase()}${archieBlinkPattern.slice(1)}` : ""}`}
                  />
                </span>
              </button>
            </div>
          </div>

          <div className="desktopRailBottomSection">
            <div className="desktopRailProfileDock">
              <section
                className="dashboardCard dashboardProfileCard dashboardRailProfileSummary dashboardRailProfileSummarySdCard"
                aria-label="Profile summary"
              >
                <div className="dashboardProfileHead dashboardRailProfileHead">
                  {profileAvatarSrc ? (
                    <AppImg className="dashboardAvatarImage dashboardAvatar dashboardRailProfileAvatar" src={profileAvatarSrc} alt="" aria-hidden="true" />
                  ) : (
                    <div className="dashboardAvatar dashboardRailProfileAvatar">{profileInitials}</div>
                  )}
                  <div className="dashboardRailProfileIdentity">
                    <div className="dashboardProfileName">{profileLabel}</div>
                    <div className="dashboardTagRow dashboardRailProfileTags">
                      <a className="dashboardTag dashboardRailProfileTagLink" href="/tasktimer/settings?pane=general">
                        View Profile
                      </a>
                      <button
                        className="dashboardTag dashboardRailProfileTagLink"
                        id="rewardsInfoOpenBtn"
                        type="button"
                        aria-label={`Open ${currentPlanLabel} subscription details`}
                        title={`${currentPlanLabel} subscription details`}
                      >
                        {currentPlanLabel}
                      </button>
                    </div>
                  </div>
                  <button
                    className="dashboardRailProfileMetricRank dashboardRailProfileMetricRankBtn"
                    type="button"
                    aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}
                    onClick={() => setShowRankLadderModal(true)}
                  >
                    <RankThumbnail
                      rankId={rewardProgress.currentRankId}
                      storedThumbnailSrc={rankThumbnailSrc}
                      className="dashboardRailRankBadgeShell"
                      imageClassName="dashboardRailRankBadge"
                      placeholderClassName="dashboardRailRankBadgePlaceholder"
                      alt=""
                      size={44}
                      aria-hidden
                    />
                    <div className="dashboardProfileMeta dashboardRailRankLabel">{rewardsHeader.rankLabel}</div>
                  </button>
                </div>
              </section>
            </div>
          </div>

        </aside>
      ) : null}

      {showMobileFooter ? (
        <div className="appFooterNav" aria-label="App pages">
          {NAV_ITEMS.map((item) => renderMobileNavItem(item, activePage, useClientNavButtons))}
        </div>
      ) : null}
      <div className="overlay" id="rewardsInfoOverlay">
        <div className="modal rewardsInfoModal" role="dialog" aria-modal="true" aria-label="Subscription details">
          <h2>{currentPlanLabel} Subscription</h2>
          <p className="modalSubtext">
            {currentPlan === "pro"
              ? "Manage billing, payment methods, invoices, and cancellation in Stripe's secure customer portal."
              : "Upgrade to Pro to unlock advanced history, analytics, task setup, backup tools, and social features."}
          </p>
          <div className="rewardsInfoDetailGrid" aria-label="Subscription summary">
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Plan</span>
              <strong className="rewardsInfoDetailValue">{currentPlanLabel}</strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Status</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "pro" ? "Active" : "Available"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Billing Cycle</span>
              <strong className="rewardsInfoDetailValue">
                {currentPlan === "pro" ? "Monthly" : "No billing on Free"}
              </strong>
            </div>
            <div className="rewardsInfoDetailItem">
              <span className="rewardsInfoDetailLabel">Next Payment Date</span>
              <strong className="rewardsInfoDetailValue">{mockNextPaymentDateLabel}</strong>
            </div>
          </div>
          <div className="rewardsInfoText">
            {currentPlan === "pro"
              ? "Your Pro subscription includes advanced history, analytics, task setup, full-history backup tools, and connected social features."
              : "Free keeps the core solo workflow unlocked. Upgrade whenever you want the advanced workflow and billing-backed account features."}
          </div>
          {billingError ? (
            <div className="settingsDetailNote" role="alert" aria-live="polite">
              {billingError}
            </div>
          ) : null}
          <div className="confirmBtns rewardsInfoActions">
            {currentPlan === "pro" ? (
              <button className="btn btn-accent" type="button" onClick={() => void handleOpenBillingPortal()} disabled={billingBusy}>
                {billingBusy ? "Opening Billing..." : "Manage Billing"}
              </button>
            ) : (
              <button className="btn btn-accent" type="button" onClick={handleOpenPricingPage}>
                Upgrade to Pro
              </button>
            )}
            <button className="btn btn-ghost closePopup" id="rewardsInfoCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
      {showRankLadderModal ? (
        <div className="overlay" id="rankLadderOverlay" onClick={() => setShowRankLadderModal(false)}>
          <div className="modal rankLadderModal" role="dialog" aria-modal="true" aria-label="Rank ladder" onClick={(event) => event.stopPropagation()}>
            <h2>Rank Ladder</h2>
            <p className="modalSubtext">
              {rewardsHeader.rankLabel} is your current rank at {rewardsHeader.totalXp} XP. {rankLadderSummary}
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
                      role="listitem"
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
    </>
  );
}
