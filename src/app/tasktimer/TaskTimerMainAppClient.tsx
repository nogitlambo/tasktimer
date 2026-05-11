"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { trackScreen } from "@/lib/firebaseTelemetry";
import AddTaskOverlay from "./components/AddTaskOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import FriendsOverlays from "./components/FriendsOverlays";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import DashboardPageContent from "./components/DashboardPageContent";
import HistoryManagerScreen from "./components/HistoryManagerScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import RankPromotionOverlay from "./components/RankPromotionOverlay";
import RankThumbnail from "./components/RankThumbnail";
import SchedulePageContent from "./components/SchedulePageContent";
import TaskManualEntryOverlay from "./components/TaskManualEntryOverlay";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import type { AppPage } from "./client/types";
import { ACCOUNT_AVATAR_UPDATED_EVENT } from "./lib/accountProfileStorage";
import { formatDashboardDurationShort } from "./lib/historyChart";
import {
  LEADERBOARD_PROFILE_UPDATED_EVENT,
  buildWeeklyLeaderboardRows,
  buildLeaderboardMetricsSnapshot,
  getLeaderboardAvatarSrc,
  getLeaderboardInitials,
  getLeaderboardResolvedRank,
  isWeeklyLeaderboardPlaceholderProfile,
  loadLeaderboardScreenData,
  saveLeaderboardProfile,
  type LeaderboardProfile,
  type LeaderboardScreenData,
} from "./lib/leaderboard";
import {
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  getRankForXp,
  normalizeRewardProgress,
} from "./lib/rewards";
import { createTaskTimerWorkspaceRepository } from "./lib/workspaceRepository";
import { initTaskTimerClient } from "./tasktimerClient";
import { bootstrapFirebaseWebAppCheck } from "@/lib/firebaseClient";
import {
  clearActiveXpAward,
  createXpAwardAnimationState,
  enqueuePendingXpAward,
  getXpAwardCountRange,
  getXpAwardCountStartDelayMs,
  notifyXpAwardOverlayClosed,
  type PendingXpAward,
  XP_AWARD_COUNT_DURATION_MS,
  XP_AWARD_FX_DURATION_MS,
} from "./client/xp-award-animation";
import { TASKTIMER_OVERLAY_CLOSED_EVENT, TASKTIMER_PENDING_XP_AWARD_EVENT } from "./client/xp-award-events";
import { getVisibleXpTargetRectFromDocument } from "./client/xp-award-target";
import {
  getRankPromotion,
  hasBlockingPromotionOverlay,
  startRankPromotionCelebration,
  stopRankPromotionCelebration,
  type RankPromotion,
} from "./client/rank-promotion";
import "./tasktimer.css";

type TaskTimerMainAppClientProps = {
  initialPage: AppPage;
};

function isMobileTaskToolbarViewport() {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    if (window.matchMedia("(max-width: 980px)").matches) return true;
    if (window.matchMedia("(pointer: coarse) and (max-device-width: 1024px)").matches) return true;
  }
  return window.innerWidth <= 980 || window.screen.width <= 980;
}

const workspaceRepository = createTaskTimerWorkspaceRepository();

const EMPTY_LEADERBOARD_SCREEN_DATA: LeaderboardScreenData = {
  topEntries: [],
  risingEntries: [],
  rivalEntries: [],
  weeklyEntries: [],
  currentUserEntry: null,
  currentUserRank: null,
  currentUserGapToNextXp: null,
  currentUserWeeklyEntry: null,
  currentUserWeeklyRank: null,
};

type LeaderboardLoadState = "loading" | "ready" | "signedOut" | "error";
type LeaderboardView = "global" | "weekly";

function formatLeaderboardXp(xpRaw: number): string {
  return `${new Intl.NumberFormat().format(Math.max(0, Math.floor(xpRaw || 0)))} XP`;
}

function formatLeaderboardTrend(xpRaw: number): string {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  return xp > 0 ? `+${new Intl.NumberFormat().format(xp)} XP` : "No gain yet";
}

function formatLeaderboardStreak(daysRaw: number): string {
  const days = Math.max(0, Math.floor(daysRaw || 0));
  return days === 1 ? "1 day streak" : `${days} day streak`;
}

function formatLeaderboardMemberSince(memberSinceMs: number | null | undefined): string {
  if (!memberSinceMs || !Number.isFinite(memberSinceMs) || memberSinceMs <= 0) return "";
  return new Date(memberSinceMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getLeaderboardLabel(profile: LeaderboardProfile): string {
  return String(profile.username || profile.displayLabel || "User").trim() || "User";
}

function getLeaderboardRankLabel(profile: LeaderboardProfile): string {
  return getLeaderboardResolvedRank(profile).label;
}

function LeaderboardRankInsignia({ profile }: { profile: LeaderboardProfile }) {
  const resolvedRank = getLeaderboardResolvedRank(profile);
  return (
    <RankThumbnail
      rankId={resolvedRank.id}
      storedThumbnailSrc=""
      className="leaderboardRankInsignia"
      imageClassName="leaderboardRankInsigniaImg"
      placeholderClassName="leaderboardRankInsigniaPlaceholder"
      alt=""
      size={30}
      aria-hidden
    />
  );
}

function getLeaderboardAvatarRenderSrc(profile: LeaderboardProfile): string {
  const avatarSrc = getLeaderboardAvatarSrc(profile);
  if (!avatarSrc) return "";
  if (/^(?:data:|blob:)/i.test(avatarSrc)) return avatarSrc;
  if (/^\/(?:tasklaunch\/)?avatars\//i.test(avatarSrc)) return avatarSrc;
  const versionSeed = [
    profile.uid,
    String(profile.avatarId || "").trim(),
    String(profile.avatarCustomSrc || "").trim(),
    String(profile.googlePhotoUrl || "").trim(),
  ].join("|");
  const version = encodeURIComponent(versionSeed);
  return avatarSrc.includes("?") ? `${avatarSrc}&lbav=${version}` : `${avatarSrc}?lbav=${version}`;
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function buildXpPayloadStyle(sourceRect: PendingXpAward["sourceRect"], targetRect: DOMRect): CSSProperties | null {
  const sourceX = sourceRect ? sourceRect.left + sourceRect.width / 2 : targetRect.left + targetRect.width / 2;
  const sourceY = sourceRect ? sourceRect.top + sourceRect.height / 2 : targetRect.top + targetRect.height / 2;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  return {
    left: `${sourceX}px`,
    top: `${sourceY}px`,
    ["--xp-award-dx" as keyof CSSProperties]: `${targetX - sourceX}px`,
    ["--xp-award-dy" as keyof CSSProperties]: `${targetY - sourceY}px`,
  };
}

function LeaderboardAvatar({ profile, small = false }: { profile: LeaderboardProfile; small?: boolean }) {
  const avatarSrc = getLeaderboardAvatarRenderSrc(profile);
  const initials = getLeaderboardInitials(getLeaderboardLabel(profile));
  return (
    <div className={`leaderboardAvatar${small ? " leaderboardAvatarSmall" : ""}`} aria-hidden="true">
      {avatarSrc ? (
        <AppImg className="leaderboardAvatarImg" src={avatarSrc} alt="" referrerPolicy={/^https?:\/\//i.test(avatarSrc) ? "no-referrer" : undefined} />
      ) : (
        initials
      )}
    </div>
  );
}

function stopXpIncreaseAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // Ignore audio stop failures.
  }
}

export default function TaskTimerMainAppClient({ initialPage }: TaskTimerMainAppClientProps) {
  const searchParams = useSearchParams();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getFirebaseAuthClient()?.currentUser);
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [rewardProgressHydrated, setRewardProgressHydrated] = useState(false);
  const [displayedXp, setDisplayedXp] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS).totalXp);
  const [xpAwardFx, setXpAwardFx] = useState<{
    visible: boolean;
    payloadStyle: CSSProperties | null;
    deltaText: string | null;
  }>({ visible: false, payloadStyle: null, deltaText: null });
  const [xpAnimationState, setXpAnimationState] = useState(() => createXpAwardAnimationState());
  const [isXpCountAnimating, setIsXpCountAnimating] = useState(false);
  const [isXpAwardSpotlightActive, setIsXpAwardSpotlightActive] = useState(false);
  const [pendingRankPromotion, setPendingRankPromotion] = useState<RankPromotion | null>(null);
  const [activeRankPromotion, setActiveRankPromotion] = useState<RankPromotion | null>(null);
  const [promotionOverlayRetrySeq, setPromotionOverlayRetrySeq] = useState(0);
  const [dismissedHighlightParam, setDismissedHighlightParam] = useState<string | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardLoadState>("error");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardScreenData>(EMPTY_LEADERBOARD_SCREEN_DATA);
  const [leaderboardError, setLeaderboardError] = useState<string | null>("Leaderboard is unavailable in this session.");
  const [selectedLeaderboardProfile, setSelectedLeaderboardProfile] = useState<LeaderboardProfile | null>(null);
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>("global");
  const leaderboardStateRef = useRef<LeaderboardLoadState>("error");
  const displayedXpRef = useRef(displayedXp);
  const previousActiveAwardRef = useRef<PendingXpAward | null>(null);
  const xpAnimationFrameRef = useRef<number | null>(null);
  const xpAnimationStartTimerRef = useRef<number | null>(null);
  const xpAnimationCleanupTimerRef = useRef<number | null>(null);
  const xpCountAnimationStartedRef = useRef(false);
  const xpIncreaseAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastObservedRankIdRef = useRef<string | null>(null);
  const effectiveDisplayedXp = xpAnimationState.pending || xpAnimationState.active ? displayedXp : rewardProgress.totalXp;
  const displayedRewardProgress = useMemo(() => {
    const totalXp = Math.max(0, Math.floor(Number(effectiveDisplayedXp || 0) || 0));
    return {
      ...rewardProgress,
      totalXp,
      totalXpPrecise: totalXp,
      currentRankId: getRankForXp(totalXp).id,
    };
  }, [effectiveDisplayedXp, rewardProgress]);
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(displayedRewardProgress), [displayedRewardProgress]);
  const highlightParam = searchParams.get("highlight");
  const isHighlighting = !!highlightParam && highlightParam !== dismissedHighlightParam;

  useEffect(() => {
    displayedXpRef.current = displayedXp;
  }, [displayedXp]);

  useEffect(() => {
    leaderboardStateRef.current = leaderboardState;
  }, [leaderboardState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 980px), (pointer: coarse) and (max-device-width: 1024px)")
        : null;
    const sync = () => setIsMobileViewport(isMobileTaskToolbarViewport());
    sync();
    window.addEventListener("resize", sync);
    window.screen.orientation?.addEventListener?.("change", sync);
    if (media && typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => {
        window.removeEventListener("resize", sync);
        window.screen.orientation?.removeEventListener?.("change", sync);
        media.removeEventListener("change", sync);
      };
    }
    media?.addListener(sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.screen.orientation?.removeEventListener?.("change", sync);
      media?.removeListener(sync);
    };
  }, []);

  useEffect(() => {
    void bootstrapFirebaseWebAppCheck();
    void trackScreen(initialPage === "history" ? "history_manager" : initialPage);
    const { destroy } = initTaskTimerClient(initialPage);
    return () => {
      destroy();
    };
  }, [initialPage]);

  useEffect(() => {
    const unsubscribe = workspaceRepository.subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
      setRewardProgressHydrated(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!rewardProgressHydrated) return;
    const nextRankId = String(rewardProgress.currentRankId || "").trim();
    const previousRankId = lastObservedRankIdRef.current;
    if (!previousRankId) {
      lastObservedRankIdRef.current = nextRankId;
      return;
    }
    const promotion = getRankPromotion(previousRankId, nextRankId);
    lastObservedRankIdRef.current = nextRankId;
    if (promotion) setPendingRankPromotion(promotion);
  }, [rewardProgress.currentRankId, rewardProgressHydrated]);

  useEffect(() => {
    if (!pendingRankPromotion || activeRankPromotion || typeof document === "undefined") return;
    if (hasBlockingPromotionOverlay(document)) return;
    const openTimer = window.setTimeout(() => {
      setActiveRankPromotion(pendingRankPromotion);
      setPendingRankPromotion(null);
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [activeRankPromotion, pendingRankPromotion, promotionOverlayRetrySeq]);

  useEffect(() => {
    if (!activeRankPromotion || typeof document === "undefined") return;
    startRankPromotionCelebration(document);
    return () => {
      stopRankPromotionCelebration(document);
    };
  }, [activeRankPromotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio("/increase.wav");
    audio.preload = "auto";
    xpIncreaseAudioRef.current = audio;
    return () => {
      const currentAudio = xpIncreaseAudioRef.current;
      xpIncreaseAudioRef.current = null;
      stopXpIncreaseAudio(currentAudio);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePendingAward = (event: Event) => {
      const detail = (event as CustomEvent<PendingXpAward>).detail;
      if (!detail) return;
      setXpAnimationState((current) => enqueuePendingXpAward(current, detail));
    };
    const handleOverlayClosed = (event: Event) => {
      const overlayId = String((event as CustomEvent<{ overlayId?: string }>).detail?.overlayId || "").trim();
      if (!overlayId) return;
      setXpAnimationState((current) => notifyXpAwardOverlayClosed(current, overlayId));
      setPromotionOverlayRetrySeq((current) => current + 1);
    };
    window.addEventListener(TASKTIMER_PENDING_XP_AWARD_EVENT, handlePendingAward as EventListener);
    window.addEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, handleOverlayClosed as EventListener);
    return () => {
      window.removeEventListener(TASKTIMER_PENDING_XP_AWARD_EVENT, handlePendingAward as EventListener);
      window.removeEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, handleOverlayClosed as EventListener);
    };
  }, []);

  useEffect(() => {
    const activeAward = xpAnimationState.active;
    const wasIdle = previousActiveAwardRef.current == null;
    previousActiveAwardRef.current = activeAward;
    if (!activeAward) {
      if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
      if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
      if (xpAnimationCleanupTimerRef.current != null) window.clearTimeout(xpAnimationCleanupTimerRef.current);
      xpCountAnimationStartedRef.current = false;
      stopXpIncreaseAudio(xpIncreaseAudioRef.current);
      return;
    }

    if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
    if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
    if (xpAnimationCleanupTimerRef.current != null) window.clearTimeout(xpAnimationCleanupTimerRef.current);
    stopXpIncreaseAudio(xpIncreaseAudioRef.current);
    const countAnimationStarted = xpCountAnimationStartedRef.current;

    const reducedMotion = prefersReducedMotion();
    let targetRect: DOMRect | null = null;
    let payloadStyle: CSSProperties | null = null;

    try {
      targetRect = typeof document !== "undefined" ? getVisibleXpTargetRectFromDocument(document) : null;
      payloadStyle = targetRect ? buildXpPayloadStyle(!reducedMotion ? activeAward.sourceRect : null, targetRect) : null;
    } catch {
      targetRect = null;
      payloadStyle = null;
    }

    const { startXp, endXp } = getXpAwardCountRange(activeAward, {
      wasIdle,
      displayedXp: displayedXpRef.current,
    });
    displayedXpRef.current = startXp;

    window.requestAnimationFrame(() => {
      setDisplayedXp(startXp);
      setIsXpCountAnimating(false);
      setIsXpAwardSpotlightActive(true);
      setXpAwardFx({
        visible: true,
        payloadStyle,
        deltaText: activeAward.awardedXp > 0 ? `+${activeAward.awardedXp} XP` : null,
      });
    });

    if (startXp === endXp) {
      window.requestAnimationFrame(() => {
        setDisplayedXp(endXp);
        xpAnimationCleanupTimerRef.current = window.setTimeout(() => {
          setIsXpCountAnimating(false);
          setIsXpAwardSpotlightActive(false);
          setXpAwardFx({ visible: false, payloadStyle: null, deltaText: null });
          setXpAnimationState((current) => clearActiveXpAward(current));
        }, reducedMotion ? 160 : 360);
      });
      return;
    }

    const startCountAnimation = () => {
      xpCountAnimationStartedRef.current = true;
      setIsXpCountAnimating(true);
      const audio = xpIncreaseAudioRef.current;
      if (audio) {
        try {
          audio.currentTime = 0;
          const playback = audio.play();
          if (playback && typeof playback.catch === "function") {
            playback.catch(() => {});
          }
        } catch {
          // Ignore playback failures from browser autoplay rules.
        }
      }
      const durationMs = XP_AWARD_COUNT_DURATION_MS;
      const startedAt = performance.now();

      const tick = (nowValue: number) => {
        const progress = Math.max(0, Math.min(1, (nowValue - startedAt) / durationMs));
        const eased = 1 - (1 - progress) * (1 - progress);
        const nextXp = Math.round(startXp + (endXp - startXp) * eased);
        displayedXpRef.current = nextXp;
        setDisplayedXp(nextXp);
        if (progress >= 1) {
          xpCountAnimationStartedRef.current = false;
          stopXpIncreaseAudio(xpIncreaseAudioRef.current);
          displayedXpRef.current = endXp;
          setDisplayedXp(endXp);
          setIsXpCountAnimating(false);
          xpAnimationCleanupTimerRef.current = window.setTimeout(() => {
            setIsXpAwardSpotlightActive(false);
            setXpAwardFx({ visible: false, payloadStyle: null, deltaText: null });
            setXpAnimationState((current) => clearActiveXpAward(current));
          }, reducedMotion ? 180 : 420);
          return;
        }
        xpAnimationFrameRef.current = window.requestAnimationFrame(tick);
      };

      xpAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    const countStartDelayMs = getXpAwardCountStartDelayMs({
      wasIdle,
      countAnimationStarted,
      fxDurationMs: XP_AWARD_FX_DURATION_MS,
    });
    xpAnimationStartTimerRef.current = window.setTimeout(() => {
      xpAnimationStartTimerRef.current = null;
      startCountAnimation();
    }, countStartDelayMs);

    return () => {
      if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
      if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
      xpCountAnimationStartedRef.current = countAnimationStarted;
      stopXpIncreaseAudio(xpIncreaseAudioRef.current);
    };
  }, [xpAnimationState.active]);

  useEffect(() => {
    if (!isXpAwardSpotlightActive || typeof window === "undefined") return;

    const clearSpotlight = () => {
      setIsXpAwardSpotlightActive(false);
    };

    window.addEventListener("pointerdown", clearSpotlight, true);
    window.addEventListener("keydown", clearSpotlight, true);
    window.addEventListener("touchstart", clearSpotlight, true);

    return () => {
      window.removeEventListener("pointerdown", clearSpotlight, true);
      window.removeEventListener("keydown", clearSpotlight, true);
      window.removeEventListener("touchstart", clearSpotlight, true);
    };
  }, [isXpAwardSpotlightActive]);

  useEffect(() => {
    if (isHighlighting && highlightParam === "addTask") {
      const appElement = document.getElementById("app");
      if (appElement) {
        appElement.classList.add("hasHighlight");
      }

      const addTaskBtn = document.getElementById("openAddTaskBtn");
      if (addTaskBtn) {
        addTaskBtn.classList.add("highlighted");
      }

      const handleClickOutside = () => {
        setDismissedHighlightParam(highlightParam);
      };

      addTaskBtn?.addEventListener("click", handleClickOutside);

      return () => {
        addTaskBtn?.removeEventListener("click", handleClickOutside);
        appElement?.classList.remove("hasHighlight");
        addTaskBtn?.classList.remove("highlighted");
      };
    }
  }, [isHighlighting, highlightParam]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;

    let cancelled = false;
    let activeUid = String(auth.currentUser?.uid || "").trim();
    let refreshTimer: number | null = null;

    const loadForUid = async (uid: string, options?: { preserveReadyState?: boolean }) => {
      const preserveReadyState = options?.preserveReadyState === true;
      if (!preserveReadyState || leaderboardStateRef.current !== "ready") {
        setLeaderboardState("loading");
      }
      setLeaderboardError(null);
      try {
        const cachedPreferences = workspaceRepository.loadCachedPreferences();
        await saveLeaderboardProfile(
          uid,
          buildLeaderboardMetricsSnapshot({
            historyByTaskId: workspaceRepository.loadHistory(),
            liveSessionsByTaskId: workspaceRepository.loadLiveSessions(),
            rewards: cachedPreferences?.rewards || DEFAULT_REWARD_PROGRESS,
          }),
          { dispatchUpdatedEvent: false }
        ).catch(() => {});
        const nextData = await loadLeaderboardScreenData(uid);
        if (cancelled || activeUid !== uid) return;
        setLeaderboardData(nextData);
        setLeaderboardState("ready");
      } catch {
        if (cancelled || activeUid !== uid) return;
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardState("error");
        setLeaderboardError("Could not load leaderboard data.");
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => {
        if (!activeUid || document.visibilityState !== "visible") return;
        void loadForUid(activeUid, { preserveReadyState: true });
      }, 60_000);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      activeUid = String(user?.uid || "").trim();
      setIsAuthenticated(!!user);
      if (!activeUid) {
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardState("signedOut");
        setLeaderboardError(null);
        return;
      }
      scheduleRefresh();
      void loadForUid(activeUid);
    });

    const handleProfileUpdated = (event: Event) => {
      if (!activeUid) return;
      if (event.type === "visibilitychange" && document.visibilityState !== "visible") return;
      const detailUid = String((event as CustomEvent<{ uid?: string }>).detail?.uid || "").trim();
      if (detailUid && detailUid !== activeUid) return;
      void loadForUid(activeUid, { preserveReadyState: true });
    };

    if (typeof window !== "undefined") {
      window.addEventListener(LEADERBOARD_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
      window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, handleProfileUpdated as EventListener);
      window.addEventListener("focus", handleProfileUpdated as EventListener);
      document.addEventListener("visibilitychange", handleProfileUpdated as EventListener);
    }

    if (activeUid) {
      scheduleRefresh();
      void loadForUid(activeUid);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (refreshTimer != null) window.clearInterval(refreshTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener(LEADERBOARD_PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
        window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, handleProfileUpdated as EventListener);
        window.removeEventListener("focus", handleProfileUpdated as EventListener);
        document.removeEventListener("visibilitychange", handleProfileUpdated as EventListener);
      }
    };
  }, []);

  const weeklyRows = useMemo(
    () =>
      buildWeeklyLeaderboardRows({
        weeklyEntries: leaderboardData.weeklyEntries,
        currentUserEntry: leaderboardData.currentUserWeeklyEntry,
        currentUserWeeklyRank: leaderboardData.currentUserWeeklyRank,
      }),
    [leaderboardData.currentUserWeeklyEntry, leaderboardData.currentUserWeeklyRank, leaderboardData.weeklyEntries]
  );
  const weeklyPodiumRows = weeklyRows.filter((row) => row.rank && row.rank <= 3).slice(0, 3);
  const weeklyTableRows = weeklyRows.filter((row) => !!row.rank && row.rank >= 4 && row.rank <= 10);
  const selectedWeeklyRow = selectedLeaderboardProfile ? weeklyRows.find((row) => row.profile.uid === selectedLeaderboardProfile.uid) : null;
  const selectedLeaderboardLabel = selectedLeaderboardProfile ? getLeaderboardLabel(selectedLeaderboardProfile) : "";
  const selectedLeaderboardRank =
    selectedLeaderboardProfile && leaderboardData.currentUserEntry?.uid === selectedLeaderboardProfile.uid
      ? leaderboardData.currentUserRank
      : selectedLeaderboardProfile
        ? leaderboardData.topEntries.findIndex((entry) => entry.uid === selectedLeaderboardProfile.uid) + 1
        : null;
  const selectedLeaderboardRankLabel =
    leaderboardView === "weekly" && selectedWeeklyRow
      ? selectedWeeklyRow.rankLabel
      : selectedLeaderboardRank && selectedLeaderboardRank > 0
        ? `#${selectedLeaderboardRank}`
        : "--";
  const selectedLeaderboardMemberSince = selectedLeaderboardProfile
    ? formatLeaderboardMemberSince(selectedLeaderboardProfile.memberSinceMs)
    : "";
  const currentUserAvatarSrc = leaderboardData.currentUserEntry ? getLeaderboardAvatarRenderSrc(leaderboardData.currentUserEntry) : "";
  const currentUserAvatarInitials = leaderboardData.currentUserEntry ? getLeaderboardInitials(getLeaderboardLabel(leaderboardData.currentUserEntry)) : "U";
  const currentUserLabel = leaderboardData.currentUserEntry ? getLeaderboardLabel(leaderboardData.currentUserEntry) : "User";

  const closeLeaderboardPositionModal = () => {
    setSelectedLeaderboardProfile(null);
  };

  const openWeeklyLeaderboardProfile = (profile: LeaderboardProfile) => {
    if (isWeeklyLeaderboardPlaceholderProfile(profile)) return;
    setSelectedLeaderboardProfile(profile);
  };

  const mobileToolbar: ReactNode = useMemo(() => {
    if (!isMobileViewport) return null;
    return (
      <div className="taskLaunchMobileToolbarInner taskLaunchMobileToolbarTasks" aria-label="Tasks controls">
        <div className="taskPageHeaderActions">
          <div className="taskScreenPillGroup" role="tablist" aria-label="Tasks and schedule view switch">
            <button className="iconBtn taskScreenPill taskScreenHeaderBtn isOn" id="closeScheduleBtn" data-screen-pill="tasks" aria-current="page" aria-label="Tasks" title="Tasks" role="tab" type="button">
              <AppImg className="taskScreenIconBtnImage" src="/Task_List.svg" alt="" aria-hidden="true" />
              <span className="taskScreenTabLabel">Tasks</span>
            </button>
            <button className="iconBtn taskScreenPill taskScreenHeaderBtn" id="openScheduleBtn" data-screen-pill="schedule" aria-label="Schedule" title="Schedule" role="tab" type="button">
              <svg className="taskScreenIconBtnSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                <path d="M3.5 9.5h17" />
                <path d="M8 3.75v3.5" />
                <path d="M16 3.75v3.5" />
                <path d="M8 13h3" />
                <path d="M13 13h3" />
                <path d="M8 17h3" />
              </svg>
              <span className="taskScreenTabLabel">Schedule</span>
            </button>
          </div>
          <button className="iconBtn taskScreenPill taskScreenHeaderBtn" id="openAddTaskBtn" aria-label="Add Task" title="Add Task" type="button">
            <span className="openAddTaskBtnContent">
              <AppImg className="taskScreenIconBtnImage taskScreenAddTaskBtnImage" src="/icons/icons_default/add-task.png" alt="" aria-hidden="true" />
              <span className="taskScreenHeaderBtnText">Add Task</span>
            </span>
          </button>
          <div className="tasksModeControlGroup" aria-label="Task ordering controls">
            <details className="tasksModeMenu" id="taskOrderByMenu">
              <summary className="btn btn-ghost small tasksModeMenuBtn" id="taskOrderByMenuBtn" title="Order tasks">
                <span id="taskOrderByValue" className="sr-only">Custom</span>
                <svg className="tasksModeMenuBtnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 6.5h16" />
                  <path d="M7.5 12h9" />
                  <path d="M10.5 17.5h3" />
                </svg>
              </summary>
              <div className="tasksModeMenuList" role="menu" aria-label="Order tasks by">
                <div className="tasksModeMenuLabel" role="presentation">Sort by</div>
                <button className="tasksModeMenuItem" type="button" data-task-order-by="alpha" role="menuitem">A-Z</button>
                <button className="tasksModeMenuItem" type="button" data-task-order-by="schedule" role="menuitem">Schedule/Time</button>
                <button className="tasksModeMenuItem isOn" type="button" data-task-order-by="custom" role="menuitem">Custom</button>
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }, [isMobileViewport]);

  return (
    <>
      <TaskTimerAppFrame
        activePage={initialPage}
        mobileToolbar={mobileToolbar}
        currentRankId={displayedRewardProgress.currentRankId}
        currentUserAvatarSrc={currentUserAvatarSrc}
        currentUserAvatarInitials={currentUserAvatarInitials}
        currentUserLabel={currentUserLabel}
        rewardsHeader={rewardsHeader}
        isXpCountAnimating={isXpCountAnimating}
        isXpAwardSpotlightActive={isXpAwardSpotlightActive}
        xpAwardFx={xpAwardFx}
      >
        <div className="appPages">
          <section className={`appPage appPageTasks${initialPage === "tasks" || initialPage === "schedule" ? " appPageOn" : ""}`} id="appPageTasks" aria-label="Tasks page">
            {!isMobileViewport ? (
            <div className="dashboardTopRow">
              <div className="taskPageHeaderActions">
                <div className="taskScreenPillGroup" role="tablist" aria-label="Tasks and schedule view switch">
                  <button
                    className="iconBtn taskScreenPill taskScreenHeaderBtn isOn"
                    id="closeScheduleBtn"
                    data-screen-pill="tasks"
                    aria-current="page"
                    aria-label="Tasks"
                    title="Tasks"
                    role="tab"
                    type="button"
                  >
                    <AppImg className="taskScreenIconBtnImage" src="/Task_List.svg" alt="" aria-hidden="true" />
                    <span className="taskScreenTabLabel">Tasks</span>
                  </button>
                  <button
                    className="iconBtn taskScreenPill taskScreenHeaderBtn"
                    id="openScheduleBtn"
                    data-screen-pill="schedule"
                    aria-label="Schedule"
                    title="Schedule"
                    role="tab"
                    type="button"
                  >
                    <svg className="taskScreenIconBtnSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
                      <path d="M3.5 9.5h17" />
                      <path d="M8 3.75v3.5" />
                      <path d="M16 3.75v3.5" />
                      <path d="M8 13h3" />
                      <path d="M13 13h3" />
                      <path d="M8 17h3" />
                    </svg>
                    <span className="taskScreenTabLabel">Schedule</span>
                  </button>
                </div>
                <button
                  className="iconBtn taskScreenPill taskScreenHeaderBtn"
                  id="openAddTaskBtn"
                  aria-label="Add Task"
                  title="Add Task"
                  type="button"
                >
                  <span className="openAddTaskBtnContent">
                    <AppImg className="taskScreenIconBtnImage taskScreenAddTaskBtnImage" src="/icons/icons_default/add-task.png" alt="" aria-hidden="true" />
                    <span className="taskScreenHeaderBtnText">Add Task</span>
                  </span>
                </button>
                <div className="tasksModeControlGroup" aria-label="Task ordering controls">
                  <details className="tasksModeMenu" id="taskOrderByMenu">
                    <summary className="btn btn-ghost small tasksModeMenuBtn" id="taskOrderByMenuBtn" title="Order tasks">
                      <span id="taskOrderByValue" className="sr-only">Custom</span>
                      <svg className="tasksModeMenuBtnIcon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 6.5h16" />
                        <path d="M7.5 12h9" />
                        <path d="M10.5 17.5h3" />
                      </svg>
                    </summary>
                    <div className="tasksModeMenuList" role="menu" aria-label="Order tasks by">
                      <div className="tasksModeMenuLabel" role="presentation">Sort by</div>
                      <button className="tasksModeMenuItem" type="button" data-task-order-by="alpha" role="menuitem">
                        A-Z
                      </button>
                      <button className="tasksModeMenuItem" type="button" data-task-order-by="schedule" role="menuitem">
                        Schedule/Time
                      </button>
                      <button className="tasksModeMenuItem isOn" type="button" data-task-order-by="custom" role="menuitem">
                        Custom
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
            ) : null}
            <section className="modeView modeViewOn" id="mode1View" aria-label="Tasks view">
              <div className="list" id="taskList" />
              <HistoryScreen />
              <FocusModeScreen />
              <SchedulePageContent active={initialPage === "schedule"} />
            </section>
          </section>

          <DashboardPageContent active={initialPage === "dashboard"} />

          <section className={`appPage${initialPage === "friends" ? " appPageOn" : ""}`} id="appPageFriends" aria-label="Friends page">
            {isAuthenticated ? (
              <div className="dashboardShell" id="groupsFriendsSection">
                <div className="dashboardTopRow">
                  <div className="dashboardEditActions">
                    <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button">
                      <AppImg
                        className="friendRequestBtnIcon"
                        src="/icons/icons_default/add-friend.png"
                        alt=""
                        aria-hidden="true"
                      />
                      Add Friend
                    </button>
                  </div>
                </div>

                <div className="dashboardGrid">
                  <div id="groupsFriendRequestStatus" className="settingsDetailNote" style={{ display: "none" }} />

                  <section className="dashboardCard" aria-label="Friends list">
                    <div id="groupsFriendsList" className="settingsDetailNote groupsFriendsEmptyState">
                      You have not added any friends yet
                    </div>
                  </section>

                  <section className="dashboardCard" aria-label="Tasks shared by you">
                    <details id="groupsSharedByYouDetails">
                      <summary className="dashboardCardTitle" id="groupsSharedByYouTitle">
                        0 shared by you
                      </summary>
                      <div id="groupsSharedByYouList" className="settingsDetailNote">
                        No shared tasks.
                      </div>
                    </details>
                  </section>

                  <section className="dashboardCard" aria-label="Incoming requests">
                    <details id="groupsIncomingRequestsDetails">
                      <summary className="dashboardCardTitle" id="groupsIncomingRequestsTitle">
                        0 Incoming Requests
                      </summary>
                      <div id="groupsIncomingRequestsList" className="settingsDetailNote">
                        No incoming requests.
                      </div>
                    </details>
                  </section>

                  <section className="dashboardCard" aria-label="Outgoing requests">
                    <details id="groupsOutgoingRequestsDetails">
                      <summary className="dashboardCardTitle" id="groupsOutgoingRequestsTitle">
                        0 Outgoing Requests
                      </summary>
                      <div id="groupsOutgoingRequestsList" className="settingsDetailNote">
                        No outgoing requests.
                      </div>
                    </details>
                  </section>
                </div>
              </div>
            ) : (
              <div className="dashboardShell" id="groupsFriendsSection">
                <div className="settingsDetailNote">You will need to create an account or sign in to use Friends.</div>
              </div>
            )}
          </section>

          <section className={`appPage${initialPage === "leaderboard" ? " appPageOn" : ""}`} id="appPageLeaderboard" aria-label="Leaderboard page">
            <div className="dashboardShell leaderboardShell">
              <div className="leaderboardViewHeader">
                <div className="leaderboardViewToggle" role="tablist" aria-label="Leaderboard view">
                  <button
                    className={`btn btn-ghost small leaderboardViewToggleBtn${leaderboardView === "global" ? " isOn" : ""}`}
                    id="leaderboardGlobalTab"
                    type="button"
                    role="tab"
                    aria-controls="leaderboardGlobalPanel"
                    aria-selected={leaderboardView === "global"}
                    onClick={() => setLeaderboardView("global")}
                  >
                    Global
                  </button>
                  <button
                    className={`btn btn-ghost small leaderboardViewToggleBtn${leaderboardView === "weekly" ? " isOn" : ""}`}
                    id="leaderboardWeeklyTab"
                    type="button"
                    role="tab"
                    aria-controls="leaderboardWeeklyPanel"
                    aria-selected={leaderboardView === "weekly"}
                    onClick={() => setLeaderboardView("weekly")}
                  >
                    Weekly
                  </button>
                </div>
              </div>

              {leaderboardView === "weekly" ? (
                <section
                  className="dashboardCard leaderboardCard leaderboardWeeklyBoard"
                  id="leaderboardWeeklyPanel"
                  role="tabpanel"
                  aria-labelledby="leaderboardWeeklyTab"
                  aria-label="Weekly leaderboard rankings"
                >
                  <div className="leaderboardWeeklyIntro">
                    <p className="dashboardCardEyebrow">Weekly ladder</p>
                    <p className="leaderboardHeroMeta">Top XP earners this week</p>
                  </div>
                  {leaderboardState === "ready" ? (
                    <>
                      <div className="leaderboardWeeklyPodium" aria-label="Weekly top three">
                        {weeklyPodiumRows.map((row) => (
                          <button
                            className={`leaderboardWeeklyPodiumPlace leaderboardWeeklyPodiumPlace${row.rank}${row.isCurrentUser ? " isCurrentUser" : ""}`}
                            type="button"
                            key={row.profile.uid}
                            disabled={row.isPlaceholder}
                            aria-disabled={row.isPlaceholder}
                            onClick={() => openWeeklyLeaderboardProfile(row.profile)}
                          >
                            <span className="leaderboardWeeklyPodiumAvatar">
                              <LeaderboardAvatar profile={row.profile} />
                              <LeaderboardRankInsignia profile={row.profile} />
                            </span>
                            <span className="leaderboardWeeklyPodiumIdentity">
                              <span className="leaderboardWeeklyPodiumRank">{row.rankLabel}</span>
                              <strong className="leaderboardWeeklyPodiumName">{row.playerLabel}</strong>
                            </span>
                            <span className="leaderboardWeeklyPodiumMetric">{formatLeaderboardTrend(row.profile.weeklyXpGain)}</span>
                            <span className="leaderboardWeeklyPodiumInsignia" aria-hidden="true">
                              <LeaderboardRankInsignia profile={row.profile} />
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="leaderboardWeeklyTableWrap">
                        <div className="leaderboardWeeklyTable" role="table" aria-label="Weekly leaderboard table">
                          <div className="leaderboardWeeklyTableRow leaderboardWeeklyTableHead" role="row">
                            <span role="columnheader">Rank</span>
                            <span role="columnheader">User</span>
                            <span role="columnheader">Weekly XP</span>
                            <span role="columnheader">Time</span>
                            <span role="columnheader">Streak</span>
                          </div>
                          {weeklyTableRows.map((row) => (
                            <button
                              className={`leaderboardWeeklyTableRow${row.isCurrentUser ? " isCurrentUser" : ""}`}
                              role="row"
                              type="button"
                              key={`${row.isCurrentUser ? "current" : "ranked"}-${row.profile.uid}`}
                              disabled={row.isPlaceholder}
                              aria-disabled={row.isPlaceholder}
                              onClick={() => openWeeklyLeaderboardProfile(row.profile)}
                            >
                              <span className="leaderboardWeeklyRankCell" role="cell">{row.rankLabel}</span>
                              <span className="leaderboardWeeklyPlayerCell" role="cell">
                                <LeaderboardAvatar profile={row.profile} small />
                                <span className="leaderboardWeeklyPlayerText">
                                  <strong>{row.playerLabel}</strong>
                                  <span>{getLeaderboardRankLabel(row.profile)}</span>
                                </span>
                              </span>
                              <span className="leaderboardWeeklyMetricCell" role="cell">{formatLeaderboardTrend(row.profile.weeklyXpGain)}</span>
                              <span className="leaderboardWeeklyTimeCell" role="cell">{formatDashboardDurationShort(row.profile.totalFocusMs)}</span>
                              <span className="leaderboardWeeklyStreakCell" role="cell">{formatLeaderboardStreak(row.profile.streakDays)}</span>
                              <span className="leaderboardWeeklyInsigniaCell" role="cell" aria-hidden="true">
                                <LeaderboardRankInsignia profile={row.profile} />
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="leaderboardPanelText">
                      {leaderboardState === "loading"
                        ? "Loading weekly leaderboard."
                        : leaderboardState === "signedOut"
                          ? "Sign in to view the weekly leaderboard."
                          : leaderboardState === "error"
                            ? leaderboardError || "Could not load the leaderboard."
                            : "No weekly XP has been published yet. Launch a task to climb this board."}
                    </div>
                  )}
                </section>
              ) : (
                <div
                  className="dashboardGrid leaderboardGrid"
                  id="leaderboardGlobalPanel"
                  role="tabpanel"
                  aria-labelledby="leaderboardGlobalTab"
                >
                  <section className="dashboardCard leaderboardCard leaderboardHeroCard" aria-label="Top leaderboard rankings">
                    <div className="leaderboardHeroHead">
                      <div className="leaderboardHeroTitle">
                        <p className="dashboardCardEyebrow leaderboardGlobalLadderEyebrow">Global ladder</p>
                        <h3 className="dashboardCardTitle">Top focus performers</h3>
                      </div>
                    </div>
                    <div className="leaderboardRows">
                      {leaderboardData.topEntries.length ? (
                        leaderboardData.topEntries.map((entry, index) => (
                          <article
                            className="leaderboardRow"
                            key={entry.uid}
                            role="button"
                            tabIndex={0}
                            aria-label={`View ${getLeaderboardLabel(entry)} leaderboard position`}
                            onClick={() => setSelectedLeaderboardProfile(entry)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              setSelectedLeaderboardProfile(entry);
                            }}
                          >
                            <div className={`leaderboardRank${index === 0 ? " leaderboardRankRibbon" : ""}`}>
                              {index === 0 ? <AppImg className="leaderboardRankRibbonImg" src="/icons/achievement/ribbon1.png" alt="" /> : index + 1}
                            </div>
                            <span className="leaderboardAvatarButton">
                              <LeaderboardAvatar profile={entry} />
                            </span>
                            <div className="leaderboardIdentity">
                              <span className="leaderboardNameButton">
                                <strong className="leaderboardName">{getLeaderboardLabel(entry)}</strong>
                              </span>
                              <span className="leaderboardMeta">
                                {formatDashboardDurationShort(entry.totalFocusMs)} focused - {formatLeaderboardStreak(entry.streakDays)}
                              </span>
                            </div>
                            <div className="leaderboardStats">
                              <span className="leaderboardStatPrimary">
                                <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                                <span className="leaderboardXp">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                              </span>
                            </div>
                            <LeaderboardRankInsignia profile={entry} />
                          </article>
                        ))
                      ) : (
                        <div className="leaderboardPanelText">
                          {leaderboardState === "loading"
                            ? "Loading leaderboard standings."
                            : leaderboardState === "signedOut"
                              ? "Sign in to view the global leaderboard."
                              : leaderboardState === "error"
                                ? leaderboardError || "Could not load the leaderboard."
                                : "No leaderboard data yet. Launch a task to publish the first public snapshot."}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="dashboardCard leaderboardCard" aria-label="Rising this week">
                    <p className="dashboardCardEyebrow">Rising this week</p>
                    <h3 className="dashboardCardTitle">Fastest climbers</h3>
                    <div className="leaderboardSideList">
                      {leaderboardData.risingEntries.length ? (
                        leaderboardData.risingEntries.map((entry) => (
                          <article className="leaderboardSideItem" key={entry.uid}>
                            <LeaderboardAvatar profile={entry} small />
                            <div className="leaderboardSideText">
                              <strong>{getLeaderboardLabel(entry)}</strong>
                              <span>{formatLeaderboardStreak(entry.streakDays)}</span>
                            </div>
                            <span className="leaderboardSideMetricWrap">
                              <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                              <span className="leaderboardSideMetric">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                            </span>
                            <LeaderboardRankInsignia profile={entry} />
                          </article>
                        ))
                      ) : (
                        <div className="leaderboardPanelText">
                          {leaderboardState === "loading"
                            ? "Loading this week's movers."
                            : "Too few public profiles to show rising users yet."}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="dashboardCard leaderboardCard" aria-label="Closest rivals">
                    <p className="dashboardCardEyebrow">Closest rivals</p>
                    <h3 className="dashboardCardTitle">Nearby on the ladder</h3>
                    <div className="leaderboardSideList">
                      {leaderboardData.rivalEntries.length && leaderboardData.currentUserEntry ? (
                        leaderboardData.rivalEntries.map((entry) => {
                          const gap = Math.abs(entry.rewardTotalXp - leaderboardData.currentUserEntry!.rewardTotalXp);
                          const gapLabel =
                            entry.rewardTotalXp >= leaderboardData.currentUserEntry!.rewardTotalXp
                              ? `${new Intl.NumberFormat().format(gap)} XP ahead`
                              : `${new Intl.NumberFormat().format(gap)} XP behind`;
                          return (
                            <article className="leaderboardSideItem" key={entry.uid}>
                              <LeaderboardAvatar profile={entry} small />
                              <div className="leaderboardSideText">
                                <strong>{getLeaderboardLabel(entry)}</strong>
                                <span>{gapLabel}</span>
                              </div>
                              <span className="leaderboardSideMetricWrap">
                                <span className="leaderboardRankLabel">{getLeaderboardRankLabel(entry)}</span>
                                <span className="leaderboardSideMetric">{formatLeaderboardXp(entry.rewardTotalXp)}</span>
                              </span>
                              <LeaderboardRankInsignia profile={entry} />
                            </article>
                          );
                        })
                      ) : (
                        <div className="leaderboardPanelText">
                          {leaderboardState === "loading"
                            ? "Loading nearby rivals."
                            : leaderboardData.currentUserEntry
                              ? "Too few ranked users to calculate nearby rivals yet."
                              : "Your public profile needs to sync before rivals can be calculated."}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </section>

          {selectedLeaderboardProfile ? (
            <div className="overlay" id="leaderboardPositionOverlay" onClick={closeLeaderboardPositionModal}>
              <div className="modal leaderboardPositionModal" role="dialog" aria-modal="true" aria-label="Leaderboard position" onClick={(event) => event.stopPropagation()}>
                <div className="leaderboardPositionModalHeader">
                  <p className="modalSubtext leaderboardUserSummaryTitle">User Summary</p>
                  <LeaderboardRankInsignia profile={selectedLeaderboardProfile} />
                </div>
                <div className="leaderboardPositionModalIdentity">
                  <LeaderboardAvatar profile={selectedLeaderboardProfile} />
                  <div className="leaderboardPositionModalIdentityText">
                    <strong className="leaderboardName">{selectedLeaderboardLabel}</strong>
                    {selectedLeaderboardMemberSince ? (
                      <span className="leaderboardMemberSince">Member since {selectedLeaderboardMemberSince}</span>
                    ) : null}
                  </div>
                </div>
                <div className="leaderboardMiniRow leaderboardPositionInfo">
                  <span className="leaderboardMiniLabel">Leaderboard position</span>
                  <strong>{selectedLeaderboardRankLabel}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Rank</span>
                  <strong>{getLeaderboardRankLabel(selectedLeaderboardProfile)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">XP</span>
                  <strong>{formatLeaderboardXp(selectedLeaderboardProfile.rewardTotalXp)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Time logged</span>
                  <strong>{formatDashboardDurationShort(selectedLeaderboardProfile.totalFocusMs)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Current streak</span>
                  <strong>{formatLeaderboardStreak(selectedLeaderboardProfile.streakDays)}</strong>
                </div>
                <div className="leaderboardMiniRow">
                  <span className="leaderboardMiniLabel">Weekly XP</span>
                  <strong>{formatLeaderboardTrend(selectedLeaderboardProfile.weeklyXpGain)}</strong>
                </div>
                <div className="confirmBtns">
                  <button className="btn btn-ghost" type="button" onClick={closeLeaderboardPositionModal}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <section className={`appPage${initialPage === "history" ? " appPageOn" : ""}`} id="appPageHistory" aria-label="History Manager page">
            <HistoryManagerScreen />
          </section>
        </div>

        <EditTaskOverlay />
      </TaskTimerAppFrame>

      <AddTaskOverlay />
      <TaskManualEntryOverlay />
      <InfoOverlays />
      <ElapsedPadOverlay />
      <ExportTaskOverlay />
      <GlobalTaskAlerts />
      <HistoryAnalysisOverlay />
      <HistoryEntryNoteOverlay />
      <FriendsOverlays />
      {activeRankPromotion ? (
        <RankPromotionOverlay
          rankLabel={activeRankPromotion.rankLabel}
          onClose={() => {
            stopRankPromotionCelebration(document);
            setActiveRankPromotion(null);
            setPromotionOverlayRetrySeq((current) => current + 1);
          }}
        />
      ) : null}
    </>
  );
}
