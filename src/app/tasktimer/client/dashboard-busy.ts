import type { TaskTimerMutableStore } from "./mutable-store";

export type TaskTimerDashboardBusyState = {
  stack: Array<{ key: number; message: string }>;
  keySeq: number;
  overlayActive: boolean;
  restoreFocusEl: HTMLElement | null;
  shownAtMs: number;
  hideTimer: number | null;
};

type TaskTimerDashboardBusyOptions = {
  state: TaskTimerMutableStore<TaskTimerDashboardBusyState>;
  nowMs: () => number;
  minVisibleMs: number;
  getBusyTargets: () => HTMLElement[];
  getOverlayEl: () => HTMLElement | null;
  getTextEl: () => HTMLElement | null;
  getShellContentEl: () => HTMLElement | null;
  syncDashboardRefreshButtonUi: () => void;
};

export function createTaskTimerDashboardBusy(options: TaskTimerDashboardBusyOptions) {
  const { state } = options;
  const DASHBOARD_BUSY_FAILSAFE_MS = 20000;

  function isBusy() {
    return state.get("overlayActive") || state.get("stack").length > 0;
  }

  function setIndicatorVisible(isOn: boolean, message?: string) {
    const overlayEl = options.getOverlayEl();
    const textEl = options.getTextEl();
    const shellContentEl = options.getShellContentEl();
    if (textEl && typeof message === "string" && message.trim()) {
      textEl.textContent = message.trim();
    } else if (textEl && !isOn) {
      textEl.textContent = "Refreshing...";
    }
    shellContentEl?.classList.toggle("isDashboardBusy", !!isOn);
    if (!overlayEl) return;
    overlayEl.classList.toggle("isOn", !!isOn);
    overlayEl.setAttribute("aria-hidden", isOn ? "false" : "true");
    options.syncDashboardRefreshButtonUi();
  }

  function activateOverlay() {
    if (state.get("overlayActive")) return;
    state.set("overlayActive", true);
    state.set("shownAtMs", options.nowMs());
    state.set("restoreFocusEl", document.activeElement instanceof HTMLElement ? document.activeElement : null);
    options.getBusyTargets().forEach((node) => {
      node.setAttribute("data-dashboard-busy-prev-inert", node.hasAttribute("inert") ? "true" : "false");
      node.setAttribute("data-dashboard-busy-prev-aria-hidden", node.getAttribute("aria-hidden") ?? "");
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });
    const overlayEl = options.getOverlayEl();
    try {
      overlayEl?.focus({ preventScroll: true });
    } catch {
      overlayEl?.focus();
    }
  }

  function deactivateOverlay() {
    if (!state.get("overlayActive")) return;
    state.set("overlayActive", false);
    options.getBusyTargets().forEach((node) => {
      const prevInert = node.getAttribute("data-dashboard-busy-prev-inert");
      const prevAriaHidden = node.getAttribute("data-dashboard-busy-prev-aria-hidden");
      node.removeAttribute("data-dashboard-busy-prev-inert");
      node.removeAttribute("data-dashboard-busy-prev-aria-hidden");
      if (prevInert === "true") node.setAttribute("inert", "");
      else node.removeAttribute("inert");
      if (prevAriaHidden) node.setAttribute("aria-hidden", prevAriaHidden);
      else node.removeAttribute("aria-hidden");
    });
    const restoreEl = state.get("restoreFocusEl");
    state.set("restoreFocusEl", null);
    if (restoreEl && restoreEl.isConnected) {
      try {
        restoreEl.focus({ preventScroll: true });
      } catch {
        restoreEl.focus();
      }
    }
  }

  function showIndicator(message = "Refreshing...") {
    if (state.get("hideTimer") != null) {
      window.clearTimeout(state.get("hideTimer") as number);
      state.set("hideTimer", null);
    }
    const normalizedMessage = String(message || "").trim() || "Refreshing...";
    const key = state.get("keySeq") + 1;
    state.set("keySeq", key);
    state.get("stack").push({ key, message: normalizedMessage });
    if (state.get("stack").length === 1) activateOverlay();
    setIndicatorVisible(true, normalizedMessage);
    state.set(
      "hideTimer",
      window.setTimeout(() => {
        state.set("hideTimer", null);
        state.get("stack").length = 0;
        setIndicatorVisible(false);
        deactivateOverlay();
      }, DASHBOARD_BUSY_FAILSAFE_MS)
    );
    return key;
  }

  function hideIndicator(key?: number) {
    if (state.get("hideTimer") != null) {
      window.clearTimeout(state.get("hideTimer") as number);
      state.set("hideTimer", null);
    }
    if (typeof key === "number") {
      const index = state.get("stack").findIndex((entry) => entry.key === key);
      if (index >= 0) state.get("stack").splice(index, 1);
    } else {
      state.get("stack").length = 0;
    }
    const current = state.get("stack")[state.get("stack").length - 1] || null;
    if (current) {
      setIndicatorVisible(true, current.message);
      return;
    }
    const remainingMs = Math.max(0, options.minVisibleMs - Math.max(0, options.nowMs() - state.get("shownAtMs")));
    state.set(
      "hideTimer",
      window.setTimeout(() => {
        state.set("hideTimer", null);
        if (state.get("stack").length) {
          const latest = state.get("stack")[state.get("stack").length - 1] || null;
          if (latest) setIndicatorVisible(true, latest.message);
          return;
        }
        setIndicatorVisible(false);
        deactivateOverlay();
      }, remainingMs)
    );
  }

  function destroy() {
    if (state.get("hideTimer") != null) window.clearTimeout(state.get("hideTimer") as number);
    state.set("hideTimer", null);
    state.get("stack").length = 0;
    setIndicatorVisible(false);
    deactivateOverlay();
  }

  return {
    isBusy,
    setIndicatorVisible,
    activateOverlay,
    deactivateOverlay,
    showIndicator,
    hideIndicator,
    destroy,
  };
}
