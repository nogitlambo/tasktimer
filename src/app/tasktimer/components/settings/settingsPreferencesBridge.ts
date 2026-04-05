"use client";

import { buildDefaultCloudPreferences, loadCachedPreferences, saveCloudPreferences } from "@/app/tasktimer/lib/storage";
import type { RewardProgressV1 } from "@/app/tasktimer/lib/rewards";

export function saveRewardProgressToPreferences(rewards: RewardProgressV1) {
  const currentPrefs = loadCachedPreferences() || buildDefaultCloudPreferences();
  saveCloudPreferences({
    ...currentPrefs,
    rewards,
  });
}
