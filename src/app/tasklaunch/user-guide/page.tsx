"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import GlobalTaskAlerts from "../../tasktimer/components/GlobalTaskAlerts";
import UserGuideScreen from "../../tasktimer/components/UserGuideScreen";
import { initTaskTimerUserGuideClient } from "../../tasktimer/tasktimerClient";
import "../../tasktimer/tasktimer.css";

export default function UserGuidePage() {
  const router = useRouter();

  const taskLaunchRootPath = () => {
    const pathname = window.location.pathname || "";
    const normalized = pathname.replace(/\/+$/, "");
    const taskLaunchMatch = normalized.match(/^(.*?)(\/tasklaunch)(?:\/|$)/);
    if (taskLaunchMatch) return `${taskLaunchMatch[1] || ""}/tasklaunch`;
    const pageStyleRoot = normalized.replace(/\/(settings|history-manager|user-guide)$/, "");
    return pageStyleRoot || normalized || "/tasklaunch";
  };

  const appRoute = (path: string) => {
    if (!path.startsWith("/tasklaunch")) return path;
    const hashIndex = path.indexOf("#");
    const queryIndex = path.indexOf("?");
    const cutIndex =
      queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
    const rawPath = cutIndex >= 0 ? path.slice(0, cutIndex) : path;
    const trailing = cutIndex >= 0 ? path.slice(cutIndex) : "";
    const normalizedPath = rawPath.endsWith("/") ? rawPath : `${rawPath}/`;
    const suffix = normalizedPath.replace(/^\/tasklaunch/, "");
    return `${taskLaunchRootPath()}${suffix}${trailing}`;
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push(appRoute("/tasklaunch/settings"));
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
