"use client";

import type { RewardProgressV1 } from "@/app/tasktimer/lib/rewards";
import {
  createTaskTimerWorkspacePreferencesPersistence,
  createTaskTimerWorkspaceRepository,
} from "@/app/tasktimer/lib/workspaceRepository";

const workspaceRepository = createTaskTimerWorkspaceRepository();
const preferencesPersistence = createTaskTimerWorkspacePreferencesPersistence(workspaceRepository);

export function saveRewardProgressToPreferences(rewards: RewardProgressV1) {
  preferencesPersistence.update({ rewards });
}
