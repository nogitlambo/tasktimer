"use client";

"use client";

import { useEffect } from "react";
import ConfirmOverlay from "../components/ConfirmOverlay";
import InfoOverlays from "../components/InfoOverlays";
import SettingsScreen from "../components/SettingsScreen";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function SettingsPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <SettingsScreen />
      <InfoOverlays />
      <ConfirmOverlay />
    </>
  );
}
