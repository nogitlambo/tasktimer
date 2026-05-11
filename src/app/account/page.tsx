"use client";

import { useCallback, useEffect } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import InfoOverlays from "../tasktimer/components/InfoOverlays";
import AccountScreen from "../tasktimer/components/AccountScreen";
import { initTaskTimerSettingsClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import { trackEvent, trackScreen } from "@/lib/firebaseTelemetry";
import "../tasktimer/tasktimer.css";

export default function AccountPage() {
  const initClient = useCallback(() => initTaskTimerSettingsClient(), []);
  useTaskTimerRouteClient(initClient);

  useEffect(() => {
    void trackScreen("account");
    void trackEvent("account_opened");
  }, []);

  return (
    <>
      <AccountScreen />
      <InfoOverlays />
      <GlobalTaskAlerts />
    </>
  );
}
