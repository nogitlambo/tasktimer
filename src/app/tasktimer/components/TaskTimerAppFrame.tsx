"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AppImg from "@/components/AppImg";
import { usePathname, useSearchParams } from "next/navigation";
import DesktopAppRail from "./DesktopAppRail";
import RankLadderModal from "./RankLadderModal";
import RankThumbnail from "./RankThumbnail";
import { RANK_LADDER, getRankLadderThumbnailSrc } from "../lib/rewards";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";

type MainAppPage = "tasks" | "schedule" | "dashboard" | "friends" | "leaderboard" | "history";

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
  useClientNavButtons?: boolean;
  mobileToolbar?: ReactNode;
  currentRankId: string;
  currentUserAvatarSrc?: string;
  currentUserAvatarInitials?: string;
  rewardsHeader: {
    rankLabel: string;
    totalXp: number;
    progressPct: number;
    progressLabel: string;
    xpToNext: number | null;
  };
};

export default function TaskTimerAppFrame({
  activePage,
  children,
  useClientNavButtons = activePage !== "history",
  mobileToolbar = null,
  currentRankId,
  currentUserAvatarSrc = "",
  currentUserAvatarInitials = "U",
  rewardsHeader,
}: TaskTimerAppFrameProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const railPage = activePage === "schedule" ? "tasks" : activePage;
  const searchParamsKey = searchParams.toString();
  const currentRankIndex = useMemo(
    () => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === currentRankId)),
    [currentRankId]
  );
  const showMaxXpAlert = rewardsHeader.xpToNext == null;
  const rankSummary = rewardsHeader.xpToNext != null
    ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
    : "You have reached the highest configured rank.";
  const rankThumbnailSrc = useMemo(() => getRankLadderThumbnailSrc(currentRankId, ""), [currentRankId]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, searchParamsKey]);

  useEffect(() => {
    if (!mobileMenuOpen || typeof window === "undefined") return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileMenuRef.current?.contains(target)) return;
      if (mobileMenuBtnRef.current?.contains(target)) return;
      setMobileMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
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

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch App">
      <div className="topbar topbarBrandOnly taskLaunchAppTopbar">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg
            className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
            src="/logo/launch-icon-original-transparent.png"
            alt=""
          />
          <span className="appBrandLandingReplicaText">TaskLaunch</span>
          <section className="taskLaunchTopbarXp" aria-label="XP progress">
              <div className="taskLaunchTopbarXpBody">
                <button
                  className="taskLaunchTopbarXpBottomRow taskLaunchTopbarXpTrigger"
                  type="button"
                  aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}
                  onClick={() => setShowRankLadderModal(true)}
                >
                  <span className="taskLaunchTopbarXpAvatarWrap" aria-hidden="true">
                    {currentUserAvatarSrc ? (
                      <AppImg className="taskLaunchTopbarXpAvatarImg" src={currentUserAvatarSrc} alt="" referrerPolicy={/^https?:\/\//i.test(currentUserAvatarSrc) ? "no-referrer" : undefined} />
                    ) : (
                      <span className="taskLaunchTopbarXpAvatarFallback">{currentUserAvatarInitials}</span>
                    )}
                  </span>
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
                  <strong className="taskLaunchTopbarXpValue">
                    {rewardsHeader.totalXp} XP
                    {showMaxXpAlert ? <span className="taskLaunchXpValueAlert" aria-hidden="true"> !</span> : null}
                  </strong>
                </button>
              </div>
            </section>
        </div>
        <button
          ref={mobileMenuBtnRef}
          className={`menuIcon taskLaunchMobileMenuBtn${mobileMenuOpen ? " isOn" : ""}`}
          id="menuIcon"
          type="button"
          aria-label={mobileMenuOpen ? "Close settings menu" : "Open settings menu"}
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
        <div
          ref={mobileMenuRef}
          className={`taskLaunchMobileMenu${mobileMenuOpen ? " isOpen" : ""}`}
          id="mobileSettingsMenu"
          aria-hidden={mobileMenuOpen ? "false" : "true"}
        >
          <div className="taskLaunchMobileMenuList" role="menu" aria-label="Settings menu">
            <a
              className="menuItem taskLaunchMobileMenuItem"
              href={resolveTaskTimerRouteHref("/settings")}
              role="menuitem"
              onClick={() => setMobileMenuOpen(false)}
            >
              <AppImg
                className="taskLaunchMobileMenuItemIcon"
                src="/icons/icons_default/settings.png"
                alt=""
                aria-hidden="true"
              />
              <span className="taskLaunchMobileMenuItemText">Settings</span>
            </a>
          </div>
        </div>
      </div>
      {mobileToolbar ? <div className="taskLaunchMobileToolbar">{mobileToolbar}</div> : null}
      <div className="desktopAppShell">
        <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showMobileFooter={false} />
        <div className="desktopAppMain">
          <div className="appShellHeader">
            <div className="appShellHeaderSpacer" aria-hidden="true" />
            <section className="appShellHeaderXp" aria-label="XP progress">
              <div className="appShellHeaderXpBody">
                <button
                  className="appShellHeaderXpBottomRow appShellHeaderXpTrigger"
                  type="button"
                  aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}
                  onClick={() => setShowRankLadderModal(true)}
                >
                  <span className="appShellHeaderXpRankWrap" aria-label={`Current rank insignia: ${rewardsHeader.rankLabel}`}>
                    <RankThumbnail
                      rankId={currentRankId}
                      className="appShellHeaderXpInsigniaShell"
                      imageClassName="appShellHeaderXpInsigniaImg"
                      placeholderClassName="appShellHeaderXpInsigniaPlaceholder"
                      alt=""
                      size={16}
                      aria-hidden
                    />
                    <span className="appShellHeaderXpRank">{rewardsHeader.rankLabel}</span>
                  </span>
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
                  <strong className="appShellHeaderXpValue">
                    {rewardsHeader.totalXp} XP
                    {showMaxXpAlert ? <span className="appShellXpValueAlert" aria-hidden="true"> !</span> : null}
                  </strong>
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
      />
      <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showDesktopRail={false} />
      <div className="initialAuthBusyOverlay isOn" id="initialAuthBusyOverlay" aria-hidden="false" tabIndex={-1}>
        <div className="initialAuthBusyPanel" role="status" aria-live="polite" aria-atomic="true">
          <h2 className="sr-only">Loading your workspace</h2>
          <p className="modalSubtext confirmText" id="initialAuthBusyText">Loading your workspace into this session...</p>
          <div className="dashboardRefreshBusyProgress initialAuthBusyProgress" aria-hidden="true">
            <span className="dashboardRefreshBusyProgressBar" />
          </div>
        </div>
      </div>
      <div className="cloudSyncNoticeHost" id="cloudSyncNoticeHost" aria-live="polite" aria-atomic="true" />
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
