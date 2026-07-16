import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchModuleIntroTourStartEvent,
  getModuleIntroTourStep,
  getNextModuleIntroTourIndex,
  isFinalModuleIntroTourStep,
  moduleIntroTourPendingStorageKey,
  MODULE_INTRO_TOUR_STEPS,
  normalizeModuleIntroTourPage,
  readLocalModuleIntroTourPending,
  TASKTIMER_MODULE_INTRO_TOUR_START_EVENT,
} from "./module-intro-tour";

function stubWindow() {
  const storage = new Map<string, string>();
  const listeners = new Map<string, EventListener[]>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
    },
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      listeners.set(type, [...(listeners.get(type) || []), listener]);
    }),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((event: Event) => {
      for (const listener of listeners.get(event.type) || []) listener(event);
      return true;
    }),
  });
  return { storage, listeners };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("module intro tour helpers", () => {
  it("defines the post-onboarding module sequence", () => {
    expect(MODULE_INTRO_TOUR_STEPS.map((step) => step.page)).toEqual([
      "tasks",
      "dashboard",
      "notes",
      "friends",
      "leaderboard",
    ]);
  });

  it("normalizes only pages included in the tour", () => {
    expect(normalizeModuleIntroTourPage("tasks")).toBe("tasks");
    expect(normalizeModuleIntroTourPage("history")).toBeNull();
    expect(normalizeModuleIntroTourPage("schedule")).toBeNull();
    expect(normalizeModuleIntroTourPage("settings")).toBeNull();
    expect(normalizeModuleIntroTourPage("")).toBeNull();
  });

  it("advances through steps and detects the final step", () => {
    expect(getModuleIntroTourStep(-1).page).toBe("tasks");
    expect(getNextModuleIntroTourIndex(0)).toBe(1);
    expect(isFinalModuleIntroTourStep(0)).toBe(false);
    expect(getNextModuleIntroTourIndex(MODULE_INTRO_TOUR_STEPS.length - 1)).toBeNull();
    expect(isFinalModuleIntroTourStep(MODULE_INTRO_TOUR_STEPS.length - 1)).toBe(true);
  });

  it("dispatches start events and stores a pending marker", () => {
    const { storage } = stubWindow();
    const events: Event[] = [];
    window.addEventListener(TASKTIMER_MODULE_INTRO_TOUR_START_EVENT, (event) => events.push(event));

    dispatchModuleIntroTourStartEvent("uid-1");

    expect(events).toHaveLength(1);
    expect((events[0] as CustomEvent).detail).toEqual({ uid: "uid-1" });
    expect(readLocalModuleIntroTourPending("uid-1")).toBe(true);
    expect(storage.get(moduleIntroTourPendingStorageKey("uid-1"))).toBe("true");
  });
});
