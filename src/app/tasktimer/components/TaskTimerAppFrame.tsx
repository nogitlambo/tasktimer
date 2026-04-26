"use client";

import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import DesktopAppRail from "./DesktopAppRail";

type MainAppPage = "tasks" | "schedule" | "dashboard" | "friends" | "leaderboard" | "history";

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
  useClientNavButtons?: boolean;
};

export default function TaskTimerAppFrame({
  activePage,
  children,
  useClientNavButtons = activePage !== "history",
}: TaskTimerAppFrameProps) {
  const railPage = activePage === "schedule" ? "tasks" : activePage;
  return (
    <div className="wrap" id="app" aria-label="TaskLaunch App">
      <div className="topbar topbarBrandOnly">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg
            className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon"
            src="/logo/launch-icon-original-transparent.png"
            alt=""
          />
          <span className="appBrandLandingReplicaText">TaskLaunch</span>
        </div>
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage={railPage} useClientNavButtons={useClientNavButtons} showMobileFooter={false} />
        <div className="desktopAppMain">{children}</div>
      </div>
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
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
