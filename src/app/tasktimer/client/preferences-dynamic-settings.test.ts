import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerPreferences } from "./preferences";
import type { TaskTimerPreferencesContext } from "./context";
import type { DashboardWeekStart } from "../lib/historyChart";
import type { TaskOrderBy } from "./types";
import type { StartupModulePreference } from "../lib/startupModule";
import type { InteractionHapticsIntensity } from "../lib/interactionHapticsIntensity";

type Listener = (event: { target?: unknown; type?: string; detail?: unknown }) => void;

const storageKeys = {
  THEME_KEY: "taskticker_tasks_v1:theme",
  TASK_VIEW_KEY: "taskticker_tasks_v1:taskView",
  TASK_ORDER_BY_KEY: "taskticker_tasks_v1:taskOrderBy",
  STARTUP_MODULE_KEY: "taskticker_tasks_v1:startupModule",
  AUTO_FOCUS_ON_TASK_LAUNCH_KEY: "taskticker_tasks_v1:autoFocusOnTaskLaunchEnabled",
  DASHBOARD_PREVIOUS_WEEK_VISIBLE_KEY: "taskticker_tasks_v1:dashboardPreviousWeekVisible",
  MOBILE_PUSH_ALERTS_KEY: "taskticker_tasks_v1:mobilePushAlertsEnabled",
  WEB_PUSH_ALERTS_KEY: "taskticker_tasks_v1:webPushAlertsEnabled",
  INTERACTION_CLICK_SOUND_KEY: "taskticker_tasks_v1:interactionClickSoundEnabled",
  ACHIEVEMENT_SOUNDS_KEY: "taskticker_tasks_v1:achievementSoundsEnabled",
  INTERACTION_HAPTICS_KEY: "taskticker_tasks_v1:interactionHapticsEnabled",
  INTERACTION_HAPTICS_INTENSITY_KEY: "taskticker_tasks_v1:interactionHapticsIntensity",
  OPTIMAL_PRODUCTIVITY_START_TIME_KEY: "taskticker_tasks_v1:optimalProductivityStartTime",
  OPTIMAL_PRODUCTIVITY_END_TIME_KEY: "taskticker_tasks_v1:optimalProductivityEndTime",
  OPTIMAL_PRODUCTIVITY_DAYS_KEY: "taskticker_tasks_v1:optimalProductivityDays",
  MENU_BUTTON_STYLE_KEY: "taskticker_tasks_v1:menuButtonStyle",
  WEEK_STARTING_KEY: "taskticker_tasks_v1:weekStarting",
  FOCUS_DND_STORAGE_KEY: "taskticker_tasks_v1",
};

class FakeClassList {
  private values = new Set<string>();

  add(value: string) {
    this.values.add(value);
  }

  remove(value: string) {
    this.values.delete(value);
  }

  toggle(value: string, force?: boolean) {
    const next = force ?? !this.values.has(value);
    if (next) this.values.add(value);
    else this.values.delete(value);
    return next;
  }

  has(value: string) {
    return this.values.has(value);
  }
}

class FakeElement {
  checked = false;
  children: FakeElement[] = [];
  classList = new FakeClassList();
  dataset: Record<string, string> = {};
  parent: FakeElement | null = null;
  textContent = "";
  value = "";
  private attributes = new Map<string, string>();

  constructor(
    public id: string,
    classNames: string[] = []
  ) {
    classNames.forEach((className) => this.classList.add(className));
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  closest(selector: string) {
    if (selector.startsWith("#")) {
      const id = selector.slice(1);
      return this.findClosest((el) => el.id === id);
    }
    if (selector === ".chkRow") return this.findClosest((el) => el.classList.has("chkRow"));
    return null;
  }

  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((child): boolean => child.contains(node));
  }

  focus() {}

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  matches(selector: string) {
    return selector === 'input[data-optimal-productivity-day]' && !!this.dataset.optimalProductivityDay;
  }

  querySelector() {
    return null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  private findClosest(predicate: (el: FakeElement) => boolean): FakeElement | null {
    return findClosestElement(this, predicate);
  }
}

function findClosestElement(element: FakeElement | null, predicate: (el: FakeElement) => boolean): FakeElement | null {
  if (!element) return null;
  if (predicate(element)) return element;
  return findClosestElement(element.parent, predicate);
}

class FakeDocument {
  body = new FakeElement("body");
  private elements = new Map<string, FakeElement>();
  private listeners = new Map<string, Listener[]>();

  addElement(element: FakeElement) {
    this.elements.set(element.id, element);
    return element;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  dispatch(type: string, target: FakeElement) {
    (this.listeners.get(type) || []).forEach((listener) => listener({ target }));
  }

  getElementById(id: string) {
    return this.elements.get(id) || null;
  }

  querySelectorAll(selector: string) {
    if (selector !== 'input[data-optimal-productivity-day]') return [];
    return Array.from(this.elements.values()).filter((element) => element.dataset.optimalProductivityDay);
  }
}

function createWindowStub(localStorageRef: Storage) {
  const listeners = new Map<string, Listener[]>();
  return {
    localStorage: localStorageRef,
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    }),
    dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    }),
    matchMedia: vi.fn(() => ({ matches: false })),
    setTimeout: vi.fn((fn: () => void) => {
      fn();
      return 1;
    }),
  };
}

function createLocalStorageStub() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    get: (key: string) => values.get(key),
  };
}

function createHarness() {
  const fakeDocument = new FakeDocument();
  const localStorageStub = createLocalStorageStub();
  const windowStub = createWindowStub(localStorageStub as unknown as Storage);
  const state: {
    themeMode: "lime";
    taskView: "list" | "tile";
    taskOrderBy: TaskOrderBy;
    menuButtonStyle: "square";
    weekStarting: DashboardWeekStart;
    startupModule: StartupModulePreference;
    autoFocusOnTaskLaunchEnabled: boolean;
    dashboardPreviousWeekVisible: boolean;
    dynamicColorsEnabled: boolean;
    mobilePushAlertsEnabled: boolean;
    webPushAlertsEnabled: boolean;
    interactionClickSoundEnabled: boolean;
    achievementSoundsEnabled: boolean;
    interactionHapticsEnabled: boolean;
    interactionHapticsIntensity: InteractionHapticsIntensity;
    checkpointAlertSoundEnabled: boolean;
    checkpointAlertToastEnabled: boolean;
    checkpointAlertSoundMode: "once" | "repeat";
    checkpointAlertToastMode: "auto5s" | "manual";
    optimalProductivityStartTime: string;
    optimalProductivityEndTime: string;
    optimalProductivityDays: DashboardWeekStart[];
  } = {
    themeMode: "lime" as const,
    taskView: "tile" as const,
    taskOrderBy: "custom" as TaskOrderBy,
    menuButtonStyle: "square" as const,
    weekStarting: "mon" as DashboardWeekStart,
    startupModule: "tasks" as const,
    autoFocusOnTaskLaunchEnabled: false,
    dashboardPreviousWeekVisible: true,
    dynamicColorsEnabled: true,
    mobilePushAlertsEnabled: false,
    webPushAlertsEnabled: false,
    interactionClickSoundEnabled: true,
    achievementSoundsEnabled: true,
    interactionHapticsEnabled: true,
    interactionHapticsIntensity: "max" as const,
    checkpointAlertSoundEnabled: true,
    checkpointAlertToastEnabled: true,
    checkpointAlertSoundMode: "once" as const,
    checkpointAlertToastMode: "auto5s" as const,
    optimalProductivityStartTime: "00:00",
    optimalProductivityEndTime: "23:59",
    optimalProductivityDays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as DashboardWeekStart[],
  };
  const saveCloudPreferences = vi.fn();
  const render = vi.fn();

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("localStorage", localStorageStub);
  vi.stubGlobal("CustomEvent", class CustomEventStub<T = unknown> {
    detail?: T;

    constructor(
      public type: string,
      public init?: { detail?: T }
    ) {
      this.detail = init?.detail;
    }
  });

  const ctx: TaskTimerPreferencesContext = {
    els: {} as TaskTimerPreferencesContext["els"],
    on: (target, type, listener) => {
      target?.addEventListener(type, listener as EventListener);
    },
    storageKeys,
    defaultModeColors: { mode1: "#c9ff24" },
    toggleSwitchElement: vi.fn(),
    isSwitchOn: vi.fn(() => false),
    getThemeMode: () => state.themeMode,
    setThemeModeState: (value) => {
      state.themeMode = value;
    },
    getTaskView: () => state.taskView,
    setTaskViewState: (value) => {
      state.taskView = value;
    },
    getTaskOrderBy: () => state.taskOrderBy,
    setTaskOrderByState: (value) => {
      state.taskOrderBy = value;
    },
    getMenuButtonStyle: () => state.menuButtonStyle,
    setMenuButtonStyleState: (value) => {
      state.menuButtonStyle = value;
    },
    getWeekStarting: () => state.weekStarting,
    setWeekStartingState: (value) => {
      state.weekStarting = value;
    },
    getStartupModule: () => state.startupModule,
    setStartupModuleState: (value) => {
      state.startupModule = value;
    },
    getAutoFocusOnTaskLaunchEnabled: () => state.autoFocusOnTaskLaunchEnabled,
    setAutoFocusOnTaskLaunchEnabledState: (value) => {
      state.autoFocusOnTaskLaunchEnabled = value;
    },
    getDashboardPreviousWeekVisible: () => state.dashboardPreviousWeekVisible,
    setDashboardPreviousWeekVisibleState: (value) => {
      state.dashboardPreviousWeekVisible = value;
    },
    getDynamicColorsEnabled: () => state.dynamicColorsEnabled,
    setDynamicColorsEnabledState: (value) => {
      state.dynamicColorsEnabled = value;
    },
    getMobilePushAlertsEnabled: () => state.mobilePushAlertsEnabled,
    setMobilePushAlertsEnabledState: (value) => {
      state.mobilePushAlertsEnabled = value;
    },
    getWebPushAlertsEnabled: () => state.webPushAlertsEnabled,
    setWebPushAlertsEnabledState: (value) => {
      state.webPushAlertsEnabled = value;
    },
    getInteractionClickSoundEnabled: () => state.interactionClickSoundEnabled,
    setInteractionClickSoundEnabledState: (value) => {
      state.interactionClickSoundEnabled = value;
    },
    getAchievementSoundsEnabled: () => state.achievementSoundsEnabled,
    setAchievementSoundsEnabledState: (value) => {
      state.achievementSoundsEnabled = value;
    },
    getInteractionHapticsEnabled: () => state.interactionHapticsEnabled,
    setInteractionHapticsEnabledState: (value) => {
      state.interactionHapticsEnabled = value;
    },
    getInteractionHapticsIntensity: () => state.interactionHapticsIntensity,
    setInteractionHapticsIntensityState: (value) => {
      state.interactionHapticsIntensity = value;
    },
    getCheckpointAlertSoundEnabled: () => state.checkpointAlertSoundEnabled,
    setCheckpointAlertSoundEnabledState: (value) => {
      state.checkpointAlertSoundEnabled = value;
    },
    getCheckpointAlertToastEnabled: () => state.checkpointAlertToastEnabled,
    setCheckpointAlertToastEnabledState: (value) => {
      state.checkpointAlertToastEnabled = value;
    },
    getCheckpointAlertSoundMode: () => state.checkpointAlertSoundMode,
    setCheckpointAlertSoundModeState: (value) => {
      state.checkpointAlertSoundMode = value;
    },
    getCheckpointAlertToastMode: () => state.checkpointAlertToastMode,
    setCheckpointAlertToastModeState: (value) => {
      state.checkpointAlertToastMode = value;
    },
    getOptimalProductivityStartTime: () => state.optimalProductivityStartTime,
    setOptimalProductivityStartTimeState: (value) => {
      state.optimalProductivityStartTime = value;
    },
    getOptimalProductivityEndTime: () => state.optimalProductivityEndTime,
    setOptimalProductivityEndTimeState: (value) => {
      state.optimalProductivityEndTime = value;
    },
    getOptimalProductivityDays: () => state.optimalProductivityDays,
    setOptimalProductivityDaysState: (value) => {
      state.optimalProductivityDays = value;
    },
    getRewardProgress: () => ({}),
    normalizeRewardProgress: (value) => value,
    currentUid: () => null,
    loadCachedPreferences: () => null,
    loadCachedTaskUi: () => null,
    getCloudPreferencesCache: () => null,
    setCloudPreferencesCache: vi.fn(),
    buildDefaultCloudPreferences: () => ({ schemaVersion: 1 }),
    saveCloudPreferences,
    syncOwnFriendshipProfile: vi.fn(() => Promise.resolve()),
    saveDashboardWidgetState: vi.fn(),
    getDashboardCardSizeMapForStorage: () => ({}),
    getTasks: () => [],
    setTasks: vi.fn(),
    getCurrentEditTask: () => null,
    syncEditCheckpointAlertUi: vi.fn(),
    clearTaskFlipStates: vi.fn(),
    save: vi.fn(),
    render,
    renderDashboardWidgets: vi.fn(),
    closeOverlay: vi.fn(),
    closeConfirm: vi.fn(),
    confirm: vi.fn(),
    escapeHtmlUI: (value) => String(value ?? ""),
    stopCheckpointRepeatAlert: vi.fn(),
    getCurrentAppPage: () => "tasks",
    hasEntitlement: () => true,
    getCurrentPlan: () => "pro",
    showUpgradePrompt: vi.fn(),
  };

  const preferences = createTaskTimerPreferences(ctx);
  preferences.registerPreferenceEvents({ handleAppBackNavigation: () => false });

  return { fakeDocument, localStorageStub, preferences, render, saveCloudPreferences, state };
}

function addOptimalProductivityControls(fakeDocument: FakeDocument) {
  const menu = fakeDocument.addElement(new FakeElement("optimalProductivityDaysMenu"));
  const row = fakeDocument.addElement(new FakeElement("optimalProductivityDaysRow"));
  row.appendChild(menu);
  const dayInputs = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => {
    const label = fakeDocument.addElement(new FakeElement(`optimalProductivityDay${day}`, ["chkRow"]));
    const input = fakeDocument.addElement(new FakeElement(`optimalProductivityDay${day}Input`));
    input.value = day;
    input.checked = true;
    input.dataset.optimalProductivityDay = day;
    label.appendChild(input);
    menu.appendChild(label);
    return input;
  });
  const allButton = fakeDocument.addElement(new FakeElement("optimalProductivityDaysAllBtn"));
  menu.appendChild(allButton);
  const startValue = fakeDocument.addElement(new FakeElement("optimalProductivityStartTimeValue"));
  const endValue = fakeDocument.addElement(new FakeElement("optimalProductivityEndTimeValue"));
  const startButton = fakeDocument.addElement(new FakeElement("optimalProductivityStartTimeButton"));
  const endButton = fakeDocument.addElement(new FakeElement("optimalProductivityEndTimeButton"));
  startButton.appendChild(startValue);
  endButton.appendChild(endValue);
  const startInput = fakeDocument.addElement(new FakeElement("optimalProductivityStartTimeInput"));
  const endInput = fakeDocument.addElement(new FakeElement("optimalProductivityEndTimeInput"));
  startInput.value = "00:00";
  endInput.value = "23:59";
  return { allButton, dayInputs, endButton, endInput, endValue, startButton, startInput, startValue };
}

describe("createTaskTimerPreferences dynamic optimal productivity settings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("persists productivity day changes after settings controls are inserted", () => {
    const { fakeDocument, localStorageStub, state } = createHarness();
    const { dayInputs } = addOptimalProductivityControls(fakeDocument);

    dayInputs.find((input) => input.value === "sun")!.checked = false;
    dayInputs.find((input) => input.value === "sat")!.checked = false;
    fakeDocument.dispatch("change", dayInputs.find((input) => input.value === "sun")!);

    expect(state.optimalProductivityDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY)).toBe("mon,tue,wed,thu,fri");
  });

  it("persists productivity day changes from the React settings event bridge", () => {
    const { fakeDocument, localStorageStub, state } = createHarness();
    const { dayInputs } = addOptimalProductivityControls(fakeDocument);

    dayInputs.find((input) => input.value === "sun")!.checked = false;
    dayInputs.find((input) => input.value === "sat")!.checked = false;
    window.dispatchEvent(
      new CustomEvent("tasktimer:settings-optimal-productivity-days-change", {
        detail: {
          days: ["mon", "tue", "wed", "thu", "fri"],
          inputId: dayInputs.find((input) => input.value === "sun")!.id,
        },
      })
    );

    expect(state.optimalProductivityDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY)).toBe("mon,tue,wed,thu,fri");
  });

  it("persists productivity period changes and updates clock labels after controls are inserted", () => {
    const { fakeDocument, localStorageStub, state } = createHarness();
    const { endInput, endValue, startInput, startValue } = addOptimalProductivityControls(fakeDocument);

    startInput.value = "08:30";
    fakeDocument.dispatch("change", startInput);
    endInput.value = "17:45";
    fakeDocument.dispatch("change", endInput);

    expect(state.optimalProductivityStartTime).toBe("08:30");
    expect(state.optimalProductivityEndTime).toBe("17:45");
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_START_TIME_KEY)).toBe("08:30");
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_END_TIME_KEY)).toBe("17:45");
    expect(startValue.textContent).toBe("8:30 AM");
    expect(endValue.textContent).toBe("5:45 PM");
  });

  it("persists productivity period changes from the React settings event bridge", () => {
    const { fakeDocument, localStorageStub, state } = createHarness();
    const { endInput, endValue, startInput, startValue } = addOptimalProductivityControls(fakeDocument);

    window.dispatchEvent(
      new CustomEvent("tasktimer:settings-optimal-productivity-period-change", {
        detail: { field: "start", value: "06:45", inputId: startInput.id },
      })
    );
    window.dispatchEvent(
      new CustomEvent("tasktimer:settings-optimal-productivity-period-change", {
        detail: { field: "end", value: "15:30", inputId: endInput.id },
      })
    );

    expect(state.optimalProductivityStartTime).toBe("06:45");
    expect(state.optimalProductivityEndTime).toBe("15:30");
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_START_TIME_KEY)).toBe("06:45");
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_END_TIME_KEY)).toBe("15:30");
    expect(startValue.textContent).toBe("6:45 AM");
    expect(endValue.textContent).toBe("3:30 PM");
  });

  it("rejects unchecking the final productivity day", () => {
    const { fakeDocument, localStorageStub, preferences, state } = createHarness();
    const { dayInputs } = addOptimalProductivityControls(fakeDocument);
    preferences.applyOptimalProductivityDaysPreference(["mon"]);
    const monInput = dayInputs.find((input) => input.value === "mon")!;

    monInput.checked = false;
    fakeDocument.dispatch("change", monInput);

    expect(monInput.checked).toBe(true);
    expect(state.optimalProductivityDays).toEqual(["mon"]);
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY)).toBeUndefined();
  });

  it("selects and persists all productivity days from the dynamic all button", () => {
    const { fakeDocument, localStorageStub, preferences, state } = createHarness();
    const { allButton, dayInputs } = addOptimalProductivityControls(fakeDocument);
    preferences.applyOptimalProductivityDaysPreference(["mon", "wed"]);

    fakeDocument.dispatch("click", allButton);

    expect(dayInputs.every((input) => input.checked)).toBe(true);
    expect(state.optimalProductivityDays).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(localStorageStub.get(storageKeys.OPTIMAL_PRODUCTIVITY_DAYS_KEY)).toBe("sun,mon,tue,wed,thu,fri,sat");
  });

  it("syncs already-loaded preferences into controls when the preferences pane becomes active", () => {
    const { fakeDocument, state } = createHarness();
    state.optimalProductivityStartTime = "07:15";
    state.optimalProductivityEndTime = "14:30";
    state.optimalProductivityDays = ["tue", "thu"];
    const { dayInputs, endInput, endValue, startInput, startValue } = addOptimalProductivityControls(fakeDocument);

    window.dispatchEvent(new Event("tasktimer:settings-preferences-active"));

    expect(startInput.value).toBe("07:15");
    expect(endInput.value).toBe("14:30");
    expect(startValue.textContent).toBe("7:15 AM");
    expect(endValue.textContent).toBe("2:30 PM");
    expect(dayInputs.filter((input) => input.checked).map((input) => input.value)).toEqual(["tue", "thu"]);
  });

  it("reveals the native time input when the clock button is clicked", () => {
    const { fakeDocument } = createHarness();
    const { startButton, startInput } = addOptimalProductivityControls(fakeDocument);

    fakeDocument.dispatch("click", startButton);

    expect(startInput.classList.has("isFallbackVisible")).toBe(true);
  });

  it("reveals the native time input from the React settings time picker event", () => {
    const { fakeDocument } = createHarness();
    const { endInput } = addOptimalProductivityControls(fakeDocument);

    window.dispatchEvent(
      new CustomEvent("tasktimer:settings-optimal-productivity-time-picker-open", {
        detail: { field: "end" },
      })
    );

    expect(endInput.classList.has("isFallbackVisible")).toBe(true);
  });
});
