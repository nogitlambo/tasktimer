import React from "react";
import SettingsPanel from "./SettingsPanel";

export default function SettingsScreen() {
  return (
    <div className="wrap" id="app" aria-label="TaskTimer Settings">
      <div className="list" style={{ paddingTop: 18 }}>
        <SettingsPanel />
      </div>
    </div>
  );
}
