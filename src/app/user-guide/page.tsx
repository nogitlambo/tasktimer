"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import UserGuideScreen from "../tasktimer/components/UserGuideScreen";
import { initTaskTimerUserGuideClient } from "../tasktimer/tasktimerClient";
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

  useEffect(() => {
    const { destroy } = initTaskTimerUserGuideClient();
    return () => destroy();
  }, []);

  return (
    <>
      <UserGuideScreen onBack={handleBack} />
      <GlobalTaskAlerts />
    </>
  );
}
