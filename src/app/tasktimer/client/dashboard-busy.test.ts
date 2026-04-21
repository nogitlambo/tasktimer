import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTimerDashboardBusy } from "./dashboard-busy";
import { createTaskTimerMutableStore } from "./mutable-store";

describe("dashboard-busy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    class FakeElement {
      isConnected = true;
      focus = vi.fn();
    }
    Object.defineProperty(globalThis, "HTMLElement", {
      configurable: true,
      value: FakeElement,
    });
    const body = new FakeElement();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        activeElement: body,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        setTimeout,
        clearTimeout,
      },
    });
  });

  it("force-clears the busy state if it outlives the failsafe window", async () => {
    const overlayEl = {
      classList: { toggle: vi.fn() },
      setAttribute: vi.fn(),
      focus: vi.fn(),
    } as unknown as HTMLElement;
    const textEl = {
      textContent: "",
    } as unknown as HTMLElement;
    const shellContentEl = {
      classList: { toggle: vi.fn() },
    } as unknown as HTMLElement;
    const state = createTaskTimerMutableStore({
      stack: [] as Array<{ key: number; message: string }>,
      keySeq: 0,
      overlayActive: false,
      restoreFocusEl: null as HTMLElement | null,
      shownAtMs: 0,
      hideTimer: null as number | null,
    });
    const syncDashboardRefreshButtonUi = vi.fn();

    const api = createTaskTimerDashboardBusy({
      state,
      nowMs: () => Date.now(),
      minVisibleMs: 420,
      getBusyTargets: () => [],
      getOverlayEl: () => overlayEl,
      getTextEl: () => textEl,
      getShellContentEl: () => shellContentEl,
      syncDashboardRefreshButtonUi,
    });

    api.showIndicator("Refreshing...");
    expect(api.isBusy()).toBe(true);

    await vi.advanceTimersByTimeAsync(20000);

    expect(api.isBusy()).toBe(false);
    expect(state.get("stack")).toHaveLength(0);
    expect(syncDashboardRefreshButtonUi).toHaveBeenCalled();
  });
});
