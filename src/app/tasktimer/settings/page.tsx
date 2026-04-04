"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../components/GlobalTaskAlerts";
import InfoOverlays from "../components/InfoOverlays";
import SettingsScreen from "../components/SettingsScreen";
import { initTaskTimerSettingsClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function SettingsPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerSettingsClient();
    return () => destroy();
  }, []);

  return (
    <>
      <SettingsScreen />
      <InfoOverlays />
      <GlobalTaskAlerts />
    </>
  );
}
