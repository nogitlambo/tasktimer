"use client";

"use client";

import { useEffect } from "react";
import ConfirmOverlay from "../components/ConfirmOverlay";
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
      <div className="wrap" id="app" aria-label="TaskTimer History Manager">
        <HistoryManagerScreen />
      </div>
      <ConfirmOverlay />
    </>
  );
}
