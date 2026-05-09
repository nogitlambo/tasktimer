"use client";

import { useCallback, useEffect } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import InfoOverlays from "../tasktimer/components/InfoOverlays";
import SettingsScreen from "../tasktimer/components/SettingsScreen";
import { initTaskTimerSettingsClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import { trackEvent, trackScreen } from "@/lib/firebaseTelemetry";
import "../tasktimer/tasktimer.css";

export default function SettingsPage() {
  const initClient = useCallback(() => initTaskTimerSettingsClient(), []);
  useTaskTimerRouteClient(initClient);

  useEffect(() => {
    void trackScreen("settings");
    void trackEvent("settings_opened");
  }, []);

  return (
    <>
      <SettingsScreen />
      <InfoOverlays />
      <GlobalTaskAlerts />
    </>
  );
}
