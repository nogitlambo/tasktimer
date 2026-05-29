"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import AppImg from "@/components/AppImg";
import { usePathname, useSearchParams } from "next/navigation";
import DesktopAppRail from "./DesktopAppRail";
import RankLadderModal from "./RankLadderModal";
import RankThumbnail from "./RankThumbnail";
import { playTaskFlipClickAudio } from "../client/secondary-click-audio";
import { RANK_LADDER, buildXpProgressSubtext, getNextRank, getRankLadderThumbnailSrc } from "../lib/rewards";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";
import { getErrorMessage, handleSignOutFlow } from "./settings/settingsAccountService";

type MainAppPage = "tasks" | "schedule" | "dashboard" | "friends" | "leaderboard" | "history";

type TaskLaunchMobileMenuLinkItem = {
  kind: "link";
  label: string;
  href: string;
  iconSrc: string;
};

type TaskLaunchMobileMenuActionItem = {
  kind: "signOut";
  label: string;
  iconSrc: string;
};

type TaskLaunchMobileMenuItem = TaskLaunchMobileMenuLinkItem | TaskLaunchMobileMenuActionItem;

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
  useClientNavButtons?: boolean;
  mobileToolbar?: ReactNode;
  currentRankId: string;
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
  promotionLabelOverride?: string | null;
  isXpCountAnimating?: boolean;
  isXpAwardSpotlightActive?: boolean;
  onTestRankPromotion?: (rankId: string) => void;
  xpAwardFx?: {
    visible: boolean;
    payloadStyle: CSSProperties | null;
    deltaText: string | null;
  };
};

export type DesktopInsigniaUpgradePayload = {
  seq: number;
  previousRankId: string;
  nextRankId: string;
};

const DESKTOP_INSIGNIA_UPGRADE_START_DELAY_MS = 600;
const DESKTOP_INSIGNIA_UPGRADE_ACTIVE_DURATION_MS = 3400;
const MOBILE_MENU_SWIPE_CLOSE_START_ZONE_PX = 78;
const MOBILE_MENU_SWIPE_CLOSE_THRESHOLD_PX = 70;

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

export function getTaskLaunchMobileMenuItems(): TaskLaunchMobileMenuItem[] {
  return [
    {
      kind: "link",
      label: "User Guide",
      href: resolveTaskTimerRouteHref("/user-guide"),
      iconSrc: "/User_Guide.svg",
    },
    {
      kind: "link",
      label: "Settings",
      href: resolveTaskTimerRouteHref("/settings"),
      iconSrc: "/icons/icons_default/settings.png",
    },
    {
      kind: "signOut",
      label: "Sign Out",
      iconSrc: "/icons/icons_default/signout.png",
    },
  ];
}

export function getXpProgressSubtext(totalXp: number, xpToNext: number | null) {
  return buildXpProgressSubtext(totalXp, xpToNext);
}

export function getXpPromotionLabel(totalXp: number, xpToNext: number | null) {
  const nextRankLabel = getNextRank(totalXp)?.label ?? "Max rank";
  return xpToNext != null
    ? `${formatXpNumber(xpToNext)} XP to ${nextRankLabel}`
    : "Max rank reached";
}

export default function TaskTimerAppFrame({
  activePage,
  children,
  useClientNavButtons = activePage !== "history",
  mobileToolbar = null,
  currentRankId,
  desktopPromotionHoldRankId = null,
  desktopInsigniaUpgrade = null,
  achievementSoundsEnabled = true,
  currentUserAvatarSrc = "",
  currentUserAvatarInitials = "U",
  currentUserLabel = "User",
  rewardsHeader,
  promotionLabelOverride = null,
  isXpCountAnimating = false,
  isXpAwardSpotlightActive = false,
  onTestRankPromotion,
  xpAwardFx,
}: TaskTimerAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [activeDesktopInsigniaUpgradeSeq, setActiveDesktopInsigniaUpgradeSeq] = useState<number | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuSwipeCloseRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    consumed: boolean;
  }>({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    consumed: false,
  });
  const railPage = activePage === "schedule" ? "tasks" : activePage;
  const searchParamsKey = searchParams.toString();
  const currentRankIndex = useMemo(
    () => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === currentRankId)),
    [currentRankId]
  );
  const showMaxXpAlert = rewardsHeader.xpToNext == null;
  const promotionLabel = promotionLabelOverride ?? getXpPromotionLabel(rewardsHeader.totalXp, rewardsHeader.xpToNext);
  const rankSummary = rewardsHeader.xpToNext != null
    ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
    : "You have reached the highest configured rank.";
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
    setMobileMenuOpen(false);
  }, [pathname, searchParamsKey]);

  useEffect(() => {
    document.body.setAttribute("data-app-page", activePage);
  }, [activePage]);

  useEffect(() => {
    if (!mobileMenuOpen || typeof window === "undefined") return;
    const closeMobileMenuWithFlipAudio = () => {
      playTaskFlipClickAudio();
      setMobileMenuOpen(false);
    };
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileMenuRef.current?.contains(target)) return;
      if (mobileMenuBtnRef.current?.contains(target)) return;
      closeMobileMenuWithFlipAudio();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenuWithFlipAudio();
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("taskLaunchMobileMenuOpen", mobileMenuOpen);
    return () => {
      document.body.classList.remove("taskLaunchMobileMenuOpen");
    };
  }, [mobileMenuOpen]);

  const handleMobileSignOut = useCallback(async () => {
    if (signOutBusy) return;
    setMobileMenuOpen(false);
    setSignOutBusy(true);
    setSignOutError("");
    try {
      await handleSignOutFlow();
    } catch (error: unknown) {
      setSignOutError(getErrorMessage(error, "Could not sign out."));
      setSignOutBusy(false);
    }
  }, [signOutBusy]);

  const handleOpenMobileAccount = useCallback(() => {
    if (typeof window === "undefined") return;
    window.location.href = resolveTaskTimerRouteHref("/account");
  }, []);

  const resetMobileMenuSwipeClose = useCallback(() => {
    mobileMenuSwipeCloseRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      consumed: false,
    };
  }, []);

  const closeMobileMenuWithFlipAudio = useCallback(() => {
    playTaskFlipClickAudio();
    setMobileMenuOpen(false);
  }, []);

  const openRankLadderWithDropdownAudio = useCallback(() => {
    setShowRankLadderModal(true);
  }, []);

  const handleMobileMenuPanelPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    resetMobileMenuSwipeClose();
    if (event.button !== 0) return;

    const panelRect = event.currentTarget.getBoundingClientRect();
    const isInTopZone = event.clientY - panelRect.top <= MOBILE_MENU_SWIPE_CLOSE_START_ZONE_PX;
    if (!isInTopZone) return;

    mobileMenuSwipeCloseRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      consumed: false,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture failures on older embedded browsers.
    }
  }, [resetMobileMenuSwipeClose]);

  const handleMobileMenuPanelPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const swipeClose = mobileMenuSwipeCloseRef.current;
    if (!swipeClose.active || swipeClose.consumed || swipeClose.pointerId !== event.pointerId) return;

    const dx = event.clientX - swipeClose.startX;
    const dy = event.clientY - swipeClose.startY;
    if (dy <= 0 || dy < MOBILE_MENU_SWIPE_CLOSE_THRESHOLD_PX || dy <= Math.abs(dx)) return;

    event.preventDefault();
    mobileMenuSwipeCloseRef.current.consumed = true;
    closeMobileMenuWithFlipAudio();
  }, [closeMobileMenuWithFlipAudio]);

  const handleMobileMenuPanelPointerEnd = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (mobileMenuSwipeCloseRef.current.pointerId === event.pointerId) resetMobileMenuSwipeClose();
  }, [resetMobileMenuSwipeClose]);

  return (
    <div className={`wrap${isXpAwardSpotlightActive ? " isXpAwardSpotlightActive" : ""}`} id="app" aria-label="TaskLaunch App">
      <div className="topbar topbarBrandOnly taskLaunchAppTopbar">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg
            className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
            src="/logo/launch-icon-original-transparent.png"
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
                        <span className="taskLaunchTopbarXpMetaLine">{promotionLabel}</span>
                      </span>
                    </button>
                  </span>
                </div>
              </div>
            </section>
        </div>
        <button
          ref={mobileMenuBtnRef}
          className={`menuIcon taskLaunchMobileMenuBtn${mobileMenuOpen ? " isHidden" : ""}`}
          id="menuIcon"
          type="button"
          aria-label="Open app menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobileSettingsMenu"
          onClick={() => setMobileMenuOpen((current) => !current)}
        >
          <span className="taskLaunchMobileMenuBars" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>
      <div
        className={`taskLaunchMobileMenu${mobileMenuOpen ? " isOpen" : ""}`}
        id="mobileSettingsMenu"
        aria-hidden={mobileMenuOpen ? "false" : "true"}
        onClick={closeMobileMenuWithFlipAudio}
      >
        <div
          ref={mobileMenuRef}
          className="taskLaunchMobileMenuPanel"
          role="dialog"
          aria-modal="true"
          aria-label="App menu"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={handleMobileMenuPanelPointerDown}
          onPointerMove={handleMobileMenuPanelPointerMove}
          onPointerUp={handleMobileMenuPanelPointerEnd}
          onPointerCancel={handleMobileMenuPanelPointerEnd}
        >
          <div className="taskLaunchMobileMenuSwipeHandle" aria-hidden="true" />
          <div className="taskLaunchMobileMenuHeader" aria-label="TaskLaunch">
            <AppImg
              className="taskLaunchMobileMenuHeaderIcon"
              src="/logo/launch-icon-original-transparent.png"
              alt=""
              aria-hidden="true"
            />
            <span className="taskLaunchMobileMenuHeaderText">TASKLAUNCH</span>
          </div>
          <div className="taskLaunchMobileMenuList" role="menu" aria-label="App menu">
            {getTaskLaunchMobileMenuItems().map((item) =>
              item.kind === "link" ? (
                <a
                  key={item.label}
                  className="menuItem taskLaunchMobileMenuItem"
                  href={item.href}
                  role="menuitem"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="taskLaunchMobileMenuItemText">{item.label}</span>
                </a>
              ) : (
                <button
                  key={item.label}
                  className="menuItem taskLaunchMobileMenuItem"
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  onClick={handleMobileSignOut}
                  disabled={signOutBusy}
                >
                  <AppImg
                    className="taskLaunchMobileMenuItemIcon"
                    src={item.iconSrc}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="taskLaunchMobileMenuItemText">{signOutBusy ? "Signing Out" : item.label}</span>
                </button>
              )
            )}
            {signOutError ? (
              <div className="settingsDetailNote taskLaunchMobileMenuError" role="alert" aria-live="polite">
                {signOutError}
              </div>
            ) : null}
          </div>
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
                        <span className="appShellHeaderXpPromotionLabel">{promotionLabel}</span>
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
        rankLabel={rewardsHeader.rankLabel}
        totalXp={rewardsHeader.totalXp}
        rankSummary={rankSummary}
        currentRankId={currentRankId}
        currentRankIndex={currentRankIndex}
        rankThumbnailSrc={rankThumbnailSrc}
        canSelectRankInsignia={false}
        onSelectRankThumbnail={async () => {}}
        onTestRankPromotion={(rankId) => {
          setShowRankLadderModal(false);
          onTestRankPromotion?.(rankId);
        }}
      />
      <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showDesktopRail={false} showMobileFooter />
      <div className="initialAuthBusyOverlay isOn" id="initialAuthBusyOverlay" aria-hidden="false" tabIndex={-1}>
        <div className="initialAuthBusyPanel" role="status" aria-live="polite" aria-atomic="true">
          <h2 className="sr-only">Loading your workspace</h2>
          <p className="modalSubtext confirmText" id="initialAuthBusyText">Loading your workspace into this session...</p>
        </div>
      </div>
      <div className="cloudSyncNoticeHost" id="cloudSyncNoticeHost" aria-live="polite" aria-atomic="true" />
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
      {isXpAwardSpotlightActive ? <div className="xpAwardSpotlightLayer" aria-hidden="true" /> : null}
      {xpAwardFx?.visible ? (
        <div className="xpAwardFxLayer" aria-hidden="true">
          {xpAwardFx.payloadStyle && xpAwardFx.deltaText ? (
            <span className="xpAwardFxPayload" style={xpAwardFx.payloadStyle}>
              {xpAwardFx.deltaText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
