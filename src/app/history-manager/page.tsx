"use client";

import { useCallback } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import HistoryManagerScreen from "../tasktimer/components/HistoryManagerScreen";
import { initTaskTimerHistoryManagerClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import "../tasktimer/tasktimer.css";

export default function HistoryManagerPage() {
  const initClient = useCallback(() => initTaskTimerHistoryManagerClient(), []);
  useTaskTimerRouteClient(initClient);

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
