"use client";

import React from "react";
import SettingsPanel, { type SettingsPaneKey } from "./SettingsPanel";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

export default function SettingsScreen({ initialPane = null }: { initialPane?: SettingsPaneKey | null } = {}) {
  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Settings">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <img className="brandLogo" src="/logo/tasklaunch-logo-v2.png" alt="TaskLaunch" />
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
