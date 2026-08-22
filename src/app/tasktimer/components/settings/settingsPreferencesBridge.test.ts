import { beforeEach, describe, expect, it, vi } from "vitest";

const preferencesPersistenceMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

const workspaceRepositoryMocks = vi.hoisted(() => ({
  createTaskTimerWorkspacePreferencesPersistence: vi.fn(() => preferencesPersistenceMocks),
  createTaskTimerWorkspaceRepository: vi.fn(() => ({ kind: "workspace-repository", flushPendingCloudWrites: vi.fn() })),
}));

vi.mock("@/app/tasktimer/lib/workspaceRepository", () => workspaceRepositoryMocks);

import { DEFAULT_REWARD_PROGRESS } from "@/app/tasktimer/lib/rewards";
import { saveOptimalProductivityPreferencesToFirestore, saveRewardProgressToPreferences } from "./settingsPreferencesBridge";

describe("saveRewardProgressToPreferences", () => {
  beforeEach(() => {
    preferencesPersistenceMocks.update.mockClear();
  });

  it("routes reward mutations through Workspace preference persistence", () => {
    const rewards = {
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 42,
      totalXpPrecise: 42,
    };

    saveRewardProgressToPreferences(rewards);

    expect(preferencesPersistenceMocks.update).toHaveBeenCalledTimes(1);
    expect(preferencesPersistenceMocks.update).toHaveBeenCalledWith({ rewards });
  });

  it("persists productivity fields and flushes their Firestore write", () => {
    const mutation = { optimalProductivityDays: ["mon", "wed"], optimalProductivityStartTime: "09:00", optimalProductivityEndTime: "16:00" };

    saveOptimalProductivityPreferencesToFirestore(mutation);

    expect(preferencesPersistenceMocks.update).toHaveBeenCalledWith(mutation);
    expect(workspaceRepositoryMocks.createTaskTimerWorkspaceRepository.mock.results[0]?.value.flushPendingCloudWrites).toHaveBeenCalledTimes(1);
  });
});
