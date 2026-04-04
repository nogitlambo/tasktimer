"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GlobalTaskAlerts from "../components/GlobalTaskAlerts";
import UserGuideScreen from "../components/UserGuideScreen";
import { initTaskTimerUserGuideClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function UserGuidePage() {
  const router = useRouter();

  const taskTimerRootPath = () => {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskTimerMatch = normalized.match(/^(.*?)(\/tasktimer)(?:\/|$)/);
    if (taskTimerMatch) return `${taskTimerMatch[1] || ""}/tasktimer`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide)$/, "");
    return pageStyleRoot || normalized || "/tasktimer";
  };

  const appRoute = (path: string) => {
    if (!path.startsWith("/tasktimer")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasktimer/, "");
    return `${taskTimerRootPath()}${suffix}${trailing}`;
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push(appRoute("/tasktimer/settings"));
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
