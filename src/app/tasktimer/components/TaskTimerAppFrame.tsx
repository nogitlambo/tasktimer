"use client";

import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import SignedInHeaderBadge from "./SignedInHeaderBadge";
import DesktopAppRail from "./DesktopAppRail";

type MainAppPage = "tasks" | "dashboard" | "test2";

type TaskTimerAppFrameProps = {
  activePage: MainAppPage;
  children: ReactNode;
};

export default function TaskTimerAppFrame({ activePage, children }: TaskTimerAppFrameProps) {
  return (
    <div className="wrap" id="app" aria-label="TaskLaunch App">
      <div className="topbar">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>

        <SignedInHeaderBadge />
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage={activePage} useClientNavButtons={true} showMobileFooter={false} />
        <div className="desktopAppMain">{children}</div>
      </div>
      <DesktopAppRail activePage={activePage} useClientNavButtons={true} showDesktopRail={false} />
    </div>
  );
}
