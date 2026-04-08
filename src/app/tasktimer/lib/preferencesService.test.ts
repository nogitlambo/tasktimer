import { describe, expect, it, vi } from "vitest";
import { createTaskTimerPreferencesService } from "./preferencesService";
import { createTaskTimerWorkspaceRepository } from "./workspaceRepository";

describe("TaskTimerPreferencesService", () => {
  it("prefers cached values over local storage for theme and week start", () => {
    const repository = createTaskTimerWorkspaceRepository();
    const service = createTaskTimerPreferencesService({
      storageKeys: {
        THEME_KEY: "theme",
        MENU_BUTTON_STYLE_KEY: "menu",
        WEEK_STARTING_KEY: "week",
        TASK_VIEW_KEY: "view",
        AUTO_FOCUS_ON_TASK_LAUNCH_KEY: "auto",
        MOBILE_PUSH_ALERTS_KEY: "push",
        MODE_SETTINGS_KEY: "mode",
      },
      repository: {
        ...repository,
        loadCachedPreferences: () => ({
          ...repository.buildDefaultPreferences(),
          theme: "cyan",
          weekStarting: "sun",
        }),
        savePreferences: vi.fn(),
      },
      getCloudPreferencesCache: () => null,
      setCloudPreferencesCache: vi.fn(),
      currentUid: () => "",
      syncOwnFriendshipProfile: vi.fn(async () => undefined),
    });

    expect(service.loadThemeMode()).toBe("cyan");
    expect(service.loadWeekStarting()).toBe("sun");
  });
});
