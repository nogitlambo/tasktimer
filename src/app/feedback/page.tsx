"use client";

import { useCallback } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import FeedbackScreen from "../tasktimer/components/FeedbackScreen";
import { initTaskTimerFeedbackClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import "../tasktimer/tasktimer.css";

export default function FeedbackPage() {
  const initClient = useCallback(() => initTaskTimerFeedbackClient(), []);
  useTaskTimerRouteClient(initClient);

  return (
    <>
      <FeedbackScreen />
      <GlobalTaskAlerts />
    </>
  );
}
