"use client";

import { useCallback, useEffect, useState } from "react";
import GlobalTaskAlerts from "../tasktimer/components/GlobalTaskAlerts";
import InfoOverlays from "../tasktimer/components/InfoOverlays";
import SettingsScreen from "../tasktimer/components/SettingsScreen";
import TaskLaunchOnboarding from "../tasktimer/components/TaskLaunchOnboarding";
import { initTaskTimerSettingsClient } from "../tasktimer/tasktimerClient";
import { useTaskTimerRouteClient } from "../tasktimer/useTaskTimerRouteClient";
import { trackEvent, trackScreen } from "@/lib/firebaseTelemetry";
import { resolveTaskTimerRouteHref } from "../tasktimer/lib/routeHref";
import { getSettingsRouteRedirect } from "../tasktimer/lib/settingsRoute";
import { createTaskTimerWorkspaceRepository } from "../tasktimer/lib/workspaceRepository";
import type { UserPreferencesV1 } from "../tasktimer/lib/cloudStore";
import "../tasktimer/tasktimer.css";

const settingsWorkspaceRepository = createTaskTimerWorkspaceRepository();

export default function SettingsPage() {
  const initClient = useCallback(() => initTaskTimerSettingsClient(), []);
  const [cachedPreferences, setCachedPreferences] = useState<UserPreferencesV1 | null>(() =>
    settingsWorkspaceRepository.loadCachedPreferences()
  );
  useTaskTimerRouteClient(initClient);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const redirectPath = getSettingsRouteRedirect(searchParams);
    if (!redirectPath) return;
    window.location.replace(resolveTaskTimerRouteHref(redirectPath));
  }, []);

  useEffect(() => {
    void trackScreen("settings");
    void trackEvent("settings_opened");
  }, []);

  useEffect(() => {
    return settingsWorkspaceRepository.subscribeCachedPreferences((prefs) => {
      setCachedPreferences(prefs);
    });
  }, []);

  return (
    <>
      <SettingsScreen />
      <InfoOverlays />
      <GlobalTaskAlerts />
      <TaskLaunchOnboarding preferences={cachedPreferences} />
    </>
  );
}
