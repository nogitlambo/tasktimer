import React from "react";
import SettingsPanel from "./SettingsPanel";

export default function MenuOverlay() {
  return (
    <div className="overlay" id="menuOverlay">
      <SettingsPanel />
    </div>
  );
}
