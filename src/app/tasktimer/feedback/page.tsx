"use client";

import { useEffect } from "react";
import ConfirmOverlay from "../components/ConfirmOverlay";
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
      <ConfirmOverlay />
    </>
  );
}
