"use client";

import { useCallback } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import InfoOverlays from "../tasktimer/components/InfoOverlays";
import SettingsScreen from "../tasktimer/components/SettingsScreen";
import { initTaskTimerSettingsClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import "../tasktimer/tasktimer.css";

export default function SettingsPage() {
  const initClient = useCallback(() => initTaskTimerSettingsClient(), []);
  useTaskTimerRouteClient(initClient);

  return (
    <>
      <SettingsScreen />
      <InfoOverlays />
      <GlobalTaskAlerts />
    </>
  );
}
