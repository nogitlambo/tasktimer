"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../../tasktimer/components/GlobalTaskAlerts";
import FeedbackScreen from "../../tasktimer/components/FeedbackScreen";
import { initTaskTimerFeedbackClient } from "../../tasktimer/tasktimerClient";
import "../../tasktimer/tasktimer.css";

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
