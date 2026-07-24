"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { trackScreen } from "@/lib/firebaseTelemetry";
import AddTaskOverlay from "./components/AddTaskOverlay";
import EditTaskOverlay from "./components/EditTaskOverlay";
import ElapsedPadOverlay from "./components/ElapsedPadOverlay";
import ExportTaskOverlay from "./components/ExportTaskOverlay";
import FocusModeScreen from "./components/FocusModeScreen";
import FriendsOverlays from "./components/FriendsOverlays";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import DashboardPageContent from "./components/DashboardPageContent";
import SessionNotesPageContent from "./components/SessionNotesPageContent";
import HistoryManagerScreen from "./components/HistoryManagerScreen";
import HistoryScreen from "./components/HistoryScreen";
import HistoryAnalysisOverlay from "./components/HistoryAnalysisOverlay";
import HistoryEntryNoteOverlay from "./components/HistoryEntryNoteOverlay";
import InfoOverlays from "./components/InfoOverlays";
import RankPromotionOverlay from "./components/RankPromotionOverlay";
import RankThumbnail from "./components/RankThumbnail";
import SchedulePageContent from "./components/SchedulePageContent";
import TaskManualEntryOverlay from "./components/TaskManualEntryOverlay";
import TaskLaunchOnboarding from "./components/TaskLaunchOnboarding";
import TaskTimerAppFrame, { type DesktopInsigniaUpgradePayload } from "./components/TaskTimerAppFrame";
import {
  canStartLeaderboardSwipePointer,
  getMobileLeaderboardSwipeDirection,
  getNextLeaderboardSwipeView,
  getResetMobileLeaderboardSwipeState,
  getStartMobileLeaderboardSwipeState,
  getUpdatedMobileLeaderboardSwipeState,
  isMobileLeaderboardSwipeViewport,
  type MobileLeaderboardSwipeState,
} from "./components/mobileLeaderboardSwipe";
import type { AppPage } from "./client/types";
import { AVATAR_CATALOG, normalizeBundledAvatarWebpSrc } from "./lib/avatarCatalog";
import {
  ACCOUNT_AVATAR_UPDATED_EVENT,
  ACCOUNT_PROFILE_UPDATED_EVENT,
  findStoredCustomAvatarUploadSrc,
  googleAvatarIdForUid,
  isCustomAvatarIdForUid,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
} from "./lib/accountProfileStorage";
import { formatDashboardDurationShort } from "./lib/historyChart";
import {
  LEADERBOARD_PROFILE_UPDATED_EVENT,
  LEADERBOARD_POSITION_CHANGED_EVENT,
  TASKTIMER_OPEN_FRIEND_PROFILE_EVENT,
  buildRankRivalLadderViewModel,
  buildGlobalLeaderboardRows,
  buildWeeklyLeaderboardRows,
  buildLeaderboardMetricsSnapshot,
  formatWeeklyLeaderboardTimeRemaining,
  getLeaderboardAvatarSrc,
  getLeaderboardInitials,
  getLeaderboardResolvedRank,
  loadLeaderboardScreenData,
  saveLeaderboardProfile,
  type OpenFriendProfileFromLeaderboardEventDetail,
  type LeaderboardPositionChangedEventDetail,
  type LeaderboardPositionChangeSnapshot,
  type LeaderboardProfile,
  type LeaderboardScreenData,
  type RankRivalLadderViewModel,
  type RankRivalLadderRow,
  type WeeklyLeaderboardRow,
} from "./lib/leaderboard";
import { loadFriendships } from "./lib/friendsStore";
import {
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  getRankForXp,
  normalizeRewardProgress,
} from "./lib/rewards";
import {
  createTaskTimerWorkspacePreferencesPersistence,
  createTaskTimerWorkspaceRepository,
} from "./lib/workspaceRepository";
import type { UserPreferencesV1 } from "./lib/cloudStore";
import { initTaskTimerClient } from "./tasktimerClient";
import { bootstrapFirebaseWebAppCheck } from "@/lib/firebaseClient";
import {
  clearActiveXpAward,
  createXpAwardAnimationState,
  enqueuePendingXpAwardFromOverlayState,
  getDisplayedXpAfterParticleArrival,
  getTaskButtonXpAwardCountdownDurationMs,
  getXpAwardCountRange,
  getXpAwardCountStartedAfterEffectCleanup,
  getXpAwardCountStartDelayMs,
  notifyXpAwardOverlayClosed,
  type PendingXpAward,
  XP_AWARD_COUNT_DURATION_MS,
  XP_AWARD_FX_DURATION_MS,
  XP_AWARD_UNIT_FX_DURATION_MS,
} from "./client/xp-award-animation";
import {
  playXpAwardDeliveryHaptic,
  shouldPlayRateLimitedXpAwardDeliveryHaptic,
  shouldPlayXpAwardDeliveryHaptic,
} from "./client/xp-award-feedback";
import { createClickAudioPlayer } from "./client/click-audio-player";
import { normalizeInteractionHapticsIntensity, type InteractionHapticsIntensity } from "./lib/interactionHapticsIntensity";
import {
  TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT,
  TASKTIMER_OVERLAY_CLOSED_EVENT,
  TASKTIMER_PENDING_XP_AWARD_EVENT,
  TASKTIMER_TIME_GOAL_COMPLETE_XP_CLAIM_DELIVERED_EVENT,
  type TimeGoalCompleteXpClaimRequest,
} from "./client/xp-award-events";
import { getVisibleXpTargetRectFromDocument } from "./client/xp-award-target";
import {
  buildRankPromotionTestPayload,
  TASKTIMER_RANK_PROMOTION_EVENT,
  hasBlockingPromotionXpAnimation,
  hasBlockingPromotionOverlay,
  startRankPromotionCelebration,
  stopRankPromotionCelebration,
  type RankPromotion,
} from "./client/rank-promotion";
import "./tasktimer.css";

type TaskTimerMainAppClientProps = {
  initialPage: AppPage;
};

type XpAwardFxPayload = {
  id: string;
  text?: string;
  style: CSSProperties | null;
  className?: string;
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
const preferencesPersistence = createTaskTimerWorkspacePreferencesPersistence(workspaceRepository);

const EMPTY_LEADERBOARD_SCREEN_DATA: LeaderboardScreenData = {
  topEntries: [],
  risingEntries: [],
  rivalEntries: [],
  weeklyEntries: [],
  currentUserEntry: null,
  currentUserRank: null,
  currentUserGapToNextXp: null,
  currentUserRivalRank: null,
  currentUserWeeklyEntry: null,
  currentUserWeeklyRank: null,
};

const LEADERBOARD_LOADING_TEXT = "Loading leaderboard standings";
const LEADERBOARD_LOADING_MIN_MS = 2_000;

type LeaderboardLoadState = "loading" | "ready" | "signedOut" | "error";
type LeaderboardView = "global" | "weekly" | "rivals";
type LeaderboardTransitionDirection = "next" | "previous";
const LEADERBOARD_RANK_LABEL_COLOR = "#f5d66f";
const LEADERBOARD_VIEW_ORDER: LeaderboardView[] = ["global", "weekly", "rivals"];
const LEADERBOARD_VIEW_TRANSITION_MS = 560;

function isLeaderboardViewToggleTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(".leaderboardViewToggleBtn"));
}

function isLeaderboardProfileOpenTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("[data-leaderboard-profile-open]"));
}

function isLeaderboardAwardsInfoTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(".leaderboardWeeklyAwardsInfoBtn"));
}

function formatLeaderboardXp(xpRaw: number): string {
  return `${new Intl.NumberFormat().format(Math.max(0, Math.floor(xpRaw || 0)))} XP`;
}

function formatLeaderboardTrend(xpRaw: number): string {
  const xp = Math.max(0, Math.floor(xpRaw || 0));
  return xp > 0 ? `+${new Intl.NumberFormat().format(xp)} XP` : "-";
}

function formatLeaderboardMovementRank(rankRaw: number): string {
  const rank = Math.max(0, Math.floor(Number(rankRaw || 0) || 0));
  return rank > 0 ? `#${rank}` : "Unranked";
}

function formatLeaderboardMovementMetric(change: LeaderboardPositionChangeSnapshot, profile: LeaderboardProfile): string {
  return change.boardId === "weekly"
    ? formatLeaderboardTrend(profile.weeklyXpGain)
    : formatLeaderboardXp(profile.rewardTotalXp);
}

function formatLeaderboardTaskCount(countRaw: number): string {
  return new Intl.NumberFormat().format(Math.max(0, Math.floor(countRaw || 0)));
}

function formatLeaderboardMemberSince(memberSinceMs: number | null | undefined): string {
  if (!memberSinceMs || !Number.isFinite(memberSinceMs) || memberSinceMs <= 0) return "";
  return new Date(memberSinceMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getLeaderboardLabel(profile: LeaderboardProfile): string {
  return String(profile.username || profile.displayLabel || "User").trim() || "User";
}

function getLeaderboardUsernameLabel(profile: LeaderboardProfile): string {
  const rawLabel = String(profile.username || profile.displayLabel || "username").trim() || "username";
  return rawLabel.startsWith("@") ? rawLabel : `@${rawLabel}`;
}

function labelFromUser(user: User | null) {
  const email = String(user?.email || "").trim() || user?.providerData
    ?.map((provider) => String(provider.email || "").trim())
    .find(Boolean);
  if (email) return email.split("@")[0] || email;
  return "User";
}

function resolveCurrentUserAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string) {
  const normalizedAvatarId = String(avatarId || "").trim();
  if (normalizedAvatarId && isCustomAvatarIdForUid(uid, normalizedAvatarId)) {
    return normalizeBundledAvatarWebpSrc(
      findStoredCustomAvatarUploadSrc(uid, normalizedAvatarId) ||
      String(avatarCustomSrc || "").trim() ||
      readStoredCustomAvatarSrc(uid)
    );
  }
  if (normalizedAvatarId && normalizedAvatarId === googleAvatarIdForUid(uid) && googlePhotoUrl) return googlePhotoUrl;
  if (normalizedAvatarId) {
    const match = AVATAR_CATALOG.find((avatar) => avatar.id === normalizedAvatarId);
    if (match?.src) return match.src;
    if (/^\/(?:tasklaunch\/)?avatars\//i.test(normalizedAvatarId)) return normalizeBundledAvatarWebpSrc(normalizedAvatarId);
  }
  return normalizeBundledAvatarWebpSrc(googlePhotoUrl);
}

function withCurrentUserProfileHydration(
  profile: LeaderboardProfile | null,
  hydratedProfile: Pick<LeaderboardProfile, "uid" | "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl"> | null
): LeaderboardProfile | null {
  if (!profile || !hydratedProfile || profile.uid !== hydratedProfile.uid) return profile;
  return {
    ...profile,
    username: hydratedProfile.username || profile.username,
    displayLabel: hydratedProfile.displayLabel || profile.displayLabel,
    avatarId: hydratedProfile.avatarId ?? profile.avatarId,
    avatarCustomSrc: hydratedProfile.avatarCustomSrc,
    googlePhotoUrl: hydratedProfile.googlePhotoUrl || profile.googlePhotoUrl,
  };
}

function getLeaderboardRankLabel(profile: LeaderboardProfile): string {
  return getLeaderboardResolvedRank(profile).label;
}

function getLeaderboardRankColor(): string {
  return LEADERBOARD_RANK_LABEL_COLOR;
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
    ["--xp-award-pre-impact-dx" as keyof CSSProperties]: `${(targetX - sourceX) * 0.74}px`,
    ["--xp-award-pre-impact-dy" as keyof CSSProperties]: `${(targetY - sourceY) * 0.74}px`,
  };
}

function isUsableXpAwardRect(rect: Pick<DOMRect, "left" | "top" | "width" | "height"> | null | undefined): rect is DOMRect {
  return !!rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0;
}

const XP_AWARD_UNIT_DELIVERY_AUDIO_SRC = "/xp_increase.mp3";
const XP_AWARD_DELIVERY_DONE_AUDIO_SRC = "/xp_increase_done.mp3";

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

function LeaderboardPodiumDeck({
  rows,
  ariaLabel,
  formatMetric,
  onOpenProfile,
}: {
  rows: WeeklyLeaderboardRow[];
  ariaLabel: string;
  formatMetric: (profile: LeaderboardProfile) => string;
  onOpenProfile: (profile: LeaderboardProfile) => void;
}) {
  return (
    <div className="leaderboardWeeklyPodiumDeck" aria-label={ariaLabel}>
      {rows.map((row) => (
        <button
          className={`leaderboardWeeklyPodiumCard leaderboardWeeklyPodiumCard${row.rank}${row.isCurrentUser ? " isCurrentUser" : ""}${row.isPlaceholder ? " isPlaceholder" : ""}${row.isDummy ? " isDummy" : ""}`}
          type="button"
          key={row.profile.uid}
          disabled={row.isPlaceholder || row.isDummy}
          aria-disabled={row.isPlaceholder || row.isDummy}
          data-leaderboard-profile-open={row.isPlaceholder || row.isDummy ? undefined : row.profile.uid}
          onClick={() => {
            if (!row.isPlaceholder && !row.isDummy) onOpenProfile(row.profile);
          }}
        >
          <span className="leaderboardWeeklyPodiumAvatarWrap">
            {row.rank === 1 ? (
              <span className="leaderboardWeeklyPodiumCrown" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : null}
            <span className="leaderboardWeeklyPodiumAvatarFlipGroup" aria-hidden="true">
              {row.isPlaceholder ? (
                <span className="leaderboardWeeklyPodiumAvatarPlaceholder" />
              ) : (
                <span className="leaderboardWeeklyPodiumAvatarFrame">
                  <LeaderboardAvatar profile={row.profile} />
                </span>
              )}
              <span className="leaderboardWeeklyPodiumBadge">{row.rank}</span>
            </span>
          </span>
          <span className="leaderboardWeeklyPodiumText">
            <strong className="leaderboardWeeklyPodiumName">{row.playerLabel}</strong>
            {row.isPlaceholder ? null : <span className="leaderboardWeeklyPodiumXp">{formatMetric(row.profile)}</span>}
            {row.isPlaceholder ? null : (
              <span className="leaderboardWeeklyPodiumRankInsignia" aria-label={`${getLeaderboardRankLabel(row.profile)} insignia`}>
                <LeaderboardRankInsignia profile={row.profile} />
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function SignedOutPrompt({ message }: { message: string }) {
  return (
    <div className="signedOutPagePrompt">
      <span>{message}</span>{" "}
      <Link href="/login">Sign In</Link>.
    </div>
  );
}

type LeaderboardSharedTableRowProps = {
  as?: "button" | "div";
  key: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  ariaDisabled?: boolean;
  profileOpenUid?: string;
  onClick?: () => void;
};

function LeaderboardSharedTableCells({
  row,
  rankBeforeMetric,
  formatMetric,
}: {
  row: WeeklyLeaderboardRow;
  rankBeforeMetric: boolean;
  formatMetric: (profile: LeaderboardProfile) => string;
}) {
  return (
    <>
      <span className="leaderboardWeeklyRankCell" role="cell">{row.rank || ""}</span>
      <span className="leaderboardWeeklyPlayerCell" role="cell">
        {row.isPlaceholder ? null : <LeaderboardAvatar profile={row.profile} small />}
        <span className="leaderboardWeeklyPlayerText">
          <strong>{row.playerLabel}</strong>
        </span>
      </span>
      {rankBeforeMetric ? (
        <>
          <span className="leaderboardWeeklyInsigniaCell" role="cell" aria-label={`${getLeaderboardRankLabel(row.profile)} insignia`}>
            {row.isPlaceholder ? null : <LeaderboardRankInsignia profile={row.profile} />}
          </span>
          <span className="leaderboardWeeklyTimeCell" role="cell">{row.isPlaceholder ? "" : formatMetric(row.profile)}</span>
        </>
      ) : (
        <>
          <span className="leaderboardWeeklyTimeCell" role="cell">{row.isPlaceholder ? "" : formatMetric(row.profile)}</span>
          <span className="leaderboardWeeklyInsigniaCell" role="cell" aria-label={`${getLeaderboardRankLabel(row.profile)} insignia`}>
            {row.isPlaceholder ? null : <LeaderboardRankInsignia profile={row.profile} />}
          </span>
        </>
      )}
    </>
  );
}

function LeaderboardSharedTableContent({
  rows,
  metricHeader,
  ariaLabel,
  className = "",
  rankBeforeMetric = false,
  formatMetric,
  getRowProps,
}: {
  rows: WeeklyLeaderboardRow[];
  metricHeader: string;
  ariaLabel: string;
  className?: string;
  rankBeforeMetric?: boolean;
  formatMetric: (profile: LeaderboardProfile) => string;
  getRowProps: (row: WeeklyLeaderboardRow, index: number) => LeaderboardSharedTableRowProps;
}) {
  return (
    <div className={`leaderboardWeeklyTable${className ? ` ${className}` : ""}`} role="table" aria-label={ariaLabel}>
      <div className="leaderboardWeeklyTableRow leaderboardWeeklyTableHead" role="row">
        <span role="columnheader">Pos</span>
        <span role="columnheader">User</span>
        {rankBeforeMetric ? (
          <>
            <span role="columnheader">Rank</span>
            <span role="columnheader">{metricHeader}</span>
          </>
        ) : (
          <>
            <span role="columnheader">{metricHeader}</span>
            <span role="columnheader">Rank</span>
          </>
        )}
      </div>
      {rows.map((row, index) => {
        const rowProps = getRowProps(row, index);
        const rowClassName = `leaderboardWeeklyTableRow${row.isCurrentUser ? " isCurrentUser" : ""}${row.isPlaceholder ? " isPlaceholder" : ""}${row.isDummy ? " isDummy" : ""}${rowProps.className ? ` ${rowProps.className}` : ""}`;
        const cells = (
          <LeaderboardSharedTableCells
            row={row}
            rankBeforeMetric={rankBeforeMetric}
            formatMetric={formatMetric}
          />
        );

        if (rowProps.as === "div") {
          return (
            <div
              className={rowClassName}
              role="row"
              key={rowProps.key}
              style={rowProps.style}
            >
              {cells}
            </div>
          );
        }

        return (
          <button
            className={rowClassName}
            role="row"
            type="button"
            key={rowProps.key}
            style={rowProps.style}
            disabled={rowProps.disabled}
            aria-disabled={rowProps.ariaDisabled}
            data-leaderboard-profile-open={rowProps.profileOpenUid}
            onClick={rowProps.onClick}
          >
            {cells}
          </button>
        );
      })}
    </div>
  );
}

function LeaderboardSharedTable({
  rows,
  metricHeader,
  ariaLabel,
  className = "",
  rankBeforeMetric = false,
  friendUidSet,
  formatMetric,
  onOpenProfile,
}: {
  rows: WeeklyLeaderboardRow[];
  metricHeader: string;
  ariaLabel: string;
  className?: string;
  rankBeforeMetric?: boolean;
  friendUidSet: Set<string>;
  formatMetric: (profile: LeaderboardProfile) => string;
  onOpenProfile: (profile: LeaderboardProfile) => void;
}) {
  return (
    <div className={`leaderboardWeeklyTableWrap${className ? ` ${className}` : ""}`}>
      <div className="leaderboardSharedTablePanel">
        <LeaderboardSharedTableContent
          rows={rows}
          metricHeader={metricHeader}
          ariaLabel={ariaLabel}
          rankBeforeMetric={rankBeforeMetric}
          formatMetric={formatMetric}
          getRowProps={(row) => {
            const isFriend = !row.isPlaceholder && !row.isDummy && friendUidSet.has(row.profile.uid);

            return {
              key: `${row.isCurrentUser ? "current" : "ranked"}-${row.profile.uid}`,
              className: isFriend ? "isFriend" : "",
              disabled: row.isPlaceholder || row.isDummy,
              ariaDisabled: row.isPlaceholder || row.isDummy,
              profileOpenUid: row.isPlaceholder || row.isDummy ? undefined : row.profile.uid,
              onClick: () => {
                if (row.isPlaceholder || row.isDummy) return;
                if (isFriend) {
                  window.dispatchEvent(
                    new CustomEvent<OpenFriendProfileFromLeaderboardEventDetail>(TASKTIMER_OPEN_FRIEND_PROFILE_EVENT, {
                      detail: { friendUid: row.profile.uid },
                    })
                  );
                  return;
                }
                onOpenProfile(row.profile);
              },
            };
          }}
        />
      </div>
    </div>
  );
}

function LeaderboardMovementTable({
  change,
}: {
  change: LeaderboardPositionChangeSnapshot;
}) {
  const movementRows = change.movementRows?.length ? change.movementRows : change.rows;
  const isMovingUp = change.currentRank < change.previousRank;
  const isMovingDown = change.currentRank > change.previousRank;
  const lastRowIndex = Math.max(0, movementRows.length - 1);

  return (
    <div className="leaderboardWeeklyTableWrap leaderboardMovementTableWrap">
      <div className="leaderboardSharedTablePanel leaderboardMovementSharedTablePanel">
        <LeaderboardSharedTableContent
          rows={movementRows}
          metricHeader={change.metricLabel}
          ariaLabel={`${change.boardLabel} position change`}
          className={`leaderboardMovementTable${isMovingUp ? " isMovingUp" : ""}${isMovingDown ? " isMovingDown" : ""}`}
          rankBeforeMetric
          formatMetric={(profile) => formatLeaderboardMovementMetric(change, profile)}
          getRowProps={(row, index) => {
            const previousIndex = row.isCurrentUser
              ? (isMovingUp ? lastRowIndex : isMovingDown ? 0 : index)
              : (isMovingUp ? Math.max(0, index - 1) : isMovingDown ? Math.min(lastRowIndex, index + 1) : index);

            return {
              as: "div",
              key: `${change.boardId}-${row.profile.uid}-${row.rank}`,
              className: "leaderboardMovementTableRow",
              style: {
                "--leaderboard-movement-from-index": previousIndex,
                "--leaderboard-movement-to-index": index,
              } as CSSProperties,
            };
          }}
        />
      </div>
      {change.movementRowsTruncated && change.skippedMovementRowCount > 0 ? (
        <p className="leaderboardMovementSkippedRows">
          {new Intl.NumberFormat().format(change.skippedMovementRowCount)} crossed rows skipped
        </p>
      ) : null}
    </div>
  );
}

function RankRivalsRankSlot({
  rank,
  eyebrow,
  emptyLabel,
  active = false,
}: {
  rank: RankRivalLadderViewModel["currentRank"] | null;
  eyebrow: string;
  emptyLabel?: string;
  active?: boolean;
}) {
  return (
    <div className={`rankRivalsRankSlot${active ? " isCurrent" : ""}${rank ? "" : " isEmpty"}`}>
      <RankThumbnail
        rankId={rank?.id || "unranked"}
        storedThumbnailSrc=""
        className="rankRivalsRankBadge"
        imageClassName="rankRivalsRankBadgeImg"
        placeholderClassName="rankRivalsRankBadgePlaceholder"
        alt=""
        size={active ? 92 : 72}
        aria-hidden
      />
      <span className="rankRivalsRankEyebrow">{eyebrow}</span>
      <strong className="rankRivalsRankName">{rank?.label || emptyLabel || eyebrow}</strong>
    </div>
  );
}

function RankRivalsRow({
  row,
  isMaxRank,
  onOpenProfile,
}: {
  row: RankRivalLadderRow;
  isMaxRank: boolean;
  onOpenProfile: (profile: LeaderboardProfile) => void;
}) {
  const progressStyle = { "--rank-rival-progress": `${row.progressPct}%` } as CSSProperties;
  return (
    <button
      className={`rankRivalsTableRow${row.isCurrentUser ? " isCurrentUser" : ""} isStatus-${row.status}`}
      type="button"
      role="row"
      data-leaderboard-profile-open={row.profile.uid}
      onClick={() => onOpenProfile(row.profile)}
    >
      <span className="rankRivalsPositionCell" role="cell">
        <strong>{row.rank}</strong>
      </span>
      <span className="rankRivalsUserCell" role="cell">
        <LeaderboardAvatar profile={row.profile} small />
        <strong>{row.playerLabel}</strong>
      </span>
      <span className="rankRivalsXpCell" role="cell">{row.remainingLabel.replace(" XP", "")}</span>
      <span
        className="rankRivalsProgressCell"
        role="cell"
        aria-label={isMaxRank ? "Max rank reached" : `${row.progressLabel} progress toward next rank`}
      >
        <strong>{row.progressLabel}</strong>
        <span className="rankRivalsProgressTrack" style={progressStyle} aria-hidden="true" />
      </span>
    </button>
  );
}

function RankRivalsLadder({
  viewModel,
  onOpenProfile,
}: {
  viewModel: RankRivalLadderViewModel;
  onOpenProfile: (profile: LeaderboardProfile) => void;
}) {
  return (
    <div className="rankRivalsLadder" aria-label={`Rank Rivals ladder for ${viewModel.currentRank.label}.`}>
      <div className="rankRivalsRankPanel">
        <div className="rankRivalsHexPattern" aria-hidden="true" />
        <div className="rankRivalsRankTrack">
          <RankRivalsRankSlot rank={viewModel.previousRank} eyebrow="Previous Rank" />
          <span className="rankRivalsArrow" aria-hidden="true">-&gt;</span>
          <RankRivalsRankSlot rank={viewModel.currentRank} eyebrow="Current Rank" active />
          <span className="rankRivalsArrow" aria-hidden="true">-&gt;</span>
          <RankRivalsRankSlot rank={viewModel.nextRank} eyebrow="Next Rank" emptyLabel="Max Rank" />
        </div>
      </div>

      <div className="rankRivalsTablePanel">
        <div className="rankRivalsTargetLine">
          <span className="rankRivalsTargetIcon" aria-hidden="true">R</span>
          <strong>{viewModel.subtitle}</strong>
        </div>
        <div className="rankRivalsTable" role="table" aria-label="Rank Rivals standings">
          <div className="rankRivalsTableRow rankRivalsTableHead" role="row">
            <span role="columnheader">Pos</span>
            <span role="columnheader">User</span>
            <span role="columnheader">XP Needed</span>
            <span role="columnheader">Progress</span>
          </div>
          {viewModel.rows.map((row) => (
            <RankRivalsRow
              key={`${row.profile.uid}-${row.rank}`}
              row={row}
              isMaxRank={viewModel.isMaxRank}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function isXpAwardSourceOverlayVisible(overlayId: string): boolean | undefined {
  if (typeof document === "undefined") return undefined;
  const overlay = document.getElementById(overlayId) as HTMLElement | null;
  if (!overlay) return false;
  return overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
}

export default function TaskTimerMainAppClient({ initialPage }: TaskTimerMainAppClientProps) {
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [cachedPreferences, setCachedPreferences] = useState<UserPreferencesV1 | null>(() => preferencesPersistence.loadCached());
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [achievementSoundsEnabled, setAchievementSoundsEnabled] = useState(() => preferencesPersistence.loadResolved().achievementSoundsEnabled !== false);
  const [interactionHapticsEnabled, setInteractionHapticsEnabled] = useState(() => preferencesPersistence.loadResolved().interactionHapticsEnabled !== false);
  const [interactionHapticsIntensity, setInteractionHapticsIntensity] = useState<InteractionHapticsIntensity>(() =>
    normalizeInteractionHapticsIntensity(preferencesPersistence.loadResolved().interactionHapticsIntensity)
  );
  const [displayedXp, setDisplayedXp] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS).totalXp);
  const [xpAwardFx, setXpAwardFx] = useState<{
    visible: boolean;
    payloads: XpAwardFxPayload[];
  }>({ visible: false, payloads: [] });
  const [xpAnimationState, setXpAnimationState] = useState(() => createXpAwardAnimationState());
  const [isXpCountAnimating, setIsXpCountAnimating] = useState(false);
  const [isXpAwardSpotlightActive, setIsXpAwardSpotlightActive] = useState(false);
  const [pendingRankPromotion, setPendingRankPromotion] = useState<RankPromotion | null>(null);
  const [activeRankPromotion, setActiveRankPromotion] = useState<RankPromotion | null>(null);
  const [promotionOverlayRetrySeq, setPromotionOverlayRetrySeq] = useState(0);
  const [desktopInsigniaUpgrade, setDesktopInsigniaUpgrade] = useState<DesktopInsigniaUpgradePayload | null>(null);
  const desktopInsigniaUpgradeSeqRef = useRef(0);
  const [dismissedHighlightParam, setDismissedHighlightParam] = useState<string | null>(null);
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardLoadState>("error");
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardScreenData>(EMPTY_LEADERBOARD_SCREEN_DATA);
  const [leaderboardError, setLeaderboardError] = useState<string | null>("Leaderboard is unavailable in this session.");
  const [selectedLeaderboardProfile, setSelectedLeaderboardProfile] = useState<LeaderboardProfile | null>(null);
  const [leaderboardMovementQueue, setLeaderboardMovementQueue] = useState<LeaderboardPositionChangeSnapshot[]>([]);
  const [activeLeaderboardMovementSequence, setActiveLeaderboardMovementSequence] = useState<LeaderboardPositionChangeSnapshot[]>([]);
  const [activeLeaderboardMovementIndex, setActiveLeaderboardMovementIndex] = useState(0);
  const [weeklyAwardsInfoOpen, setWeeklyAwardsInfoOpen] = useState(false);
  const [leaderboardView, setLeaderboardView] = useState<LeaderboardView>("global");
  const [exitingLeaderboardView, setExitingLeaderboardView] = useState<LeaderboardView | null>(null);
  const [leaderboardTransitionDirection, setLeaderboardTransitionDirection] = useState<LeaderboardTransitionDirection>("next");
  const [leaderboardClockMs, setLeaderboardClockMs] = useState(() => Date.now());
  const [leaderboardFriendUidSet, setLeaderboardFriendUidSet] = useState<Set<string>>(() => new Set());
  const [hydratedCurrentUserProfile, setHydratedCurrentUserProfile] = useState<Pick<
    LeaderboardProfile,
    "uid" | "username" | "displayLabel" | "avatarId" | "avatarCustomSrc" | "googlePhotoUrl"
  > | null>(null);
  const leaderboardLoadSeqRef = useRef(0);
  const leaderboardMovementQueueRef = useRef<LeaderboardPositionChangeSnapshot[]>([]);
  const activeLeaderboardMovementSequenceRef = useRef<LeaderboardPositionChangeSnapshot[]>([]);
  const leaderboardSwipeRef = useRef<MobileLeaderboardSwipeState>(getResetMobileLeaderboardSwipeState());
  const suppressLeaderboardSwipeClickRef = useRef(false);
  const displayedXpRef = useRef(displayedXp);
  const previousActiveAwardRef = useRef<PendingXpAward | null>(null);
  const xpAnimationFrameRef = useRef<number | null>(null);
  const xpAnimationStartTimerRef = useRef<number | null>(null);
  const xpAnimationCleanupTimerRef = useRef<number | null>(null);
  const xpAnimationExtraTimersRef = useRef<number[]>([]);
  const xpAwardPayloadSeqRef = useRef(0);
  const xpCountAnimationStartedRef = useRef(false);
  const xpAwardUnitDeliveryAudioPlayer = useMemo(() => createClickAudioPlayer(XP_AWARD_UNIT_DELIVERY_AUDIO_SRC), []);
  const xpAwardDeliveryDoneAudioPlayer = useMemo(() => createClickAudioPlayer(XP_AWARD_DELIVERY_DONE_AUDIO_SRC), []);
  const effectiveDisplayedXp = xpAnimationState.pending || xpAnimationState.active ? displayedXp : rewardProgress.totalXp;
  const clearXpAwardExtraTimers = useCallback(() => {
    xpAnimationExtraTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    xpAnimationExtraTimersRef.current = [];
  }, []);
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
  const friendsAuthRuntimeKey = initialPage === "friends" ? isAuthenticated : null;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const clockTimer = window.setInterval(() => {
      setLeaderboardClockMs(Date.now());
    }, 1_000);
    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    displayedXpRef.current = displayedXp;
  }, [displayedXp]);

  useEffect(() => {
    activeLeaderboardMovementSequenceRef.current = activeLeaderboardMovementSequence;
  }, [activeLeaderboardMovementSequence]);

  useEffect(() => {
    if (!desktopInsigniaUpgrade) return;
    const clearTimer = window.setTimeout(() => {
      setDesktopInsigniaUpgrade((current) => current?.seq === desktopInsigniaUpgrade.seq ? null : current);
    }, 3600);
    return () => window.clearTimeout(clearTimer);
  }, [desktopInsigniaUpgrade]);

  useEffect(() => {
    void bootstrapFirebaseWebAppCheck();
    void trackScreen(initialPage === "history" ? "history_manager" : initialPage);
    const { destroy } = initTaskTimerClient(initialPage);
    return () => {
      destroy();
    };
  }, [initialPage, friendsAuthRuntimeKey]);

  useEffect(() => {
    const unsubscribe = preferencesPersistence.subscribe((prefs) => {
      setCachedPreferences(prefs);
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
      setAchievementSoundsEnabled(prefs?.achievementSoundsEnabled !== false);
      setInteractionHapticsEnabled(prefs?.interactionHapticsEnabled !== false);
      setInteractionHapticsIntensity(normalizeInteractionHapticsIntensity(prefs?.interactionHapticsIntensity));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pendingRankPromotion || activeRankPromotion || typeof document === "undefined") return;
    if (hasBlockingPromotionXpAnimation(xpAnimationState)) return;
    if (hasBlockingPromotionOverlay(document)) return;
    const openTimer = window.setTimeout(() => {
      setActiveRankPromotion(pendingRankPromotion);
      setPendingRankPromotion(null);
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [activeRankPromotion, pendingRankPromotion, promotionOverlayRetrySeq, xpAnimationState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleRankPromotion = (event: Event) => {
      const promotion = (event as CustomEvent<RankPromotion>).detail;
      if (!promotion) return;
      setPendingRankPromotion(promotion);
      setPromotionOverlayRetrySeq((current) => current + 1);
    };
    const handlePendingAward = (event: Event) => {
      const detail = (event as CustomEvent<PendingXpAward>).detail;
      if (!detail) return;
      setXpAnimationState((current) =>
        enqueuePendingXpAwardFromOverlayState(current, detail, {
          sourceOverlayVisible: isXpAwardSourceOverlayVisible(detail.sourceOverlayId),
        })
      );
    };
    const handleLeaderboardMovement = (event: Event) => {
      const detail = (event as CustomEvent<LeaderboardPositionChangedEventDetail>).detail;
      const changes = Array.isArray(detail?.changes) ? detail.changes.filter((change) => change?.rows?.length) : [];
      if (!changes.length) return;
      if (activeLeaderboardMovementSequenceRef.current.length) {
        setActiveLeaderboardMovementSequence((current) => {
          const next = current.concat(changes);
          activeLeaderboardMovementSequenceRef.current = next;
          return next;
        });
        return;
      }
      setLeaderboardMovementQueue((current) => {
        const next = current.concat(changes);
        leaderboardMovementQueueRef.current = next;
        return next;
      });
    };
    const handleOverlayClosed = (event: Event) => {
      const overlayId = String((event as CustomEvent<{ overlayId?: string }>).detail?.overlayId || "").trim();
      if (!overlayId) return;
      setXpAnimationState((current) => notifyXpAwardOverlayClosed(current, overlayId));
      setPromotionOverlayRetrySeq((current) => current + 1);
    };
    const handleTimeGoalXpClaim = (event: Event) => {
      const detail = (event as CustomEvent<TimeGoalCompleteXpClaimRequest>).detail;
      if (!detail || String(detail.overlayId || "").trim() !== "timeGoalCompleteOverlay") return;
      event.preventDefault();
      setIsXpAwardSpotlightActive(false);
      setXpAnimationState((current) => notifyXpAwardOverlayClosed(current, detail.overlayId));
    };
    window.addEventListener(TASKTIMER_RANK_PROMOTION_EVENT, handleRankPromotion as EventListener);
    window.addEventListener(TASKTIMER_PENDING_XP_AWARD_EVENT, handlePendingAward as EventListener);
    window.addEventListener(LEADERBOARD_POSITION_CHANGED_EVENT, handleLeaderboardMovement as EventListener);
    window.addEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, handleOverlayClosed as EventListener);
    window.addEventListener(TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT, handleTimeGoalXpClaim as EventListener);
    return () => {
      window.removeEventListener(TASKTIMER_RANK_PROMOTION_EVENT, handleRankPromotion as EventListener);
      window.removeEventListener(TASKTIMER_PENDING_XP_AWARD_EVENT, handlePendingAward as EventListener);
      window.removeEventListener(LEADERBOARD_POSITION_CHANGED_EVENT, handleLeaderboardMovement as EventListener);
      window.removeEventListener(TASKTIMER_OVERLAY_CLOSED_EVENT, handleOverlayClosed as EventListener);
      window.removeEventListener(TASKTIMER_CLAIM_TIME_GOAL_COMPLETE_XP_EVENT, handleTimeGoalXpClaim as EventListener);
    };
  }, []);

  const leaderboardMovementBlocked = Boolean(
    xpAnimationState.pending ||
    xpAnimationState.active ||
    pendingRankPromotion ||
    activeRankPromotion
  );

  useEffect(() => {
    if (leaderboardMovementBlocked || activeLeaderboardMovementSequence.length || !leaderboardMovementQueue.length) return;
    const openTimer = window.setTimeout(() => {
      const nextSequence = leaderboardMovementQueueRef.current;
      if (!nextSequence.length) return;
      activeLeaderboardMovementSequenceRef.current = nextSequence;
      leaderboardMovementQueueRef.current = [];
      setActiveLeaderboardMovementIndex(0);
      setActiveLeaderboardMovementSequence(nextSequence);
      setLeaderboardMovementQueue([]);
    }, 0);
    return () => window.clearTimeout(openTimer);
  }, [activeLeaderboardMovementSequence.length, leaderboardMovementBlocked, leaderboardMovementQueue.length]);

  useEffect(() => {
    const activeAward = xpAnimationState.active;
    const wasIdle = previousActiveAwardRef.current == null;
    previousActiveAwardRef.current = activeAward;
    if (!activeAward) {
      if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
      if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
      if (xpAnimationCleanupTimerRef.current != null) window.clearTimeout(xpAnimationCleanupTimerRef.current);
      clearXpAwardExtraTimers();
      xpCountAnimationStartedRef.current = false;
      return;
    }

    if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
    if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
    if (xpAnimationCleanupTimerRef.current != null) window.clearTimeout(xpAnimationCleanupTimerRef.current);
    clearXpAwardExtraTimers();
    const countAnimationStarted = xpCountAnimationStartedRef.current;

    const reducedMotion = prefersReducedMotion();
    const { startXp, endXp } = getXpAwardCountRange(activeAward, {
      wasIdle,
      displayedXp: displayedXpRef.current,
    });
    let countAnimationStartedDuringEffect = false;

    const addExtraTimer = (handler: () => void, delayMs: number) => {
      const timer = window.setTimeout(() => {
        xpAnimationExtraTimersRef.current = xpAnimationExtraTimersRef.current.filter((value) => value !== timer);
        handler();
      }, delayMs);
      xpAnimationExtraTimersRef.current.push(timer);
      return timer;
    };

    const finishAward = (delayMs: number) => {
      xpAnimationCleanupTimerRef.current = window.setTimeout(() => {
        setIsXpCountAnimating(false);
        setIsXpAwardSpotlightActive(false);
        setXpAwardFx({ visible: false, payloads: [] });
        setXpAnimationState((current) => clearActiveXpAward(current));
        if (activeAward.sourceModal === "timeGoalComplete") {
          window.dispatchEvent(new CustomEvent(TASKTIMER_TIME_GOAL_COMPLETE_XP_CLAIM_DELIVERED_EVENT));
        }
      }, delayMs);
    };

    const runDirectDelivery = () => {
      let targetRect: DOMRect | null = null;
      let payloadStyle: CSSProperties | null = null;

      try {
        targetRect = typeof document !== "undefined" ? getVisibleXpTargetRectFromDocument(document) : null;
        payloadStyle = targetRect ? buildXpPayloadStyle(!reducedMotion ? activeAward.sourceRect : null, targetRect) : null;
      } catch {
        targetRect = null;
        payloadStyle = null;
      }

      displayedXpRef.current = startXp;
      window.requestAnimationFrame(() => {
        setDisplayedXp(startXp);
        setIsXpCountAnimating(countAnimationStarted);
        setIsXpAwardSpotlightActive(true);
        setXpAwardFx({
          visible: true,
          payloads:
            payloadStyle && activeAward.awardedXp > 0
              ? [
                  {
                    id: `direct-${activeAward.sourceOverlayId}-${activeAward.sourceElementKey}`,
                    text: `+${activeAward.awardedXp} XP`,
                    style: payloadStyle,
                  },
                ]
              : [],
        });
      });

      if (startXp === endXp) {
        window.requestAnimationFrame(() => {
          setDisplayedXp(endXp);
          finishAward(reducedMotion ? 160 : 360);
        });
        return;
      }

      const startCountAnimation = () => {
        countAnimationStartedDuringEffect = true;
        xpCountAnimationStartedRef.current = true;
        setIsXpCountAnimating(true);
        if (shouldPlayXpAwardDeliveryHaptic(startXp, endXp, interactionHapticsEnabled)) {
          playXpAwardDeliveryHaptic({
            isEnabled: interactionHapticsEnabled,
            intensity: interactionHapticsIntensity,
          });
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
            displayedXpRef.current = endXp;
            setDisplayedXp(endXp);
            window.requestAnimationFrame(() => {
              setIsXpCountAnimating(false);
            });
            finishAward(reducedMotion ? 180 : 420);
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
    };

    const runModalXpValueDelivery = () => {
      const getSourceElement = () =>
        typeof document === "undefined"
          ? null
          : (document.getElementById("timeGoalCompleteXpValue") as HTMLElement | null) ||
            (document.getElementById("timeGoalCompleteText") as HTMLElement | null);
      const setModalRemainingXp = (xp: number) => {
        const sourceElement = getSourceElement();
        if (sourceElement?.id === "timeGoalCompleteXpValue") {
          sourceElement.textContent = String(Math.max(0, Math.floor(Number(xp) || 0)));
        } else if (sourceElement) {
          sourceElement.textContent = `XP Awarded: ${Math.max(0, Math.floor(Number(xp) || 0))}`;
        }
      };
      let targetRect: DOMRect | null = null;
      try {
        targetRect = typeof document !== "undefined" ? getVisibleXpTargetRectFromDocument(document) : null;
      } catch {
        targetRect = null;
      }

      setIsXpAwardSpotlightActive(false);
      setXpAwardFx({ visible: false, payloads: [] });
      displayedXpRef.current = startXp;
      setDisplayedXp(startXp);

      const totalUnits = Math.max(0, Math.floor(endXp - startXp));
      const targetCountdownXp = Math.max(0, Math.floor(Number(activeAward.awardedXp) || 0));
      const countdownDurationMs = getTaskButtonXpAwardCountdownDurationMs(targetCountdownXp);
      let arrivedParticles = 0;
      let previousRemaining = targetCountdownXp;
      let didPlayDoneSound = false;
      let lastDeliveryHapticAtMs: number | null = null;
      setModalRemainingXp(targetCountdownXp);

      const playXpAwardDoneSoundOnce = () => {
        if (didPlayDoneSound) return;
        didPlayDoneSound = true;
        if (!achievementSoundsEnabled) return;
        xpAwardDeliveryDoneAudioPlayer.play();
      };

      const updateDeliveredXp = () => {
        if (arrivedParticles >= totalUnits) return;
        arrivedParticles += 1;
        const nextXp = getDisplayedXpAfterParticleArrival({
          startXp,
          endXp,
          arrivedParticles,
        });
        if (!xpCountAnimationStartedRef.current) {
          countAnimationStartedDuringEffect = true;
          xpCountAnimationStartedRef.current = true;
          setIsXpCountAnimating(true);
        }
        displayedXpRef.current = nextXp;
        setDisplayedXp(nextXp);
        if (arrivedParticles >= totalUnits) {
          displayedXpRef.current = endXp;
          setDisplayedXp(endXp);
          setIsXpCountAnimating(false);
          xpAwardUnitDeliveryAudioPlayer.stop();
          playXpAwardDoneSoundOnce();
          finishAward(reducedMotion ? 80 : 180);
        }
      };

      const removePayload = (id: string) => {
        setXpAwardFx((current) => {
          const nextPayloads = current.payloads.filter((payload) => payload.id !== id);
          return {
            visible: nextPayloads.length > 0,
            payloads: nextPayloads,
          };
        });
      };

      const playXpAwardUnitDeliverySound = () => {
        if (!achievementSoundsEnabled) return;
        xpAwardUnitDeliveryAudioPlayer.play();
      };

      const playXpAwardUnitDeliveryHaptic = () => {
        const nowMs = performance.now();
        if (
          !shouldPlayRateLimitedXpAwardDeliveryHaptic({
            startXp,
            endXp,
            isEnabled: interactionHapticsEnabled,
            totalUnits,
            nowMs,
            lastPlayedAtMs: lastDeliveryHapticAtMs,
          })
        ) {
          return;
        }
        lastDeliveryHapticAtMs = nowMs;
        playXpAwardDeliveryHaptic({
          isEnabled: interactionHapticsEnabled,
          intensity: interactionHapticsIntensity,
        });
      };

      const launchUnitPayload = () => {
        if (totalUnits <= 0) return;
        if (reducedMotion || !targetRect) {
          playXpAwardUnitDeliverySound();
          playXpAwardUnitDeliveryHaptic();
          updateDeliveredXp();
          return;
        }
        const sourceElement = getSourceElement();
        const sourceRect = sourceElement?.getBoundingClientRect?.() || null;
        const unitOriginRect = isUsableXpAwardRect(sourceRect) ? sourceRect as DOMRect : activeAward.sourceRect;
        if (!unitOriginRect) {
          playXpAwardUnitDeliverySound();
          playXpAwardUnitDeliveryHaptic();
          updateDeliveredXp();
          return;
        }
        const style = buildXpPayloadStyle(unitOriginRect, targetRect);
        const id = `modal-unit-${activeAward.sourceOverlayId}-${xpAwardPayloadSeqRef.current++}`;
        playXpAwardUnitDeliverySound();
        playXpAwardUnitDeliveryHaptic();
        setXpAwardFx((current) => ({
          visible: true,
          payloads: [
            ...current.payloads,
            {
              id,
              text: "*",
              style,
              className: "xpAwardFxPayloadUnit xpAwardFxPayloadStar",
            },
          ],
        }));
        addExtraTimer(() => {
          updateDeliveredXp();
        }, XP_AWARD_UNIT_FX_DURATION_MS);
        addExtraTimer(() => removePayload(id), XP_AWARD_UNIT_FX_DURATION_MS + 120);
      };

      const scheduleUnitPayloadDelivery = () => {
        if (totalUnits <= 0) return;
        const launchIntervalMs = countdownDurationMs / totalUnits;
        for (let unitIndex = 0; unitIndex < totalUnits; unitIndex += 1) {
          addExtraTimer(launchUnitPayload, Math.round(unitIndex * launchIntervalMs));
        }
      };

      if (startXp === endXp || targetCountdownXp <= 0 || countdownDurationMs <= 0 || totalUnits <= 0) {
        setModalRemainingXp(0);
        displayedXpRef.current = endXp;
        setDisplayedXp(endXp);
        finishAward(reducedMotion ? 80 : 180);
        return;
      }

      if (achievementSoundsEnabled) {
        xpAwardUnitDeliveryAudioPlayer.warm();
        xpAwardDeliveryDoneAudioPlayer.warm();
      }
      scheduleUnitPayloadDelivery();
      const startedAt = performance.now();

      const tick = (nowValue: number) => {
        const progress = Math.max(0, Math.min(1, (nowValue - startedAt) / countdownDurationMs));
        const eased = 1 - (1 - progress) * (1 - progress);
        const nextRemaining = Math.max(0, Math.ceil(targetCountdownXp * (1 - eased)));
        if (nextRemaining !== previousRemaining) {
          previousRemaining = nextRemaining;
          setModalRemainingXp(nextRemaining);
        }
        if (progress >= 1) {
          xpCountAnimationStartedRef.current = false;
          setModalRemainingXp(0);
          xpAwardUnitDeliveryAudioPlayer.stop();
          if (arrivedParticles >= totalUnits) {
            displayedXpRef.current = endXp;
            setDisplayedXp(endXp);
            setIsXpCountAnimating(false);
            finishAward(reducedMotion ? 80 : 180);
          }
          return;
        }
        xpAnimationFrameRef.current = window.requestAnimationFrame(tick);
      };

      xpAnimationFrameRef.current = window.requestAnimationFrame(tick);
    };

    if (activeAward.sourceModal === "timeGoalComplete") {
      runModalXpValueDelivery();
    } else {
      runDirectDelivery();
    }

    return () => {
      if (xpAnimationFrameRef.current != null) window.cancelAnimationFrame(xpAnimationFrameRef.current);
      if (xpAnimationStartTimerRef.current != null) window.clearTimeout(xpAnimationStartTimerRef.current);
      clearXpAwardExtraTimers();
      xpCountAnimationStartedRef.current = getXpAwardCountStartedAfterEffectCleanup({
        wasStartedBeforeEffect: countAnimationStarted,
        startedDuringEffect: countAnimationStartedDuringEffect,
      });
    };
  }, [
    achievementSoundsEnabled,
    clearXpAwardExtraTimers,
    interactionHapticsEnabled,
    interactionHapticsIntensity,
    xpAnimationState.active,
    xpAwardDeliveryDoneAudioPlayer,
    xpAwardUnitDeliveryAudioPlayer,
  ]);

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

    const syncCurrentUserProfile = async (user: User | null) => {
      const uid = String(user?.uid || "").trim();
      const fallbackLabel = labelFromUser(user);
      const googlePhotoUrl = String(user?.photoURL || "").trim();
      const isAnonymous = !!user?.isAnonymous;

      if (!uid) {
        setHydratedCurrentUserProfile(null);
        return;
      }

      const storedAvatarId = readStoredAvatarId(uid);
      const storedCustomAvatarSrc = readStoredCustomAvatarSrc(uid);
      const storedIsCustomAvatar = isCustomAvatarIdForUid(uid, storedAvatarId);
      setHydratedCurrentUserProfile({
        uid,
        username: null,
        displayLabel: fallbackLabel,
        avatarId: storedAvatarId || null,
        avatarCustomSrc: storedIsCustomAvatar ? storedCustomAvatarSrc || null : null,
        googlePhotoUrl: googlePhotoUrl || null,
      });
      if (isAnonymous) return;

      const db = getFirebaseFirestoreClient();
      if (!db) return;

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (cancelled) return;
        const username = snap.exists() ? String(snap.get("username") || snap.get("alias") || "").trim() : "";
        const avatarId = String((snap.exists() ? snap.get("avatarId") : "") || storedAvatarId).trim();
        const avatarCustomSrc = String((snap.exists() ? snap.get("avatarCustomSrc") : "") || storedCustomAvatarSrc).trim();
        const remoteGooglePhotoUrl = String((snap.exists() ? snap.get("googlePhotoUrl") : "") || googlePhotoUrl).trim();
        const resolvedAvatarSrc = resolveCurrentUserAvatarSrc(uid, avatarId, avatarCustomSrc, remoteGooglePhotoUrl);
        const isCustomAvatar = isCustomAvatarIdForUid(uid, avatarId);
        setHydratedCurrentUserProfile({
          uid,
          username: username || null,
          displayLabel: username || fallbackLabel,
          avatarId: avatarId || null,
          avatarCustomSrc: isCustomAvatar ? (resolvedAvatarSrc || avatarCustomSrc) || null : null,
          googlePhotoUrl: remoteGooglePhotoUrl || null,
        });
      } catch {
        // Keep the local/auth profile fallback when cloud profile hydration fails.
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void syncCurrentUserProfile(user);
    });
    const refreshProfile = () => {
      void syncCurrentUserProfile(auth.currentUser);
    };
    if (typeof window !== "undefined") {
      window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
      window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    }

    if (auth.currentUser) {
      void syncCurrentUserProfile(auth.currentUser);
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
        window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
      }
    };
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;

    let cancelled = false;
    let activeUid = String(auth.currentUser?.uid || "").trim();
    let refreshTimer: number | null = null;

    const loadForUid = async (uid: string) => {
      const loadSeq = leaderboardLoadSeqRef.current + 1;
      leaderboardLoadSeqRef.current = loadSeq;
      const loadingStartedAt = Date.now();
      const waitForMinimumLoadingDuration = async () => {
        const remainingMs = LEADERBOARD_LOADING_MIN_MS - (Date.now() - loadingStartedAt);
        if (remainingMs > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, remainingMs);
          });
        }
      };
      setLeaderboardState("loading");
      setLeaderboardError(null);
      try {
        const cachedPreferences = preferencesPersistence.loadCached();
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
        await waitForMinimumLoadingDuration();
        if (cancelled || activeUid !== uid || leaderboardLoadSeqRef.current !== loadSeq) return;
        setLeaderboardData(nextData);
        setLeaderboardState("ready");
      } catch {
        await waitForMinimumLoadingDuration();
        if (cancelled || activeUid !== uid || leaderboardLoadSeqRef.current !== loadSeq) return;
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardState("error");
        setLeaderboardError("Could not load leaderboard data.");
      }
    };

    const loadFriendUidsForUid = async (uid: string) => {
      try {
        const rows = await loadFriendships(uid);
        if (cancelled || activeUid !== uid) return;
        const friendUids = new Set<string>();
        rows.forEach((row) => {
          const users = row.users || [];
          if (users.indexOf(uid) === -1) return;
          const peerUid = users[0] === uid ? users[1] : users[0];
          if (peerUid) friendUids.add(peerUid);
        });
        setLeaderboardFriendUidSet(friendUids);
      } catch {
        if (cancelled || activeUid !== uid) return;
        setLeaderboardFriendUidSet(new Set());
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimer != null) window.clearInterval(refreshTimer);
      refreshTimer = window.setInterval(() => {
        if (!activeUid || document.visibilityState !== "visible") return;
        void loadForUid(activeUid);
        void loadFriendUidsForUid(activeUid);
      }, 60_000);
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const isAnonymous = !!user?.isAnonymous;
      activeUid = isAnonymous ? "" : String(user?.uid || "").trim();
      setIsAuthenticated(!!user && !isAnonymous);
      if (!activeUid || isAnonymous) {
        leaderboardLoadSeqRef.current += 1;
        setLeaderboardData(EMPTY_LEADERBOARD_SCREEN_DATA);
        setLeaderboardFriendUidSet(new Set());
        setLeaderboardState("signedOut");
        setLeaderboardError(null);
        return;
      }
      scheduleRefresh();
      void loadForUid(activeUid);
      void loadFriendUidsForUid(activeUid);
    });

    const handleProfileUpdated = (event: Event) => {
      if (!activeUid) return;
      if (event.type === "visibilitychange" && document.visibilityState !== "visible") return;
      const detailUid = String((event as CustomEvent<{ uid?: string }>).detail?.uid || "").trim();
      if (detailUid && detailUid !== activeUid) return;
      void loadForUid(activeUid);
      void loadFriendUidsForUid(activeUid);
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
      void loadFriendUidsForUid(activeUid);
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

  const hydratedCurrentUserEntry = useMemo(
    () => withCurrentUserProfileHydration(leaderboardData.currentUserEntry, hydratedCurrentUserProfile),
    [hydratedCurrentUserProfile, leaderboardData.currentUserEntry]
  );
  const hydratedCurrentUserWeeklyEntry = useMemo(
    () => withCurrentUserProfileHydration(leaderboardData.currentUserWeeklyEntry, hydratedCurrentUserProfile),
    [hydratedCurrentUserProfile, leaderboardData.currentUserWeeklyEntry]
  );
  const hydratedTopEntries = useMemo(
    () => leaderboardData.topEntries.map((profile) => withCurrentUserProfileHydration(profile, hydratedCurrentUserProfile) || profile),
    [hydratedCurrentUserProfile, leaderboardData.topEntries]
  );
  const hydratedWeeklyEntries = useMemo(
    () => leaderboardData.weeklyEntries.map((profile) => withCurrentUserProfileHydration(profile, hydratedCurrentUserProfile) || profile),
    [hydratedCurrentUserProfile, leaderboardData.weeklyEntries]
  );
  const hydratedRivalEntries = useMemo(
    () => leaderboardData.rivalEntries.map((profile) => withCurrentUserProfileHydration(profile, hydratedCurrentUserProfile) || profile),
    [hydratedCurrentUserProfile, leaderboardData.rivalEntries]
  );

  const weeklyRows = useMemo(
    () =>
      buildWeeklyLeaderboardRows({
        weeklyEntries: hydratedWeeklyEntries,
        currentUserEntry: hydratedCurrentUserWeeklyEntry,
        currentUserWeeklyRank: leaderboardData.currentUserWeeklyRank,
      }),
    [hydratedCurrentUserWeeklyEntry, hydratedWeeklyEntries, leaderboardData.currentUserWeeklyRank]
  );
  const weeklyPodiumRows = weeklyRows.filter((row) => row.rank && row.rank <= 3).slice(0, 3);
  const orderedWeeklyPodiumRows = [2, 1, 3].map((rank) => weeklyPodiumRows.find((row) => row.rank === rank)).filter((row): row is WeeklyLeaderboardRow => Boolean(row));
  const weeklyTableRows = weeklyRows.filter((row) => row.rank && row.rank >= 4 && row.rank <= 8);
  const hasWeeklyRows = weeklyRows.length > 0;
  const weeklyPeriodRemainingLabel = formatWeeklyLeaderboardTimeRemaining(leaderboardClockMs);
  const globalRows = useMemo(() => {
    return buildGlobalLeaderboardRows({
      topEntries: hydratedTopEntries,
      currentUserEntry: hydratedCurrentUserEntry,
      currentUserRank: leaderboardData.currentUserRank,
    });
  }, [hydratedCurrentUserEntry, hydratedTopEntries, leaderboardData.currentUserRank]);
  const globalPodiumRows = globalRows.filter((row) => row.rank && row.rank <= 3).slice(0, 3);
  const orderedGlobalPodiumRows = [2, 1, 3].map((rank) => globalPodiumRows.find((row) => row.rank === rank)).filter((row): row is WeeklyLeaderboardRow => Boolean(row));
  const globalTableRows = globalRows.filter((row) => row.rank && row.rank >= 4 && row.rank <= 8);
  const hasGlobalRows = globalRows.length > 0;
  const rankRivalLadder = useMemo(
    () =>
      buildRankRivalLadderViewModel({
        rivalEntries: hydratedRivalEntries,
        currentUserEntry: hydratedCurrentUserEntry,
        currentUserRivalRank: leaderboardData.currentUserRivalRank,
      }),
    [hydratedCurrentUserEntry, hydratedRivalEntries, leaderboardData.currentUserRivalRank]
  );
  const hasRivalRows = !!rankRivalLadder && rankRivalLadder.rows.length > 0;
  const selectedLeaderboardLabel = selectedLeaderboardProfile ? getLeaderboardLabel(selectedLeaderboardProfile) : "";
  const selectedLeaderboardMemberSince = selectedLeaderboardProfile
    ? formatLeaderboardMemberSince(selectedLeaderboardProfile.memberSinceMs)
    : "";
  const hydratedCurrentUserProfileAvatarSrc = hydratedCurrentUserProfile
    ? getLeaderboardAvatarRenderSrc(hydratedCurrentUserProfile as LeaderboardProfile)
    : "";
  const hydratedCurrentUserProfileLabel = String(hydratedCurrentUserProfile?.username || hydratedCurrentUserProfile?.displayLabel || "").trim();
  const currentUserAvatarSrc = hydratedCurrentUserEntry
    ? getLeaderboardAvatarRenderSrc(hydratedCurrentUserEntry)
    : hydratedCurrentUserProfileAvatarSrc;
  const currentUserAvatarInitials = hydratedCurrentUserEntry
    ? getLeaderboardInitials(getLeaderboardLabel(hydratedCurrentUserEntry))
    : getLeaderboardInitials(hydratedCurrentUserProfileLabel || "User");
  const currentUserLabel = hydratedCurrentUserEntry ? getLeaderboardLabel(hydratedCurrentUserEntry) : hydratedCurrentUserProfileLabel || "User";
  const activeLeaderboardMovement = activeLeaderboardMovementSequence[activeLeaderboardMovementIndex] || null;
  const hasNextLeaderboardMovement = activeLeaderboardMovementIndex < activeLeaderboardMovementSequence.length - 1;
  const leaderboardMovementSlideStyle = {
    "--leaderboard-movement-index": activeLeaderboardMovementIndex,
  } as CSSProperties;

  const closeLeaderboardMovementModal = () => {
    activeLeaderboardMovementSequenceRef.current = [];
    leaderboardMovementQueueRef.current = [];
    setActiveLeaderboardMovementSequence([]);
    setActiveLeaderboardMovementIndex(0);
    setLeaderboardMovementQueue([]);
  };

  const advanceLeaderboardMovementModal = () => {
    if (!activeLeaderboardMovementSequence.length) return;
    if (hasNextLeaderboardMovement) {
      setActiveLeaderboardMovementIndex((current) => Math.min(current + 1, activeLeaderboardMovementSequence.length - 1));
      return;
    }
    closeLeaderboardMovementModal();
  };

  const closeLeaderboardPositionModal = () => {
    setSelectedLeaderboardProfile(null);
  };

  const closeWeeklyAwardsInfoModal = () => {
    setWeeklyAwardsInfoOpen(false);
  };

  const renderLeaderboardLoadingText = () => (
    <span className="leaderboardLoadingText" aria-label={`${LEADERBOARD_LOADING_TEXT}...`}>
      {LEADERBOARD_LOADING_TEXT}
    </span>
  );

  const openWeeklyLeaderboardProfile = (profile: LeaderboardProfile) => {
    setSelectedLeaderboardProfile(profile);
  };

  const openLeaderboardProfile = (profile: LeaderboardProfile) => {
    setSelectedLeaderboardProfile(profile);
  };

  const getLeaderboardTransitionDirection = useCallback((
    currentView: LeaderboardView,
    nextView: LeaderboardView
  ): LeaderboardTransitionDirection => {
    const currentIndex = LEADERBOARD_VIEW_ORDER.indexOf(currentView);
    const nextIndex = LEADERBOARD_VIEW_ORDER.indexOf(nextView);
    return nextIndex >= currentIndex ? "next" : "previous";
  }, []);

  const selectLeaderboardView = useCallback((nextView: LeaderboardView) => {
    if (nextView === leaderboardView) return;
    setLeaderboardTransitionDirection(getLeaderboardTransitionDirection(leaderboardView, nextView));
    setExitingLeaderboardView(leaderboardView);
    setLeaderboardView(nextView);
  }, [getLeaderboardTransitionDirection, leaderboardView]);

  useEffect(() => {
    if (!exitingLeaderboardView) return undefined;
    const timeoutId = window.setTimeout(() => {
      setExitingLeaderboardView(null);
    }, LEADERBOARD_VIEW_TRANSITION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [exitingLeaderboardView, leaderboardView]);

  const resetLeaderboardSwipe = useCallback(() => {
    leaderboardSwipeRef.current = getResetMobileLeaderboardSwipeState();
  }, []);

  const shouldUseLeaderboardTouchFallback = useCallback(() => (
    typeof window !== "undefined" && !("PointerEvent" in window)
  ), []);

  const suppressNextLeaderboardSwipeClick = useCallback(() => {
    suppressLeaderboardSwipeClickRef.current = true;
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      suppressLeaderboardSwipeClickRef.current = false;
    }, 350);
  }, []);

  const navigateFromLeaderboardSwipe = useCallback((swipeState: MobileLeaderboardSwipeState) => {
    const direction = getMobileLeaderboardSwipeDirection(swipeState);
    if (!direction) return false;

    suppressNextLeaderboardSwipeClick();
    leaderboardSwipeRef.current = {
      ...swipeState,
      consumed: true,
    };
    setLeaderboardTransitionDirection(direction);
    const nextView = getNextLeaderboardSwipeView(leaderboardView, direction);
    if (nextView !== leaderboardView) setExitingLeaderboardView(leaderboardView);
    setLeaderboardView(nextView);
    return true;
  }, [leaderboardView, suppressNextLeaderboardSwipeClick]);

  const handleLeaderboardSwipePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    resetLeaderboardSwipe();
    if (isLeaderboardViewToggleTarget(event.target)) return;
    if (isLeaderboardProfileOpenTarget(event.target)) return;
    if (isLeaderboardAwardsInfoTarget(event.target)) return;
    if (!canStartLeaderboardSwipePointer({
      button: event.button,
      pointerType: event.pointerType,
      mobileViewport: isMobileLeaderboardSwipeViewport(),
    })) return;

    leaderboardSwipeRef.current = getStartMobileLeaderboardSwipeState(event.pointerId, event.clientX, event.clientY);

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on older embedded browsers.
    }
  }, [resetLeaderboardSwipe]);

  const handleLeaderboardSwipePointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    const swipeState = leaderboardSwipeRef.current;
    if (!swipeState.active || swipeState.consumed || swipeState.pointerId !== event.pointerId) return;

    const nextSwipeState = getUpdatedMobileLeaderboardSwipeState(swipeState, event.pointerId, event.clientX, event.clientY);
    leaderboardSwipeRef.current = nextSwipeState;
    if (!navigateFromLeaderboardSwipe(nextSwipeState)) return;

    event.preventDefault();
  }, [navigateFromLeaderboardSwipe]);

  const handleLeaderboardSwipePointerEnd = useCallback((event: PointerEvent<HTMLElement>) => {
    const swipeState = leaderboardSwipeRef.current;
    if (swipeState.pointerId !== event.pointerId) return;

    if (navigateFromLeaderboardSwipe(swipeState)) return;
    resetLeaderboardSwipe();
  }, [navigateFromLeaderboardSwipe, resetLeaderboardSwipe]);

  const handleLeaderboardSwipeTouchStart = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    resetLeaderboardSwipe();
    if (isLeaderboardViewToggleTarget(event.target)) return;
    if (isLeaderboardProfileOpenTarget(event.target)) return;
    if (isLeaderboardAwardsInfoTarget(event.target)) return;
    if (!shouldUseLeaderboardTouchFallback() || event.touches.length !== 1 || !isMobileLeaderboardSwipeViewport()) return;

    const touch = event.touches[0];
    leaderboardSwipeRef.current = getStartMobileLeaderboardSwipeState(touch.identifier, touch.clientX, touch.clientY);
  }, [resetLeaderboardSwipe, shouldUseLeaderboardTouchFallback]);

  const handleLeaderboardSwipeTouchMove = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!shouldUseLeaderboardTouchFallback()) return;

    const swipeState = leaderboardSwipeRef.current;
    if (!swipeState.active || swipeState.consumed || swipeState.pointerId == null) return;

    const touch = Array.from(event.touches).find((currentTouch) => currentTouch.identifier === swipeState.pointerId);
    if (!touch) return;

    const nextSwipeState = getUpdatedMobileLeaderboardSwipeState(swipeState, touch.identifier, touch.clientX, touch.clientY);
    leaderboardSwipeRef.current = nextSwipeState;
    if (!navigateFromLeaderboardSwipe(nextSwipeState)) return;

    event.preventDefault();
  }, [navigateFromLeaderboardSwipe, shouldUseLeaderboardTouchFallback]);

  const handleLeaderboardSwipeTouchEnd = useCallback((event: ReactTouchEvent<HTMLElement>) => {
    if (!shouldUseLeaderboardTouchFallback()) return;

    const swipeState = leaderboardSwipeRef.current;
    if (swipeState.pointerId == null) return;
    if (!Array.from(event.changedTouches).some((touch) => touch.identifier === swipeState.pointerId)) return;

    if (navigateFromLeaderboardSwipe(swipeState)) return;
    resetLeaderboardSwipe();
  }, [navigateFromLeaderboardSwipe, resetLeaderboardSwipe, shouldUseLeaderboardTouchFallback]);

  const handleLeaderboardSwipeClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressLeaderboardSwipeClickRef.current) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(".leaderboardViewToggleBtn")) {
      suppressLeaderboardSwipeClickRef.current = false;
      return;
    }
    if (target?.closest("[data-leaderboard-profile-open]")) {
      suppressLeaderboardSwipeClickRef.current = false;
      return;
    }
    if (target?.closest(".leaderboardWeeklyAwardsInfoBtn")) {
      suppressLeaderboardSwipeClickRef.current = false;
      return;
    }

    suppressLeaderboardSwipeClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleLeaderboardViewAnimationEnd = useCallback((event: ReactAnimationEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.classList.contains("leaderboardCardEnter")) return;
    setExitingLeaderboardView(null);
  }, []);

  const renderLeaderboardPanel = (
    view: LeaderboardView,
    transitionClassName: "leaderboardCardEnter" | "leaderboardCardExit",
    isExiting = false
  ) => {
    if (view === "weekly") {
      return (
        <section
          key={`leaderboard-${view}-${transitionClassName}`}
          className={`dashboardCard leaderboardCard leaderboardWeeklyBoard leaderboardGlobalBoard ${transitionClassName}`}
          id="leaderboardWeeklyPanel"
          role="tabpanel"
          aria-labelledby="leaderboardWeeklyTab"
          aria-label="Weekly leaderboard rankings"
          aria-hidden={isExiting || undefined}
          inert={isExiting ? true : undefined}
        >
          <button
            className="iconBtn leaderboardWeeklyAwardsInfoBtn"
            type="button"
            aria-label="Weekly awards information"
            onClick={(event) => {
              event.stopPropagation();
              setWeeklyAwardsInfoOpen(true);
            }}
          >
            ?
          </button>
          <div className="leaderboardGlobalStage leaderboardWeeklyPodiumStage" aria-label={`Weekly ladder. Time remaining ${weeklyPeriodRemainingLabel}.`}>
            <div className="leaderboardWeeklyPeriodOverlay" aria-label={`Week ends in ${weeklyPeriodRemainingLabel}.`}>
              <span className="leaderboardWeeklyPeriodTitle">Week ends in:</span>
              <span className="leaderboardWeeklyPeriodCountdown">{weeklyPeriodRemainingLabel}</span>
            </div>
            {leaderboardState === "ready" && hasWeeklyRows ? (
              <LeaderboardPodiumDeck
                rows={orderedWeeklyPodiumRows}
                ariaLabel="Weekly top three podium"
                formatMetric={(profile) => formatLeaderboardTrend(profile.weeklyXpGain)}
                onOpenProfile={openWeeklyLeaderboardProfile}
              />
            ) : null}
          </div>
          {leaderboardState === "ready" && hasWeeklyRows ? (
            <LeaderboardSharedTable
              rows={weeklyTableRows}
              metricHeader="XP Gain"
              ariaLabel="Weekly leaderboard table"
              className="leaderboardGlobalTableWrap"
              rankBeforeMetric
              friendUidSet={leaderboardFriendUidSet}
              formatMetric={(profile) => formatLeaderboardTrend(profile.weeklyXpGain)}
              onOpenProfile={openWeeklyLeaderboardProfile}
            />
          ) : (
            leaderboardState === "ready" ? null : (
              <div className="leaderboardPanelText">
                {leaderboardState === "loading" ? renderLeaderboardLoadingText() : leaderboardError || "Could not load the leaderboard."}
              </div>
            )
          )}
        </section>
      );
    }

    if (view === "rivals") {
      return (
        <section
          key={`leaderboard-${view}-${transitionClassName}`}
          className={`dashboardCard leaderboardCard leaderboardWeeklyBoard rankRivalsBoard ${transitionClassName}`}
          id="leaderboardRivalsPanel"
          role="tabpanel"
          aria-labelledby="leaderboardRivalsTab"
          aria-label="Rank Rivals leaderboard rankings"
          aria-hidden={isExiting || undefined}
          inert={isExiting ? true : undefined}
        >
          {leaderboardState === "ready" && hasRivalRows && rankRivalLadder ? (
            <RankRivalsLadder viewModel={rankRivalLadder} onOpenProfile={openLeaderboardProfile} />
          ) : (
            leaderboardState === "ready" ? null : (
              <div className="leaderboardPanelText">
                {leaderboardState === "loading" ? renderLeaderboardLoadingText() : leaderboardError || "Could not load the leaderboard."}
              </div>
            )
          )}
        </section>
      );
    }

    return (
      <section
        key={`leaderboard-${view}-${transitionClassName}`}
        className={`dashboardCard leaderboardCard leaderboardGlobalBoard ${transitionClassName}`}
        id="leaderboardGlobalPanel"
        role="tabpanel"
        aria-labelledby="leaderboardGlobalTab"
        aria-label="Global leaderboard rankings"
        aria-hidden={isExiting || undefined}
        inert={isExiting ? true : undefined}
      >
        {leaderboardState === "ready" && hasGlobalRows ? (
          <>
            <div className="leaderboardGlobalStage leaderboardWeeklyPodiumStage leaderboardGlobalPodiumStage" aria-label="Global ladder. Top XP earners of all time.">
              <LeaderboardPodiumDeck
                rows={orderedGlobalPodiumRows}
                ariaLabel="Global top three podium"
                formatMetric={(profile) => formatLeaderboardXp(profile.rewardTotalXp)}
                onOpenProfile={openLeaderboardProfile}
              />
            </div>

            <LeaderboardSharedTable
              rows={globalTableRows}
              metricHeader="Total XP"
              ariaLabel="Global leaderboard table"
              className="leaderboardGlobalTableWrap"
              rankBeforeMetric
              friendUidSet={leaderboardFriendUidSet}
              formatMetric={(profile) => formatLeaderboardXp(profile.rewardTotalXp)}
              onOpenProfile={openLeaderboardProfile}
            />
          </>
        ) : (
          leaderboardState === "ready" ? null : (
            <div className="leaderboardPanelText">
              {leaderboardState === "loading" ? renderLeaderboardLoadingText() : leaderboardError || "Could not load the leaderboard."}
            </div>
          )
        )}
      </section>
    );
  };

  return (
    <>
      <TaskTimerAppFrame
        activePage={initialPage}
        currentRankId={displayedRewardProgress.currentRankId}
        desktopPromotionHoldRankId={activeRankPromotion?.previousRankId || null}
        desktopInsigniaUpgrade={desktopInsigniaUpgrade}
        achievementSoundsEnabled={achievementSoundsEnabled}
        currentUserAvatarSrc={currentUserAvatarSrc}
        currentUserAvatarInitials={currentUserAvatarInitials}
        currentUserLabel={currentUserLabel}
        rewardsHeader={rewardsHeader}
        isXpCountAnimating={isXpCountAnimating}
        isXpAwardSpotlightActive={isXpAwardSpotlightActive}
        onTestRankPromotion={(rankId) => {
          const promotion = buildRankPromotionTestPayload(rankId);
          if (!promotion) return;
          setPendingRankPromotion(null);
          setActiveRankPromotion(promotion);
        }}
        xpAwardFx={xpAwardFx}
      >
        <div className="appPages">
          <section className={`appPage appPageTasks${initialPage === "tasks" || initialPage === "schedule" ? " appPageOn" : ""}`} id="appPageTasks" aria-label="Tasks page">
            <div className="tasksTopRow">
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
                  <AppImg className="taskScreenIconBtnImage taskScreenAddTaskBtnImage" src="/icons/icons_default/add_new.png" alt="" aria-hidden="true" />
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
                      <button className="tasksModeMenuItem" type="button" data-task-order-by="dateAdded" role="menuitem">
                        Date Added
                      </button>
                      <button className="tasksModeMenuItem isOn" type="button" data-task-order-by="custom" role="menuitem">
                        Custom
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            </div>
            <section className="modeView modeViewOn" id="mode1View" aria-label="Tasks view">
              <div className="list" id="taskList" />
              <HistoryScreen />
              <FocusModeScreen />
              <SchedulePageContent active={initialPage === "schedule"} />
            </section>
          </section>

          <DashboardPageContent active={initialPage === "dashboard"} />

          <SessionNotesPageContent active={initialPage === "notes"} />

          <section className={`appPage${initialPage === "friends" ? " appPageOn" : ""}`} id="appPageFriends" aria-label="Friends page">
            <div className="friendsShell" id="groupsFriendsSection">
              {!isAuthenticated ? (
                <SignedOutPrompt message="You will need to create an account or sign in to use Friends" />
              ) : null}
              <div className="friendTopRow">
                <div className="friendPageHeaderActions">
                  <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button" aria-label="Add Friend" title="Add Friend" disabled={!isAuthenticated}>
                    <AppImg
                      className="friendRequestBtnIcon"
                      src="/icons/icons_default/add_new.png"
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>

              <div className="dashboardGrid">
                <section className="dashboardCard" aria-label="Friends list">
                  <div className="dashboardCardTitle" id="groupsFriendsTitle">
                    Friends | 0
                  </div>
                  <div id="groupsFriendsList" className="settingsDetailNote" />
                </section>

                <section className="dashboardCard" aria-label="Incoming requests">
                  <details id="groupsIncomingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsIncomingRequestsTitle">
                      Incoming requests | 0
                    </summary>
                    <div id="groupsIncomingRequestsList" className="settingsDetailNote isEmptyStatus">
                      No incoming requests.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Outgoing requests">
                  <details id="groupsOutgoingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsOutgoingRequestsTitle">
                      Outgoing requests | 0
                    </summary>
                    <div id="groupsOutgoingRequestsList" className="settingsDetailNote isEmptyStatus">
                      No outgoing requests.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Tasks shared by you">
                  <details id="groupsSharedByYouDetails">
                    <summary className="dashboardCardTitle" id="groupsSharedByYouTitle">
                      Shared by you | 0
                    </summary>
                    <div id="groupsSharedByYouList" className="settingsDetailNote">
                      No shared tasks.
                    </div>
                  </details>
                </section>
              </div>
            </div>
          </section>

          <section
            className={`appPage${initialPage === "leaderboard" ? " appPageOn" : ""}`}
            id="appPageLeaderboard"
            aria-label="Leaderboards page"
            onPointerDown={handleLeaderboardSwipePointerDown}
            onPointerMove={handleLeaderboardSwipePointerMove}
            onPointerUp={handleLeaderboardSwipePointerEnd}
            onPointerCancel={resetLeaderboardSwipe}
            onTouchStart={handleLeaderboardSwipeTouchStart}
            onTouchMove={handleLeaderboardSwipeTouchMove}
            onTouchEnd={handleLeaderboardSwipeTouchEnd}
            onTouchCancel={resetLeaderboardSwipe}
            onClickCapture={handleLeaderboardSwipeClickCapture}
          >
            <div className="dashboardShell leaderboardShell">
              {leaderboardState === "signedOut" ? (
                <SignedOutPrompt message="Sign in to view the leaderboard" />
              ) : (
                <>
                  <div className="leaderboardViewHeader">
                    <div className="leaderboardViewToggle" role="tablist" aria-label="Leaderboard view">
                      <button
                        className={`btn btn-ghost small leaderboardViewToggleBtn${leaderboardView === "global" ? " isOn" : ""}`}
                        id="leaderboardGlobalTab"
                        type="button"
                        role="tab"
                        aria-controls="leaderboardGlobalPanel"
                        aria-selected={leaderboardView === "global"}
                        onClick={() => selectLeaderboardView("global")}
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
                        onClick={() => selectLeaderboardView("weekly")}
                      >
                        Weekly
                      </button>
                      <button
                        className={`btn btn-ghost small leaderboardViewToggleBtn${leaderboardView === "rivals" ? " isOn" : ""}`}
                        id="leaderboardRivalsTab"
                        type="button"
                        role="tab"
                        aria-controls="leaderboardRivalsPanel"
                        aria-selected={leaderboardView === "rivals"}
                        onClick={() => selectLeaderboardView("rivals")}
                      >
                        Rank Rivals
                      </button>
                    </div>
                  </div>

                  <div
                    className={`leaderboardScrollBody leaderboardTransition${leaderboardTransitionDirection === "next" ? "Next" : "Previous"}${exitingLeaderboardView ? " isTransitioning" : ""}`}
                    onAnimationEnd={handleLeaderboardViewAnimationEnd}
                  >
                    {exitingLeaderboardView ? renderLeaderboardPanel(exitingLeaderboardView, "leaderboardCardExit", true) : null}
                    {renderLeaderboardPanel(leaderboardView, "leaderboardCardEnter")}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className={`appPage${initialPage === "history" ? " appPageOn" : ""}`} id="appPageHistory" aria-label="History Manager page">
            <HistoryManagerScreen />
          </section>
        </div>

        <EditTaskOverlay />
        <AddTaskOverlay />
      </TaskTimerAppFrame>

      {activeLeaderboardMovement ? (
        <div
          className="overlay primitiveSciFiModalOverlay leaderboardMovementPrimitiveOverlay"
          id="leaderboardMovementOverlay"
          style={{ display: "flex" }}
          onClick={closeLeaderboardMovementModal}
        >
          <div
            className="primitiveSciFiModal leaderboardMovementModal leaderboardMovementPrimitiveModal"
            role="dialog"
            aria-modal="true"
            aria-label="Leaderboard position changed"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="primitiveSciFiModalHeader leaderboardMovementPrimitiveHeader">
              <h2>Position Changed</h2>
            </header>
            <div
              className="primitiveSciFiModalBody leaderboardMovementPrimitiveBody"
              onClick={advanceLeaderboardMovementModal}
            >
              <div className="leaderboardMovementSlideViewport">
                <div
                  className="leaderboardMovementSlideTrack"
                  style={leaderboardMovementSlideStyle}
                >
                  {activeLeaderboardMovementSequence.map((change, index) => (
                    <section
                      className="leaderboardMovementSlidePanel"
                      aria-hidden={index === activeLeaderboardMovementIndex ? undefined : true}
                      key={`${change.boardId}-${change.previousRank}-${change.currentRank}-${index}`}
                    >
                      <p className="leaderboardMovementBoardLabel">{change.boardLabel}</p>
                      <p className="leaderboardMovementSummary">
                        You moved from {formatLeaderboardMovementRank(change.previousRank)} to{" "}
                        {formatLeaderboardMovementRank(change.currentRank)}.
                      </p>
                      <LeaderboardMovementTable change={change} />
                    </section>
                  ))}
                </div>
              </div>
            </div>
            <footer className="primitiveSciFiModalFooter leaderboardMovementPrimitiveFooter">
              <button
                className="modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction leaderboardMovementPrimitiveAction leaderboardMovementPrimitiveSecondaryAction"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  closeLeaderboardMovementModal();
                }}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {selectedLeaderboardProfile ? (
        <div className="overlay primitiveSciFiModalOverlay leaderboardPositionPrimitiveOverlay" id="leaderboardPositionOverlay" onClick={closeLeaderboardPositionModal}>
          <div
            className="modal leaderboardPositionModal leaderboardPositionPrimitiveModal isLeaderboardPositionRevealing"
            role="dialog"
            aria-modal="true"
            aria-label="User summary"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="friendUserSummaryBorderTrace" aria-hidden="true">
              <span className="friendUserSummaryBorderTraceEdge isTop" />
              <span className="friendUserSummaryBorderTraceEdge isRight" />
              <span className="friendUserSummaryBorderTraceEdge isBottom" />
              <span className="friendUserSummaryBorderTraceEdge isLeft" />
            </span>
            <div className="leaderboardPositionRevealBody leaderboardPositionPrimitiveBody">
              <div className="leaderboardPositionModalHeaderRow leaderboardPositionPrimitiveHeader">
                <p className="modalSubtext leaderboardUserSummaryTitle">User Summary</p>
              </div>
              <div className="leaderboardPositionModalHeader">
                <div className="leaderboardPositionModalIdentity">
                  <LeaderboardAvatar profile={selectedLeaderboardProfile} />
                  <div className="leaderboardPositionModalIdentityText">
                    <strong
                      className="leaderboardName leaderboardPositionName"
                    >
                      {selectedLeaderboardLabel}
                    </strong>
                    {selectedLeaderboardMemberSince ? (
                      <span className="leaderboardMemberSince">Member since {selectedLeaderboardMemberSince}</span>
                    ) : null}
                  </div>
                  <div className="leaderboardPositionAchievementSlots" aria-label="Achievement badges">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <span
                        className="leaderboardPositionAchievementSlot"
                        key={`leaderboard-achievement-slot-${index}`}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
                <div className="leaderboardPositionRankSummary">
                  <LeaderboardRankInsignia profile={selectedLeaderboardProfile} />
                  <strong style={{ "--leaderboard-rank-color": getLeaderboardRankColor() } as CSSProperties}>{getLeaderboardRankLabel(selectedLeaderboardProfile)}</strong>
                </div>
              </div>
              <div className="leaderboardPositionStats" aria-label="User stats">
                <div className="leaderboardPositionStatsTitle">User Stats</div>
                <div>
                  <strong>{formatLeaderboardXp(selectedLeaderboardProfile.rewardTotalXp)}</strong>
                  <span>Total XP</span>
                </div>
                <div>
                  <strong>{formatDashboardDurationShort(selectedLeaderboardProfile.totalFocusMs)}</strong>
                  <span>Time Logged</span>
                </div>
                <div>
                  <strong>{formatLeaderboardTaskCount(selectedLeaderboardProfile.completedTaskCount)}</strong>
                  <span>Tasks Completed</span>
                </div>
              </div>
              <div className="confirmBtns leaderboardPositionPrimitiveFooter">
                <button
                  className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction leaderboardPositionPrimitiveAction leaderboardPositionPrimitiveSecondaryAction"
                  type="button"
                  onClick={closeLeaderboardPositionModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {weeklyAwardsInfoOpen ? (
        <div className="overlay standardModalOverlay" id="weeklyAwardsInfoOverlay" style={{ display: "flex" }} onClick={closeWeeklyAwardsInfoModal}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Weekly awards information" onClick={(event) => event.stopPropagation()}>
            <p className="modalSubtext">Weekly awards coming soon</p>
            <div className="confirmBtns">
              <button className="btn btn-ghost" type="button" onClick={closeWeeklyAwardsInfoModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
          previousRankId={activeRankPromotion.previousRankId}
          previousRankLabel={activeRankPromotion.previousRankLabel}
          nextRankId={activeRankPromotion.nextRankId}
          nextRankLabel={activeRankPromotion.nextRankLabel}
          achievementSoundsEnabled={achievementSoundsEnabled}
          onPresentationStart={() => {
            startRankPromotionCelebration(document);
          }}
          onClose={() => {
            stopRankPromotionCelebration(document);
            if (!isMobileTaskToolbarViewport()) {
              desktopInsigniaUpgradeSeqRef.current += 1;
              setDesktopInsigniaUpgrade({
                seq: desktopInsigniaUpgradeSeqRef.current,
                previousRankId: activeRankPromotion.previousRankId,
                nextRankId: activeRankPromotion.nextRankId,
              });
            }
            setActiveRankPromotion(null);
            setPromotionOverlayRetrySeq((current) => current + 1);
          }}
        />
      ) : null}
      <TaskLaunchOnboarding preferences={cachedPreferences} />
    </>
  );
}
