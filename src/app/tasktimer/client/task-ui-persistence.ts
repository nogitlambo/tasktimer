import type { TaskTimerTaskUiPersistenceContext } from "./context";

type TaskUiCacheShape = {
  historyRangeDaysByTaskId?: Record<string, unknown>;
  historyRangeModeByTaskId?: Record<string, unknown>;
  pinnedHistoryTaskIds?: unknown;
  customTaskNames?: unknown;
} | null;

export function createTaskTimerTaskUiPersistence(ctx: TaskTimerTaskUiPersistenceContext) {
  const { els } = ctx;

  function persistTaskUiToCloud() {
    const uid = ctx.getCurrentUid();
    if (!uid) return;
    const nextTaskUi = {
      historyRangeDaysByTaskId: ctx.getHistoryRangeDaysByTaskId(),
      historyRangeModeByTaskId: ctx.getHistoryRangeModeByTaskId(),
      pinnedHistoryTaskIds: Array.from(ctx.getPinnedHistoryTaskIds()),
      customTaskNames: ctx.getAddTaskCustomNames().slice(0, 5),
    };
    ctx.setCloudTaskUiCache(nextTaskUi);
    ctx.saveCloudTaskUi(nextTaskUi);
  }

  function backfillHistoryColorsFromSessionLogic() {
    const historyByTaskId = ctx.getHistoryByTaskId();
    if (!historyByTaskId || typeof historyByTaskId !== "object") return;
    let changed = false;

    Object.keys(historyByTaskId).forEach((taskId) => {
      const entries = historyByTaskId[taskId];
      if (!Array.isArray(entries) || entries.length === 0) return;
      const task = ctx.getTasks().find((row) => String(row.id || "") === String(taskId));
      if (!task) return;

      entries.forEach((entry: Record<string, unknown> | null | undefined) => {
        if (!entry) return;
        const msRaw = entry.ms;
        const ms = Number.isFinite(Number(msRaw)) ? Math.max(0, Number(msRaw)) : 0;
        const nextColor = ctx.sessionColorForTaskMs(task, ms);
        if (entry.color !== nextColor) {
          (entry as { color?: string }).color = nextColor;
          changed = true;
        }
      });
    });

    if (changed) ctx.saveHistory(historyByTaskId, { showIndicator: false });
  }

  function loadPinnedHistoryTaskIds() {
    const taskUi = (ctx.getCloudTaskUiCache() || ctx.loadCachedTaskUi()) as TaskUiCacheShape;
    const parsed = taskUi?.pinnedHistoryTaskIds;
    if (!Array.isArray(parsed)) {
      ctx.setPinnedHistoryTaskIds(new Set<string>());
      return;
    }
    ctx.setPinnedHistoryTaskIds(new Set<string>(parsed.map((value) => String(value || "").trim()).filter(Boolean)));
  }

  function savePinnedHistoryTaskIds() {
    persistTaskUiToCloud();
  }

  function setWorkingIndicatorVisible(isOn: boolean, message?: string) {
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    const textEl = els.historySaveWorkingText as HTMLElement | null;
    if (textEl && typeof message === "string" && message.trim()) {
      textEl.textContent = message.trim();
    } else if (textEl && !isOn) {
      textEl.textContent = "";
    }
    if (!indicatorEl) return;
    indicatorEl.classList.toggle("isOn", !!isOn);
    indicatorEl.setAttribute("aria-hidden", isOn ? "false" : "true");
  }

  function getWorkingIndicatorBusyTargets() {
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    const seen = new Set<HTMLElement>();
    return [
      els.appRoot as HTMLElement | null,
      els.friendRequestModal as HTMLElement | null,
      els.friendProfileModal as HTMLElement | null,
      els.confirmOverlay as HTMLElement | null,
    ].filter((node): node is HTMLElement => {
      if (!node || node === indicatorEl || seen.has(node)) return false;
      seen.add(node);
      return true;
    });
  }

  function activateWorkingIndicatorOverlay() {
    if (ctx.getWorkingIndicatorOverlayActive()) return;
    ctx.setWorkingIndicatorOverlayActive(true);
    ctx.setWorkingIndicatorRestoreFocusEl(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    getWorkingIndicatorBusyTargets().forEach((node) => {
      node.setAttribute("data-groups-busy-prev-inert", node.hasAttribute("inert") ? "true" : "false");
      node.setAttribute("data-groups-busy-prev-aria-hidden", node.getAttribute("aria-hidden") ?? "");
      node.setAttribute("inert", "");
      node.setAttribute("aria-hidden", "true");
    });
    const indicatorEl = els.historySaveWorkingIndicator as HTMLElement | null;
    try {
      indicatorEl?.focus({ preventScroll: true });
    } catch {
      indicatorEl?.focus();
    }
  }

  function deactivateWorkingIndicatorOverlay() {
    if (!ctx.getWorkingIndicatorOverlayActive()) return;
    ctx.setWorkingIndicatorOverlayActive(false);
    getWorkingIndicatorBusyTargets().forEach((node) => {
      const prevInert = node.getAttribute("data-groups-busy-prev-inert");
      const prevAriaHidden = node.getAttribute("data-groups-busy-prev-aria-hidden");
      node.removeAttribute("data-groups-busy-prev-inert");
      node.removeAttribute("data-groups-busy-prev-aria-hidden");
      if (prevInert === "true") node.setAttribute("inert", "");
      else node.removeAttribute("inert");
      if (prevAriaHidden) node.setAttribute("aria-hidden", prevAriaHidden);
      else node.removeAttribute("aria-hidden");
    });
    const restoreEl = ctx.getWorkingIndicatorRestoreFocusEl();
    ctx.setWorkingIndicatorRestoreFocusEl(null);
    if (restoreEl && restoreEl.isConnected) {
      try {
        restoreEl.focus({ preventScroll: true });
      } catch {
        restoreEl.focus();
      }
    }
  }

  function showWorkingIndicator(message: string) {
    const normalizedMessage = String(message || "").trim() || "Working...";
    const key = ctx.getWorkingIndicatorKeySeq() + 1;
    ctx.setWorkingIndicatorKeySeq(key);
    const stack = ctx.getWorkingIndicatorStack();
    stack.push({ key, message: normalizedMessage });
    if (stack.length === 1) activateWorkingIndicatorOverlay();
    setWorkingIndicatorVisible(true, normalizedMessage);
    return key;
  }

  function hideWorkingIndicator(key?: number) {
    const stack = ctx.getWorkingIndicatorStack();
    if (typeof key === "number") {
      const index = stack.findIndex((entry) => entry.key === key);
      if (index >= 0) stack.splice(index, 1);
    } else {
      stack.pop();
    }
    const current = stack[stack.length - 1] || null;
    if (!current) deactivateWorkingIndicatorOverlay();
    setWorkingIndicatorVisible(!!current, current?.message);
  }

  return {
    loadPinnedHistoryTaskIds,
    savePinnedHistoryTaskIds,
    persistTaskUiToCloud,
    backfillHistoryColorsFromSessionLogic,
    showWorkingIndicator,
    hideWorkingIndicator,
    getWorkingIndicatorBusyTargets,
  };
}
