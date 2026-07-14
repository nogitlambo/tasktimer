"use client";

import { useEffect, useState } from "react";
import {
  createTaskTimerWorkspacePreferencesPersistence,
  createTaskTimerWorkspaceRepository,
} from "@/app/tasktimer/lib/workspaceRepository";

const workspaceRepository = createTaskTimerWorkspaceRepository();
const preferencesPersistence = createTaskTimerWorkspacePreferencesPersistence(workspaceRepository);

export function useAchievementSoundsEnabled() {
  const [achievementSoundsEnabled, setAchievementSoundsEnabled] = useState(
    () => preferencesPersistence.loadResolved().achievementSoundsEnabled !== false
  );

  useEffect(() => {
    const unsubscribe = preferencesPersistence.subscribe((prefs) => {
      setAchievementSoundsEnabled((prefs || preferencesPersistence.loadResolved()).achievementSoundsEnabled !== false);
    });
    return () => unsubscribe();
  }, []);

  return achievementSoundsEnabled;
}
