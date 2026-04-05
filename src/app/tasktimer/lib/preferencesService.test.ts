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
        DEFAULT_TASK_TIMER_FORMAT_KEY: "format",
        WEEK_STARTING_KEY: "week",
        TASK_VIEW_KEY: "view",
        AUTO_FOCUS_ON_TASK_LAUNCH_KEY: "auto",
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
