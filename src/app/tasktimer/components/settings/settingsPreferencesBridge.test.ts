import { beforeEach, describe, expect, it, vi } from "vitest";

const preferencesPersistenceMocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

const workspaceRepositoryMocks = vi.hoisted(() => ({
  createTaskTimerWorkspacePreferencesPersistence: vi.fn(() => preferencesPersistenceMocks),
  createTaskTimerWorkspaceRepository: vi.fn(() => ({ kind: "workspace-repository" })),
}));

vi.mock("@/app/tasktimer/lib/workspaceRepository", () => workspaceRepositoryMocks);

import { DEFAULT_REWARD_PROGRESS } from "@/app/tasktimer/lib/rewards";
import { saveRewardProgressToPreferences } from "./settingsPreferencesBridge";

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
});
