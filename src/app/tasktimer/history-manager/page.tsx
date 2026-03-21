"use client";

import { useEffect } from "react";
import GlobalTaskAlerts from "../components/GlobalTaskAlerts";
import HistoryManagerScreen from "../components/HistoryManagerScreen";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function HistoryManagerPage() {
  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return (
    <>
      <div className="wrap" id="app" aria-label="TaskLaunch History Manager">
        <HistoryManagerScreen />
        <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />
      </div>
      <GlobalTaskAlerts />
    </>
  );
}
