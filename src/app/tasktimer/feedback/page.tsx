"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../components/GlobalTaskAlerts";
import FeedbackScreen from "../components/FeedbackScreen";
import { initTaskTimerFeedbackClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function FeedbackPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerFeedbackClient();
    return () => destroy();
  }, []);

  return (
    <>
      <FeedbackScreen />
      <GlobalTaskAlerts />
    </>
  );
}
