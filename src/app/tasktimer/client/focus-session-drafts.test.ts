import { describe, expect, it, vi } from "vitest";
import { createFocusSessionDrafts } from "./focus-session-drafts";

function createHarness() {
  let drafts: Record<string, string> = {};
  let timer: number | null = null;
  let input = "";
  let activeTaskId: string | null = "task-1";
  const persisted: Record<string, string>[] = [];
  const draftsApi = createFocusSessionDrafts(
    {
      getDrafts: () => drafts,
      setDrafts: (next) => {
        drafts = next;
      },
      getActiveTaskId: () => activeTaskId,
      getPendingSaveTimer: () => timer,
      setPendingSaveTimer: (next) => {
        timer = next;
      },
      getInputValue: () => input,
      setInputValue: (next) => {
        input = next;
      },
    },
    {
      load: () => ({ "task-1": "loaded" }),
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
    getDrafts: () => drafts,
    getTimer: () => timer,
  };
}

describe("focus session drafts", () => {
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
});
