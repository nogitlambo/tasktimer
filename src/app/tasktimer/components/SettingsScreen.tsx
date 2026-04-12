"use client";
import { useEffect } from "react";
import AppImg from "@/components/AppImg";
import SettingsPanel, { type SettingsPaneKey } from "./SettingsPanel";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";

export default function SettingsScreen({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  useEffect(() => {
    let timerId: number | null = null;
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
    };
  }, []);

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Settings">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <AppImg className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
        </div>
        <SignedInHeaderBadge />
      </div>
      <div className="list settingsPageList" style={{ paddingTop: 18 }}>
        <div className="settingsSceneBackdrop" aria-hidden="true">
          <div className="settingsSceneGlow settingsSceneGlowA" />
          <div className="settingsSceneGlow settingsSceneGlowB" />
        </div>
        <SettingsPanel initialPane={initialPane} />
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
