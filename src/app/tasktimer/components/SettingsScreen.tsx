import React from "react";
import SettingsPanel from "./SettingsPanel";

export default function SettingsScreen() {
  return (
    <div className="wrap" id="app" aria-label="TaskTimer Settings">
      <div className="list settingsPageList" style={{ paddingTop: 18 }}>
        <div className="settingsSceneBackdrop" aria-hidden="true">
          <div className="settingsSceneGlow settingsSceneGlowA" />
          <div className="settingsSceneGlow settingsSceneGlowB" />
        </div>
        <SettingsPanel />
      </div>
    </div>
  );
}
