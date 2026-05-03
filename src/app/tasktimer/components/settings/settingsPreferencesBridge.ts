"use client";

import type { RewardProgressV1 } from "@/app/tasktimer/lib/rewards";
import { createTaskTimerWorkspaceRepository } from "@/app/tasktimer/lib/workspaceRepository";

const workspaceRepository = createTaskTimerWorkspaceRepository();

export function saveRewardProgressToPreferences(rewards: RewardProgressV1) {
  const currentPrefs = workspaceRepository.loadCachedPreferences() || workspaceRepository.buildDefaultPreferences();
  workspaceRepository.savePreferences({
    ...currentPrefs,
    rewards,
  });
}
