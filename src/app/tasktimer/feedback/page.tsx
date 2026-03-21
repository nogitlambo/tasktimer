"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../components/GlobalTaskAlerts";
import FeedbackScreen from "../components/FeedbackScreen";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function FeedbackPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <FeedbackScreen />
      <GlobalTaskAlerts />
    </>
  );
}
