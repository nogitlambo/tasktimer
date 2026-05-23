"use client";
import { useEffect } from "react";
import AppImg from "@/components/AppImg";
import DesktopAppRail from "./DesktopAppRail";
import SettingsPanel, { type SettingsPaneKey } from "./SettingsPanel";
import {
  getSettingsRouteHighlight,
  SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS,
} from "../lib/settingsRoute";

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";
const SETTINGS_ROUTE_HIGHLIGHT_MS = 3000;
const SETTINGS_ROUTE_HIGHLIGHT_RETRY_MS = 100;
const SETTINGS_ROUTE_HIGHLIGHT_MAX_ATTEMPTS = 30;

export default function SettingsScreen({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  useEffect(() => {
    let timerId: number | null = null;
    document.body.setAttribute("data-route-root", "settings");
    try {
      const raw = window.sessionStorage.getItem(RAIL_TRANSITION_STORAGE_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(RAIL_TRANSITION_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { toPage?: unknown; direction?: unknown; at?: unknown };
      const isFresh = Date.now() - Number(parsed.at || 0) < 5000;
      const direction = parsed.direction === "backward" ? "backward" : parsed.direction === "forward" ? "forward" : "";
      if (parsed.toPage !== "settings" || !isFresh || !direction) return;
      document.body.setAttribute("data-route-slide-direction", direction);
      document.body.classList.add("isRouteSlideEntering");
      timerId = window.setTimeout(() => {
        document.body.classList.remove("isRouteSlideEntering");
        document.body.removeAttribute("data-route-slide-direction");
      }, 220);
    } catch {
      // ignore malformed transition metadata
    }
    return () => {
      if (timerId != null) window.clearTimeout(timerId);
      document.body.classList.remove("isRouteSlideEntering");
      document.body.removeAttribute("data-route-slide-direction");
      if (document.body.getAttribute("data-route-root") === "settings") {
        document.body.removeAttribute("data-route-root");
      }
    };
  }, []);

  useEffect(() => {
    let retryTimerId: number | null = null;
    let clearHighlightTimerId: number | null = null;
    let highlightedRow: HTMLElement | null = null;
    let attempts = 0;
    const searchParams = new URLSearchParams(window.location.search);
    if (getSettingsRouteHighlight(searchParams) !== SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS) return;

    const tryHighlightRow = () => {
      const row = document.querySelector<HTMLElement>(".settingsDetailPane.isActive #optimalProductivityDaysRow");
      if (!row) {
        if (attempts >= SETTINGS_ROUTE_HIGHLIGHT_MAX_ATTEMPTS) return;
        attempts += 1;
        retryTimerId = window.setTimeout(tryHighlightRow, SETTINGS_ROUTE_HIGHLIGHT_RETRY_MS);
        return;
      }

      highlightedRow = row;
      try {
        row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
        row.scrollIntoView();
      }
      row.classList.add("settingsRouteHighlight");
      clearHighlightTimerId = window.setTimeout(() => {
        row.classList.remove("settingsRouteHighlight");
        if (highlightedRow === row) highlightedRow = null;
      }, SETTINGS_ROUTE_HIGHLIGHT_MS);
    };

    retryTimerId = window.setTimeout(tryHighlightRow, 0);
    return () => {
      if (retryTimerId != null) window.clearTimeout(retryTimerId);
      if (clearHighlightTimerId != null) window.clearTimeout(clearHighlightTimerId);
      highlightedRow?.classList.remove("settingsRouteHighlight");
    };
  }, []);

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Settings">
      <div className="topbar topbarBrandOnly" aria-label="TaskLaunch header">
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
        <DesktopAppRail activePage="settings" useClientNavButtons={false} showMobileFooter={false} />
        <div className="desktopAppMain">
          <div className="list settingsPageList" style={{ paddingTop: 18 }}>
            <div className="settingsSceneBackdrop" aria-hidden="true">
              <div className="settingsSceneGlow settingsSceneGlowA" />
              <div className="settingsSceneGlow settingsSceneGlowB" />
            </div>
            <SettingsPanel initialPane={initialPane} />
          </div>
        </div>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
