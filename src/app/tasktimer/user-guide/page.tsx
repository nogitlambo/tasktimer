"use client";

import { useEffect } from "react";
import UserGuideScreen from "../components/UserGuideScreen";
import { initTaskTimerClient } from "../tasktimerClient";
import "../tasktimer.css";

export default function UserGuidePage() {
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

  useEffect(() => {
    const { destroy } = initTaskTimerClient();
    return () => destroy();
  }, []);

  return <UserGuideScreen onBack={() => (window.location.href = appRoute("/tasktimer/settings"))} />;
}
