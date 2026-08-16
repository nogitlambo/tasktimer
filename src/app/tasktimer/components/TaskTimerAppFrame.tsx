"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import AppImg from "@/components/AppImg";
import DesktopAppRail from "./DesktopAppRail";
import RankLadderModal from "./RankLadderModal";
import RankThumbnail from "./RankThumbnail";
import ModuleIntroTour from "./ModuleIntroTour";
import {
  RANK_LADDER,
  buildRankLadderSummary,
  buildXpProgressSubtext,
  getRankLadderThumbnailSrc,
  type RankPromotionRecord,
} from "../lib/rewards";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";

type MainAppPage = "tasks" | "schedule" | "dashboard" | "notes" | "executive" | "friends" | "leaderboard" | "history";

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
  useClientNavButtons?: boolean;
  mobileToolbar?: ReactNode;
  currentRankId: string;
  rankPromotionsById: Record<string, RankPromotionRecord>;
  desktopPromotionHoldRankId?: string | null;
  desktopInsigniaUpgrade?: DesktopInsigniaUpgradePayload | null;
  achievementSoundsEnabled?: boolean;
  currentUserAvatarSrc?: string;
  currentUserAvatarInitials?: string;
  currentUserLabel?: string;
  rewardsHeader: {
    rankLabel: string;
    totalXp: number;
    progressPct: number;
    progressLabel: string;
    xpToNext: number | null;
  };
  isXpCountAnimating?: boolean;
  isXpAwardSpotlightActive?: boolean;
  onTestRankPromotion?: (rankId: string) => void;
  xpAwardFx?: {
    visible: boolean;
    payloads: Array<{
      id: string;
      text?: string;
      style: CSSProperties | null;
      className?: string;
    }>;
  };
};

export type DesktopInsigniaUpgradePayload = {
  seq: number;
  previousRankId: string;
  nextRankId: string;
};

const DEFAULT_INITIAL_AUTH_BUSY_TEXT = "Loading your workspace into this session...";
const LEADERBOARD_INITIAL_AUTH_BUSY_TEXT = "Loading leaderboard standings";
const DESKTOP_INSIGNIA_UPGRADE_START_DELAY_MS = 600;
const DESKTOP_INSIGNIA_UPGRADE_ACTIVE_DURATION_MS = 3400;

function formatXpNumber(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

function normalizeRankId(value: string | null | undefined) {
  return String(value || "").trim();
}

export function getDesktopHeaderRankId(
  currentRankId: string,
  desktopPromotionHoldRankId?: string | null,
  activeUpgrade?: Pick<DesktopInsigniaUpgradePayload, "nextRankId"> | null
) {
  return normalizeRankId(activeUpgrade?.nextRankId) || normalizeRankId(desktopPromotionHoldRankId) || normalizeRankId(currentRankId);
}

export function shouldRenderDesktopInsigniaUpgrade(
  upgrade: DesktopInsigniaUpgradePayload | null | undefined,
  activeSeq: number | null
) {
  return !!upgrade && upgrade.seq === activeSeq && normalizeRankId(upgrade.previousRankId) !== "" && normalizeRankId(upgrade.nextRankId) !== "";
}

export function getDesktopInsigniaUpgradeAudioCallback(achievementSoundsEnabled: boolean, playAudio: () => void) {
  return achievementSoundsEnabled ? playAudio : () => {};
}

type DesktopInsigniaUpgradeTimerApi = Pick<typeof globalThis, "setTimeout" | "clearTimeout">;

export function scheduleDesktopInsigniaUpgradeActivation(
  upgrade: DesktopInsigniaUpgradePayload,
  timerApi: DesktopInsigniaUpgradeTimerApi,
  setActiveSeq: (updater: (current: number | null) => number | null) => void,
  playAudio: () => void
) {
  let clearTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  const startTimer = timerApi.setTimeout(() => {
    setActiveSeq(() => upgrade.seq);
    playAudio();
    clearTimer = timerApi.setTimeout(() => {
      setActiveSeq((current) => current === upgrade.seq ? null : current);
    }, DESKTOP_INSIGNIA_UPGRADE_ACTIVE_DURATION_MS);
  }, DESKTOP_INSIGNIA_UPGRADE_START_DELAY_MS);

  return () => {
    timerApi.clearTimeout(startTimer);
    if (clearTimer) timerApi.clearTimeout(clearTimer);
  };
}

function playDesktopInsigniaUpgradeAudio() {
  if (typeof window === "undefined") return;
  try {
    const audio = new Audio("/insignia_upgrade.mp3");
    audio.preload = "auto";
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for the header upgrade UI.
  }
}

export function getXpProgressSubtext(totalXp: number, xpToNext: number | null) {
  return buildXpProgressSubtext(totalXp, xpToNext);
}

export default function TaskTimerAppFrame({
  activePage,
  children,
  useClientNavButtons = activePage !== "history",
  mobileToolbar = null,
  currentRankId,
  rankPromotionsById,
  desktopPromotionHoldRankId = null,
  desktopInsigniaUpgrade = null,
  achievementSoundsEnabled = true,
  currentUserAvatarSrc = "",
  currentUserAvatarInitials = "U",
  currentUserLabel = "User",
  rewardsHeader,
  isXpCountAnimating = false,
  isXpAwardSpotlightActive = false,
  onTestRankPromotion,
  xpAwardFx,
}: TaskTimerAppFrameProps) {
  const isLeaderboardPage = activePage === "leaderboard";
  const initialAuthBusyText = isLeaderboardPage ? LEADERBOARD_INITIAL_AUTH_BUSY_TEXT : DEFAULT_INITIAL_AUTH_BUSY_TEXT;
  const initialAuthBusyHeading = isLeaderboardPage ? "Loading leaderboard standings" : "Loading your workspace";
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [activeDesktopInsigniaUpgradeSeq, setActiveDesktopInsigniaUpgradeSeq] = useState<number | null>(null);
  const railPage = activePage === "schedule" ? "tasks" : activePage;
  const currentRankIndex = useMemo(
    () => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === currentRankId)),
    [currentRankId]
  );
  const showMaxXpAlert = rewardsHeader.xpToNext == null;
  const rankSummary = useMemo(() => buildRankLadderSummary(rewardsHeader.totalXp), [rewardsHeader.totalXp]);
  const xpProgressSubtext = getXpProgressSubtext(rewardsHeader.totalXp, rewardsHeader.xpToNext);
  const topbarUserLabel = currentUserLabel.toLocaleLowerCase();
  const rankThumbnailSrc = useMemo(() => getRankLadderThumbnailSrc(currentRankId, ""), [currentRankId]);
  const isDesktopInsigniaUpgradeActive = shouldRenderDesktopInsigniaUpgrade(
    desktopInsigniaUpgrade,
    activeDesktopInsigniaUpgradeSeq
  );
  const desktopHeaderRankId = getDesktopHeaderRankId(
    currentRankId,
    desktopPromotionHoldRankId,
    isDesktopInsigniaUpgradeActive ? desktopInsigniaUpgrade : null
  );

  useEffect(() => {
    if (!desktopInsigniaUpgrade) return;
    return scheduleDesktopInsigniaUpgradeActivation(
      desktopInsigniaUpgrade,
      window,
      setActiveDesktopInsigniaUpgradeSeq,
      getDesktopInsigniaUpgradeAudioCallback(achievementSoundsEnabled, playDesktopInsigniaUpgradeAudio)
    );
  }, [achievementSoundsEnabled, desktopInsigniaUpgrade]);

  useEffect(() => {
    document.body.setAttribute("data-app-page", activePage);
  }, [activePage]);

  const handleOpenMobileAccount = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = resolveTaskTimerRouteHref("/account");
  }, []);

  const openRankLadderWithDropdownAudio = useCallback(() => {
    setShowRankLadderModal(true);
  }, []);

  return (
    <div className={`wrap${isXpAwardSpotlightActive ? " isXpAwardSpotlightActive" : ""}`} id="app" aria-label="TaskLaunch App">
      <div className="topbar topbarBrandOnly taskLaunchAppTopbar">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg
            className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
            src="/logo/tasklaunch-logo.webp"
            alt=""
          />
          <span className="appBrandLandingReplicaText">TaskLaunch</span>
          <section className={`taskLaunchTopbarXp${isXpAwardSpotlightActive ? " isXpAwardSpotlightTarget" : ""}`} aria-label="XP progress">
              <div className="taskLaunchTopbarXpBody">
                <div className="taskLaunchTopbarXpBottomRow">
                  <button
                    className="taskLaunchTopbarXpAvatarTrigger taskLaunchTopbarXpTrigger"
                    type="button"
                    aria-label="Open account settings"
                    onClick={handleOpenMobileAccount}
                  >
                    <span className="taskLaunchTopbarXpAvatarWrap" aria-hidden="true">
                      {currentUserAvatarSrc ? (
                        <AppImg className="taskLaunchTopbarXpAvatarImg" src={currentUserAvatarSrc} alt="" referrerPolicy={/^https?:\/\//i.test(currentUserAvatarSrc) ? "no-referrer" : undefined} />
                      ) : (
                        <span className="taskLaunchTopbarXpAvatarFallback">{currentUserAvatarInitials}</span>
                      )}
                    </span>
                  </button>
                  <span className="taskLaunchTopbarXpMeta">
                    <span className="taskLaunchTopbarXpUserName" title={topbarUserLabel}>
                      {topbarUserLabel}
                    </span>
                    <button
                      className="taskLaunchTopbarXpStatsTrigger taskLaunchTopbarXpTrigger"
                      type="button"
                      data-rank-ladder-open
                      aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}. ${xpProgressSubtext}.`}
                      onClick={openRankLadderWithDropdownAudio}
                    >
                      <span className="taskLaunchTopbarXpStats">
                        <span className="appShellHeaderXpStatsRow taskLaunchTopbarXpStatsRow">
                          <span className="taskLaunchTopbarXpRankWrap" aria-label={`Current rank: ${rewardsHeader.rankLabel}`}>
                            <span className="taskLaunchTopbarXpRank">{rewardsHeader.rankLabel}</span>
                          </span>
                          <div
                            className="taskLaunchTopbarXpTrack"
                            role="progressbar"
                            aria-label="XP progress toward the next rank"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(rewardsHeader.progressPct)}
                          >
                            <span className="taskLaunchTopbarXpFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
                          </div>
                          <strong
                            className={`taskLaunchTopbarXpValue${isXpCountAnimating ? " isAnimatingXpCount" : ""}`}
                            id="taskLaunchTopbarXpValue"
                          >
                            {formatXpNumber(rewardsHeader.totalXp)} XP
                            {showMaxXpAlert ? <span className="taskLaunchXpValueAlert" aria-hidden="true"> !</span> : null}
                          </strong>
                        </span>
                      </span>
                    </button>
                  </span>
                </div>
              </div>
            </section>
        </div>
      </div>
      {mobileToolbar ? <div className="taskLaunchMobileToolbar">{mobileToolbar}</div> : null}
      <div className="desktopAppShell">
        <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showMobileFooter={false} />
        <div className="desktopAppMain">
          <div className="appShellHeader">
            <div className="appShellHeaderSpacer" aria-hidden="true" />
            <section className={`appShellHeaderXp${isXpAwardSpotlightActive ? " isXpAwardSpotlightTarget" : ""}`} aria-label="XP progress">
              <div className="appShellHeaderXpBody">
                <button
                  className="appShellHeaderXpBottomRow appShellHeaderXpTrigger"
                  type="button"
                  data-rank-ladder-open
                  aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}. ${xpProgressSubtext}.`}
                  onClick={openRankLadderWithDropdownAudio}
                >
                  <span className="appShellHeaderXpStats">
                    <span className="appShellHeaderXpStatsRow">
                      <span className="appShellHeaderXpRankWrap" aria-label={`Current rank insignia: ${rewardsHeader.rankLabel}`}>
                        {isDesktopInsigniaUpgradeActive && desktopInsigniaUpgrade ? (
                          <span className="appShellHeaderXpInsigniaUpgradeShell" data-insignia-upgrade-seq={desktopInsigniaUpgrade.seq}>
                            <RankThumbnail
                              rankId={desktopInsigniaUpgrade.previousRankId}
                              className="appShellHeaderXpInsigniaShell appShellHeaderXpInsigniaLayer isOld"
                              imageClassName="appShellHeaderXpInsigniaImg"
                              placeholderClassName="appShellHeaderXpInsigniaPlaceholder"
                              alt=""
                              size={24}
                              aria-hidden
                            />
                            <RankThumbnail
                              rankId={desktopInsigniaUpgrade.nextRankId}
                              className="appShellHeaderXpInsigniaShell appShellHeaderXpInsigniaLayer isNew"
                              imageClassName="appShellHeaderXpInsigniaImg"
                              placeholderClassName="appShellHeaderXpInsigniaPlaceholder"
                              alt=""
                              size={24}
                              aria-hidden
                            />
                          </span>
                        ) : (
                          <RankThumbnail
                            rankId={desktopHeaderRankId}
                            className="appShellHeaderXpInsigniaShell"
                            imageClassName="appShellHeaderXpInsigniaImg"
                            placeholderClassName="appShellHeaderXpInsigniaPlaceholder"
                            alt=""
                            size={24}
                            aria-hidden
                          />
                        )}
                        <span className="appShellHeaderXpRank">{rewardsHeader.rankLabel}</span>
                      </span>
                      <span className="appShellHeaderXpTrackWrap">
                        <div
                          className="appShellHeaderXpTrack"
                          role="progressbar"
                          aria-label="XP progress toward the next rank"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(rewardsHeader.progressPct)}
                        >
                          <span className="appShellHeaderXpFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
                        </div>
                      </span>
                      <span className="appShellHeaderXpValueWrap">
                        <strong
                          className={`appShellHeaderXpValue${isXpCountAnimating ? " isAnimatingXpCount" : ""}`}
                          id="appShellHeaderXpValue"
                        >
                          {formatXpNumber(rewardsHeader.totalXp)} XP
                          {showMaxXpAlert ? <span className="appShellXpValueAlert" aria-hidden="true"> !</span> : null}
                        </strong>
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </section>
          </div>
          {children}
        </div>
      </div>
      <RankLadderModal
        open={showRankLadderModal}
        onClose={() => setShowRankLadderModal(false)}
        totalXp={rewardsHeader.totalXp}
        rankSummary={rankSummary}
        currentRankId={currentRankId}
        currentRankIndex={currentRankIndex}
        rankPromotionsById={rankPromotionsById}
        rankThumbnailSrc={rankThumbnailSrc}
        canSelectRankInsignia={false}
        onSelectRankThumbnail={async () => {}}
        onTestRankPromotion={(rankId) => {
          setShowRankLadderModal(false);
          onTestRankPromotion?.(rankId);
        }}
      />
      <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showDesktopRail={false} showMobileFooter />
      <ModuleIntroTour />
      <div
        className={`initialAuthBusyOverlay${isLeaderboardPage ? "" : " isOn"}`}
        id="initialAuthBusyOverlay"
        aria-hidden={isLeaderboardPage ? "true" : "false"}
        tabIndex={-1}
      >
        <div className="initialAuthBusyPanel" role="status" aria-live="polite" aria-atomic="true">
          <h2 className="sr-only">{initialAuthBusyHeading}</h2>
          <p
            className={`modalSubtext confirmText${isLeaderboardPage ? " leaderboardLoadingText" : ""}`}
            id="initialAuthBusyText"
            aria-label={isLeaderboardPage ? `${initialAuthBusyText}...` : undefined}
          >
            {initialAuthBusyText}
          </p>
        </div>
      </div>
      <div className="cloudSyncNoticeHost" id="cloudSyncNoticeHost" aria-live="polite" aria-atomic="true" />
      <div className="actionConfirmationHost" id="actionConfirmationHost" role="status" aria-live="polite" aria-atomic="true" aria-hidden="true" />
      {isXpAwardSpotlightActive ? <div className="xpAwardSpotlightLayer" aria-hidden="true" /> : null}
      {xpAwardFx?.visible ? (
        <div className="xpAwardFxLayer" aria-hidden="true">
          {xpAwardFx.payloads.map((payload) =>
            payload.style ? (
              <span key={payload.id} className={`xpAwardFxPayload${payload.className ? ` ${payload.className}` : ""}`} style={payload.style}>
                {payload.text || ""}
              </span>
            ) : null
          )}
        </div>
      ) : null}
    </div>
  );
}
