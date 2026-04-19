"use client";

import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import DesktopAppRail from "./DesktopAppRail";

type MainAppPage = "tasks" | "schedule" | "dashboard" | "test2" | "leaderboard";

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
};

export default function TaskTimerAppFrame({ activePage, children }: TaskTimerAppFrameProps) {
  const railPage = activePage === "schedule" ? "tasks" : activePage;
  return (
    <div className="wrap" id="app" aria-label="TaskLaunch App">
      <div className="topbar topbarBrandOnly">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage={railPage} useClientNavButtons={true} showMobileFooter={false} />
        <div className="desktopAppMain">{children}</div>
      </div>
      <DesktopAppRail activePage={railPage} useClientNavButtons={true} showDesktopRail={false} />
      <div className="initialAuthBusyOverlay isOn" id="initialAuthBusyOverlay" aria-hidden="false" tabIndex={-1}>
        <div className="initialAuthBusyPanel" role="status" aria-live="polite" aria-atomic="true">
          <h2 className="sr-only">Loading your workspace</h2>
          <p className="modalSubtext confirmText" id="initialAuthBusyText">Loading your workspace into this session...</p>
          <div className="dashboardRefreshBusyArrowStage initialAuthBusyArrowStage" aria-hidden="true">
            <div className="dashboardRefreshBusyArrowShell initialAuthBusyArrowShell">
              <div className="dashboardRefreshBusyArrowBeamBlend" />
              <AppImg className="dashboardRefreshBusyArrowGraphic initialAuthBusyArrowGraphic" src="/logo/launch-icon-original-transparent.png" alt="" />
            </div>
          </div>
        </div>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
