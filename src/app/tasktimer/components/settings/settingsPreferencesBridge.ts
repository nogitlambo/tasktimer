"use client";

import type { RewardProgressV1 } from "@/app/tasktimer/lib/rewards";
import type { UserPreferencesV1 } from "@/app/tasktimer/lib/cloudStore";
import {
  createTaskTimerWorkspacePreferencesPersistence,
  createTaskTimerWorkspaceRepository,
} from "@/app/tasktimer/lib/workspaceRepository";

const workspaceRepository = createTaskTimerWorkspaceRepository();
const preferencesPersistence = createTaskTimerWorkspacePreferencesPersistence(workspaceRepository);

export function saveRewardProgressToPreferences(rewards: RewardProgressV1) {
  preferencesPersistence.update({ rewards });
}

export function saveOptimalProductivityPreferencesToFirestore(
  mutation: Partial<Pick<UserPreferencesV1, "optimalProductivityStartTime" | "optimalProductivityEndTime" | "optimalProductivityDays">>
) {
  preferencesPersistence.update(mutation);
  void workspaceRepository.flushPendingCloudWrites();
}
