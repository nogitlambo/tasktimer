"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import UserGuideScreen from "../tasktimer/components/UserGuideScreen";
import { initTaskTimerUserGuideClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import "../tasktimer/tasktimer.css";

export default function UserGuidePage() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push("/settings");
  };

  const initClient = useCallback(() => initTaskTimerUserGuideClient(), []);
  useTaskTimerRouteClient(initClient);

  return (
    <>
      <UserGuideScreen onBack={handleBack} />
      <GlobalTaskAlerts />
    </>
  );
}
