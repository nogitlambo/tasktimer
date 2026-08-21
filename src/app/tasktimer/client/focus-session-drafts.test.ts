import { describe, expect, it, vi } from "vitest";
import { createFocusSessionDrafts } from "./focus-session-drafts";

function createHarness() {
  let drafts: Record<string, string> = {};
  let timer: number | null = null;
  let input = "";
  let activeTaskId: string | null = "task-1";
  let persistedLiveValue = "";
  let sectionOpen = false;
  const persisted: Record<string, string>[] = [];
  const draftsApi = createFocusSessionDrafts(
    {
      getDrafts: () => drafts,
      setDrafts: (next) => {
        drafts = next;
      },
      getActiveTaskId: () => activeTaskId,
      getPersistedLiveValue: () => persistedLiveValue,
      getPendingSaveTimer: () => timer,
      setPendingSaveTimer: (next) => {
        timer = next;
      },
      getInputValue: () => input,
      setInputValue: (next) => {
        input = next;
      },
      setSectionOpen: (open) => {
        sectionOpen = open;
      },
    },
    {
      load: () => ({ " task-1 ": " loaded ", " ": "ignored", "task-2": "   " }),
      persist: (next) => persisted.push(next),
    }
  );
  return {
    draftsApi,
    persisted,
    setInput: (next: string) => {
      input = next;
    },
    setTimer: (next: number | null) => {
      timer = next;
    },
    setActiveTaskId: (next: string | null) => {
      activeTaskId = next;
    },
    setPersistedLiveValue: (next: string) => {
      persistedLiveValue = next;
    },
    getDrafts: () => drafts,
    getTimer: () => timer,
    getInput: () => input,
    getSectionOpen: () => sectionOpen,
  };
}

describe("focus session drafts", () => {
  it("loads normalized drafts into the owned state", () => {
    const harness = createHarness();

    expect(harness.draftsApi.load()).toEqual({ "task-1": "loaded" });
    expect(harness.getDrafts()).toEqual({ "task-1": "loaded" });
  });

  it("owns set, clear, and persistence normalization", () => {
    const harness = createHarness();

    harness.draftsApi.setDraft(" task-1 ", "  note  ");
    expect(harness.getDrafts()).toEqual({ "task-1": "note" });
    expect(harness.persisted.at(-1)).toEqual({ "task-1": "note" });

    harness.draftsApi.clearDraft("task-1");
    expect(harness.getDrafts()).toEqual({});
    expect(harness.persisted.at(-1)).toEqual({});
  });

  it("flushes pending active task input before capture", () => {
    const harness = createHarness();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
    harness.setInput(" live note ");
    harness.setTimer(123);

    expect(harness.draftsApi.captureSnapshot("task-1")).toBe("live note");
    expect(harness.getTimer()).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(123);
    expect(harness.getDrafts()).toEqual({ "task-1": "live note" });

    clearTimeoutSpy.mockRestore();
  });

  it("synchronizes the active persisted live note ahead of the local draft", () => {
    const harness = createHarness();
    harness.draftsApi.setDraft("task-1", "local draft");
    harness.setPersistedLiveValue("cloud note");

    harness.draftsApi.syncActive();

    expect(harness.getInput()).toBe("cloud note");
    expect(harness.getSectionOpen()).toBe(true);

    harness.setActiveTaskId(null);
    harness.draftsApi.syncActive();
    expect(harness.getInput()).toBe("");
    expect(harness.getSectionOpen()).toBe(false);
  });

  it("captures reset input without flushing the pending save timer", () => {
    const harness = createHarness();
    harness.setInput("reset note");
    harness.setTimer(456);

    expect(harness.draftsApi.captureResetActionSnapshot("task-1")).toBe("reset note");
    expect(harness.getDrafts()).toEqual({ "task-1": "reset note" });
    expect(harness.getTimer()).toBe(456);
  });
});
