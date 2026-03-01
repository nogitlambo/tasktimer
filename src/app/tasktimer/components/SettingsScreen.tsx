import React from "react";
import SettingsPanel from "./SettingsPanel";

export default function SettingsScreen() {
  return (
    <div className="wrap" id="app" aria-label="TaskTimer Settings">
      <div className="topbar" aria-label="TaskTimer header">
        <div className="brand">
          <img className="brandLogo" src="/timebase-logo.svg" alt="Timebase" />
        </div>
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
