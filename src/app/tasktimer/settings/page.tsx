"use client";

"use client";

import { useEffect } from "react";
import ConfirmOverlay from "../components/ConfirmOverlay";
import InfoOverlays from "../components/InfoOverlays";
import SettingsPanel from "../components/SettingsPanel";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function SettingsPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskTimer Settings">
        <div className="list" style={{ paddingTop: 18 }}>
          <SettingsPanel />
        </div>
      </div>
      <InfoOverlays />
      <ConfirmOverlay />
    </>
  );
}
