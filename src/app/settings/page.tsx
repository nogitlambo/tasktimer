"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import InfoOverlays from "../tasktimer/components/InfoOverlays";
import SettingsScreen from "../tasktimer/components/SettingsScreen";
import { initTaskTimerSettingsClient } from "../tasktimer/tasktimerClient";
import "../tasktimer/tasktimer.css";

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
