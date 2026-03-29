import type { HistoryByTaskId, HistoryEntry, Task, DeletedTaskMeta } from "../lib/types";
import { cleanupHistory, loadHistory, loadTasks, saveHistory, saveTasks } from "../lib/storage";
import type { AppPage, DashboardAvgRange, DashboardTimelineDensity } from "./types";

type PersistOptions = { deletedTaskIds?: string[] };

type TaskUiCacheShape = {
  historyRangeDaysByTaskId?: Record<string, unknown>;
  historyRangeModeByTaskId?: Record<string, unknown>;
} | null;

type CreateTaskTimerPersistenceOptions = {
  focusSessionNotesKey: string;
  pendingTaskJumpKey: string;
  getTasks: () => Task[];
  setTasks: (value: Task[]) => void;
  getHistoryByTaskId: () => HistoryByTaskId;
  setHistoryByTaskId: (value: HistoryByTaskId) => void;
  getHistoryRangeDaysByTaskId: () => Record<string, 7 | 14>;
  setHistoryRangeDaysByTaskId: (value: Record<string, 7 | 14>) => void;
  getHistoryRangeModeByTaskId: () => Record<string, "entries" | "day">;
  setHistoryRangeModeByTaskId: (value: Record<string, "entries" | "day">) => void;
  getFocusSessionNotesByTaskId: () => Record<string, string>;
  setFocusSessionNotesByTaskId: (value: Record<string, string>) => void;
  getPendingTaskJumpMemory: () => string | null;
  setPendingTaskJumpMemory: (value: string | null) => void;
  getRuntimeDestroyed: () => boolean;
  getCurrentUid: () => string;
  getFocusModeTaskId: () => string | null;
  getFocusSessionNoteSaveTimer: () => number | null;
  setFocusSessionNoteSaveTimer: (value: number | null) => void;
  getFocusSessionNotesInputValue: () => string;
  setFocusSessionNotesInputValue: (value: string) => void;
  setFocusSessionNotesSectionOpen: (open: boolean) => void;
  getCurrentAppPage: () => AppPage;
  getInitialAppPageFromLocation: (fallback: AppPage) => AppPage;
  initialAppPage: AppPage;
  getCloudTaskUiCache: () => unknown;
  loadCachedTaskUi: () => TaskUiCacheShape;
  loadDeletedMeta: () => DeletedTaskMeta;
  setDeletedTaskMeta: (value: DeletedTaskMeta) => void;
  primeDashboardCacheFromShadow: () => void;
  loadFocusSessionNotes: () => Record<string, string>;
  loadAddTaskCustomNames: () => void;
  loadDefaultTaskTimerFormat: () => void;
  loadWeekStartingPreference: () => void;
  loadTaskViewPreference: () => void;
  loadAutoFocusOnTaskLaunchSetting: () => void;
  loadDynamicColorsSetting: () => void;
  loadCheckpointAlertSettings: () => void;
  loadDashboardWidgetState: () => void;
  loadThemePreference: () => void;
  loadMenuButtonStylePreference: () => void;
  syncTaskSettingsUi: () => void;
  loadPinnedHistoryTaskIds: () => void;
  loadModeLabels: () => void;
  backfillHistoryColorsFromSessionLogic: () => void;
  syncModeLabelsUi: () => void;
  applyMainMode: (mode: "mode1" | "mode2" | "mode3") => void;
  applyAppPage: (page: AppPage, opts?: { syncUrl?: "replace" | "push"; pushNavStack?: boolean }) => void;
  applyDashboardOrderFromStorage: () => void;
  applyDashboardCardSizes: () => void;
  renderDashboardPanelMenu: () => void;
  applyDashboardCardVisibility: () => void;
  applyDashboardEditMode: () => void;
  renderDashboardWidgets: () => void;
  maybeRepairHistoryNotesInCloudAfterHydrate?: () => void;
  taskModeOf: (task: Task) => "mode1" | "mode2" | "mode3";
  jumpToTaskById: (taskId: string) => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  normalizeLoadedTask?: (task: Task) => void;
};

export function sanitizeDashboardAvgRange(value: unknown): DashboardAvgRange {
  const raw = String(value || "").trim();
  if (raw === "past30" || raw === "currentMonth") return "past30";
  if (raw === "currentWeek") return "past7";
  return "past7";
}

export function sanitizeDashboardTimelineDensity(value: unknown): DashboardTimelineDensity {
  const raw = String(value || "").trim();
  if (raw === "low" || raw === "high") return raw;
  return "medium";
}

export function dashboardTimelineDensityLabel(value: DashboardTimelineDensity) {
  if (value === "low") return "Low";
  if (value === "high") return "High";
  return "Medium";
}

export function getDashboardTimelineDensityTarget(value: DashboardTimelineDensity) {
  if (value === "low") return 3;
  if (value === "high") return 7;
  return 5;
}

export function createTaskTimerPersistence(options: CreateTaskTimerPersistenceOptions) {
  function load() {
    const loaded = loadTasks();
    if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
      options.setTasks([]);
      return;
    }
    loaded.forEach((task) => {
      const taskWithMode = task as Task & { mode?: "mode1" | "mode2" | "mode3" };
      if (!taskWithMode.mode) taskWithMode.mode = "mode1";
      if (options.normalizeLoadedTask) options.normalizeLoadedTask(task);
    });
    options.setTasks(loaded);
  }

  function save(opts?: PersistOptions) {
    saveTasks(options.getTasks(), opts);
  }

  function savePendingTaskJump(taskId: string | null) {
    const nextValue = taskId ? String(taskId) : null;
    options.setPendingTaskJumpMemory(nextValue);
    try {
      if (nextValue) window.localStorage.setItem(options.pendingTaskJumpKey, nextValue);
      else window.localStorage.removeItem(options.pendingTaskJumpKey);
    } catch {
      // ignore localStorage failures
    }
  }

  function loadPendingTaskJump() {
    const raw = String(options.getPendingTaskJumpMemory() || "").trim();
    if (raw) return raw || null;
    try {
      const stored = String(window.localStorage.getItem(options.pendingTaskJumpKey) || "").trim();
      return stored || null;
    } catch {
      return null;
    }
  }

  function maybeHandlePendingTaskJump() {
    const taskId = loadPendingTaskJump();
    if (!taskId) return;
    if (!options.getTasks().some((row) => String(row.id || "") === taskId)) return;
    savePendingTaskJump(null);
    options.jumpToTaskById(taskId);
    options.maybeRestorePendingTimeGoalFlow();
    window.setTimeout(() => {
      if (options.getRuntimeDestroyed() || loadPendingTaskJump()) return;
      options.maybeRestorePendingTimeGoalFlow();
    }, 120);
  }

  function persistFocusSessionNotes() {
    if (typeof window === "undefined") return;
    try {
      const next: Record<string, string> = {};
      const source = options.getFocusSessionNotesByTaskId();
      Object.keys(source || {}).forEach((taskId) => {
        const value = String(source[taskId] || "").trim();
        if (value) next[taskId] = value;
      });
      if (Object.keys(next).length) window.localStorage.setItem(options.focusSessionNotesKey, JSON.stringify(next));
      else window.localStorage.removeItem(options.focusSessionNotesKey);
    } catch {
      // ignore localStorage failures
    }
  }

  function setFocusSessionDraft(taskId: string, noteRaw: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return;
    const nextValue = String(noteRaw || "").trim();
    const nextDrafts = { ...(options.getFocusSessionNotesByTaskId() || {}) };
    if (nextValue) nextDrafts[taskKey] = nextValue;
    else delete nextDrafts[taskKey];
    options.setFocusSessionNotesByTaskId(nextDrafts);
    persistFocusSessionNotes();
  }

  function getFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    return String(options.getFocusSessionNotesByTaskId()[taskKey] || "");
  }

  function clearFocusSessionDraft(taskId: string) {
    const taskKey = String(taskId || "").trim();
    const current = options.getFocusSessionNotesByTaskId();
    if (!taskKey || !current[taskKey]) return;
    const nextDrafts = { ...current };
    delete nextDrafts[taskKey];
    options.setFocusSessionNotesByTaskId(nextDrafts);
    persistFocusSessionNotes();
  }

  function syncFocusSessionNotesInput(taskId: string | null) {
    options.setFocusSessionNotesInputValue(taskId ? getFocusSessionDraft(taskId) : "");
  }

  function syncFocusSessionNotesAccordion(taskId: string | null) {
    const noteValue = taskId ? getFocusSessionDraft(taskId) : "";
    options.setFocusSessionNotesSectionOpen(!!noteValue.trim());
  }

  function flushPendingFocusSessionNoteSave(taskId?: string | null) {
    const pendingTaskId = String(taskId || options.getFocusModeTaskId() || "").trim();
    const timer = options.getFocusSessionNoteSaveTimer();
    if (timer != null) {
      window.clearTimeout(timer);
      options.setFocusSessionNoteSaveTimer(null);
    }
    if (!pendingTaskId) return;
    const isActiveFocusTask = String(options.getFocusModeTaskId() || "").trim() === pendingTaskId;
    if (isActiveFocusTask) {
      setFocusSessionDraft(pendingTaskId, options.getFocusSessionNotesInputValue());
    }
  }

  function getLiveFocusSessionNoteValue(taskId?: string | null): string {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    if (String(options.getFocusModeTaskId() || "").trim() !== taskKey) return "";
    return String(options.getFocusSessionNotesInputValue() || "").trim();
  }

  function captureSessionNoteSnapshot(taskId?: string | null): string {
    const taskKey = String(taskId || "").trim();
    if (!taskKey) return "";
    flushPendingFocusSessionNoteSave(taskKey);
    const liveNote = getLiveFocusSessionNoteValue(taskKey);
    if (liveNote) {
      setFocusSessionDraft(taskKey, liveNote);
      return liveNote;
    }
    return getFocusSessionDraft(taskKey);
  }

  function historySignature(history: HistoryByTaskId) {
    const parts: string[] = [];
    Object.keys(history || {})
      .sort()
      .forEach((taskId) => {
        const rows = Array.isArray(history?.[taskId]) ? history[taskId] : [];
        const rowSig = rows
          .map(
            (entry: HistoryEntry) =>
              `${Number(entry?.ts || 0)}|${Number(entry?.ms || 0)}|${String(entry?.name || "")}|${String(entry?.note || "")}`
          )
          .join(",");
        parts.push(`${taskId}:${rowSig}`);
      });
    return parts.join("||");
  }

  function loadHistoryIntoMemory() {
    const loadedHistory = loadHistory();
    const cleanedHistory = cleanupHistory(loadedHistory);
    options.setHistoryByTaskId(cleanedHistory);
    if (historySignature(cleanedHistory) !== historySignature(loadedHistory)) {
      saveHistory(cleanedHistory, { showIndicator: false });
    }
  }

  function hasHistoryEntryNotes(history: HistoryByTaskId | null | undefined) {
    return Object.values(history || {}).some(
      (rows) => Array.isArray(rows) && rows.some((row) => typeof row?.note === "string" && row.note.trim())
    );
  }

  function maybeRepairHistoryNotesInCloud() {
    if (!options.getCurrentUid()) return;
    const history = options.getHistoryByTaskId();
    if (!hasHistoryEntryNotes(history)) return;
    options.maybeRepairHistoryNotesInCloudAfterHydrate?.();
  }

  function loadHistoryRangePrefs() {
    options.setHistoryRangeDaysByTaskId({});
    options.setHistoryRangeModeByTaskId({});
    const taskUi = (options.getCloudTaskUiCache() || options.loadCachedTaskUi()) as TaskUiCacheShape;
    if (!taskUi) return;
    const nextDays: Record<string, 7 | 14> = {};
    const nextMode: Record<string, "entries" | "day"> = {};
    Object.keys(taskUi.historyRangeDaysByTaskId || {}).forEach((taskId) => {
      const value = taskUi.historyRangeDaysByTaskId?.[taskId];
      nextDays[taskId] = value === 14 ? 14 : 7;
    });
    Object.keys(taskUi.historyRangeModeByTaskId || {}).forEach((taskId) => {
      const value = taskUi.historyRangeModeByTaskId?.[taskId];
      nextMode[taskId] = value === "day" ? "day" : "entries";
    });
    options.setHistoryRangeDaysByTaskId(nextDays);
    options.setHistoryRangeModeByTaskId(nextMode);
  }

  function hydrateUiStateFromCaches() {
    options.primeDashboardCacheFromShadow();
    options.setDeletedTaskMeta(options.loadDeletedMeta());
    loadHistoryIntoMemory();
    options.setFocusSessionNotesByTaskId(options.loadFocusSessionNotes());
    maybeRepairHistoryNotesInCloud();
    loadHistoryRangePrefs();
    load();
    options.loadAddTaskCustomNames();
    options.loadDefaultTaskTimerFormat();
    options.loadWeekStartingPreference();
    options.loadTaskViewPreference();
    options.loadAutoFocusOnTaskLaunchSetting();
    options.loadDynamicColorsSetting();
    options.loadCheckpointAlertSettings();
    options.loadDashboardWidgetState();
    options.loadThemePreference();
    options.loadMenuButtonStylePreference();
    options.syncTaskSettingsUi();
    options.loadPinnedHistoryTaskIds();
    options.loadModeLabels();
    options.backfillHistoryColorsFromSessionLogic();
    options.syncModeLabelsUi();
    options.applyMainMode("mode1");
    options.applyAppPage(options.getInitialAppPageFromLocation(options.initialAppPage), { syncUrl: "replace" });
    options.applyDashboardOrderFromStorage();
    options.applyDashboardCardSizes();
    options.renderDashboardPanelMenu();
    options.applyDashboardCardVisibility();
    options.applyDashboardEditMode();
    if (options.getCurrentAppPage() === "dashboard") {
      options.renderDashboardWidgets();
    }
  }

  return {
    load,
    save,
    savePendingTaskJump,
    loadPendingTaskJump,
    maybeHandlePendingTaskJump,
    persistFocusSessionNotes,
    setFocusSessionDraft,
    getFocusSessionDraft,
    clearFocusSessionDraft,
    syncFocusSessionNotesInput,
    syncFocusSessionNotesAccordion,
    flushPendingFocusSessionNoteSave,
    getLiveFocusSessionNoteValue,
    captureSessionNoteSnapshot,
    loadHistoryIntoMemory,
    maybeRepairHistoryNotesInCloud,
    loadHistoryRangePrefs,
    hydrateUiStateFromCaches,
  };
}
