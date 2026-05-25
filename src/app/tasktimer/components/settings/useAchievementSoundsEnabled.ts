"use client";

import { useEffect, useState } from "react";
import { createTaskTimerWorkspaceRepository } from "@/app/tasktimer/lib/workspaceRepository";

const workspaceRepository = createTaskTimerWorkspaceRepository();

export function useAchievementSoundsEnabled() {
  const [achievementSoundsEnabled, setAchievementSoundsEnabled] = useState(
    () => workspaceRepository.loadCachedPreferences()?.achievementSoundsEnabled !== false
  );

  useEffect(() => {
    const unsubscribe = workspaceRepository.subscribeCachedPreferences((prefs) => {
      setAchievementSoundsEnabled(prefs?.achievementSoundsEnabled !== false);
    });
    return () => unsubscribe();
  }, []);

  return achievementSoundsEnabled;
}
