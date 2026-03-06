"use client";

import React from "react";
import SettingsPanel from "./SettingsPanel";
import SignedInHeaderBadge from "./SignedInHeaderBadge";

export default function SettingsScreen() {
  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Settings">
      <div className="topbar" aria-label="TaskLaunch header">
        <div className="brand">
          <img className="brandLogo" src="/logo/tasklaunch.svg" alt="TaskLaunch" />
        </div>
        <SignedInHeaderBadge />
      </div>
      <div className="list settingsPageList" style={{ paddingTop: 18 }}>
        <div className="settingsSceneBackdrop" aria-hidden="true">
          <div className="settingsSceneGlow settingsSceneGlowA" />
          <div className="settingsSceneGlow settingsSceneGlowB" />
        </div>
        <SettingsPanel />
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
    </div>
  );
}
