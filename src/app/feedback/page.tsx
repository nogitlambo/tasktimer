"use client";

import { useCallback, useEffect } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import FeedbackScreen from "../tasktimer/components/FeedbackScreen";
import { initTaskTimerFeedbackClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import { trackScreen } from "@/lib/firebaseTelemetry";
import "../tasktimer/tasktimer.css";

export default function FeedbackPage() {
  const initClient = useCallback(() => initTaskTimerFeedbackClient(), []);
  useTaskTimerRouteClient(initClient);

  useEffect(() => {
    void trackScreen("feedback");
  }, []);

  return (
    <>
      <FeedbackScreen />
      <GlobalTaskAlerts />
    </>
  );
}
