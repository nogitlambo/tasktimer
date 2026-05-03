/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task } from "../lib/types";
import type { TaskTimerHistoryManagerContext } from "./context";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import {
  allocateHistoryGenDailyBudgets,
  buildHistoryGenTaskGoal,
  formatHistoryGenGoalValue,
  formatHistoryGenMinute,
  getHistoryGenWeekKey,
  parseHistoryGenTimeToMinute,
} from "./history-manager-generation";
import { renderHistoryManagerHtml, resolveHistoryManagerTaskIdFilter } from "./history-manager-render";
import {
  buildHistoryManagerRowKey,
  groupSelectedHistoryRowsByTask,
  createDefaultHistoryManagerManualDraft,
  parseHistoryManagerManualDraft,
  type HistoryGenParams,
  type HistoryGenTaskGoal,
  type HistoryManagerManualDraft,
} from "./history-manager-shared";
import { createHistoryEntrySummaryInteraction } from "./history-entry-summary-interaction";
import {
  OPEN_HISTORY_MANAGER_MANUAL_ENTRY_EVENT,
  type OpenHistoryManagerManualEntryDetail,
} from "./history-manager-events";

type HistoryGenPreview = {
  params: HistoryGenParams;
  perTaskCount: Record<string, number>;
  totalGenerated: number;
  nextHistory: HistoryByTaskId;
  generatedGoalsByTaskId: Record<string, HistoryGenTaskGoal>;
  existingGoalsByTaskId: Record<string, HistoryGenTaskGoal>;
  limitedTaskIds: string[];
};

export function createTaskTimerHistoryManager(ctx: TaskTimerHistoryManagerContext) {
  const { els } = ctx;
  let manualEntryDraftsByTaskId: Record<string, HistoryManagerManualDraft> = {};
  let activeManualEntryTaskId: string | null = null;
  let flashedManualEntryRowId: string | null = null;
  let flashedManualEntryTimeout: number | null = null;
  let historyManagerLoadCycle = 0;
  let historyManagerLoading = false;

  function setHistoryManagerLoading(loading: boolean) {
    historyManagerLoading = loading;
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-busy", loading ? "true" : "false");
      (els.historyManagerScreen as HTMLElement).classList.toggle("is-loading", loading);
    }
    if (els.historyManagerLoadingOverlay) {
      els.historyManagerLoadingOverlay.hidden = !loading;
    }
  }

  function syncManualEntryOverlayFromDraft(taskId: string) {
    const draft = manualEntryDraftsByTaskId[taskId] || createDefaultHistoryManagerManualDraft(Date.now());
    if (els.historyManagerManualDateTimeInput) els.historyManagerManualDateTimeInput.value = draft.dateTimeValue || "";
    els.historyManagerManualDateTimeInput?.parentElement?.setAttribute(
      "data-empty",
      draft.dateTimeValue ? "false" : "true"
    );
    if (els.historyManagerManualHoursInput) els.historyManagerManualHoursInput.value = draft.hoursValue || "";
    if (els.historyManagerManualMinutesInput) els.historyManagerManualMinutesInput.value = draft.minutesValue || "";
    if (els.historyManagerManualNoteInput) els.historyManagerManualNoteInput.value = draft.noteValue || "";
    const sentimentButtons = Array.from(
      ((els.historyManagerManualEntryDifficultyGroup as HTMLElement | null)?.querySelectorAll?.("[data-completion-difficulty]") ||
        []) as Iterable<Element>
    );
    sentimentButtons.forEach((button) => {
      const selected =
        normalizeCompletionDifficulty((button as HTMLElement).dataset.completionDifficulty) ===
        normalizeCompletionDifficulty(draft.completionDifficulty);
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", selected ? "true" : "false");
    });
    if (els.historyManagerManualEntryError) {
      els.historyManagerManualEntryError.textContent = draft.errorMessage || "";
      (els.historyManagerManualEntryError as HTMLElement).style.display = draft.errorMessage ? "block" : "none";
    }
  }

  function openManualEntryOverlay(taskId: string, options?: { forceTaskName?: string | null; allowDeleted?: boolean }) {
    const meta = getTaskMetaForHistoryId(taskId);
    if (meta.deleted && !options?.allowDeleted) return;
    if (!manualEntryDraftsByTaskId[taskId]) {
      manualEntryDraftsByTaskId = {
        ...manualEntryDraftsByTaskId,
        [taskId]: createDefaultHistoryManagerManualDraft(Date.now()),
      };
    }
    activeManualEntryTaskId = taskId;
    if (els.historyManagerManualEntryTitle) {
      const taskName = String(options?.forceTaskName || meta.name || "This Task").trim() || "This Task";
      els.historyManagerManualEntryTitle.textContent = `Add Manual Entry for ${taskName}`;
    }
    if (els.historyManagerManualEntryMeta) {
      els.historyManagerManualEntryMeta.textContent = "";
      els.historyManagerManualEntryMeta.hidden = true;
    }
    syncManualEntryOverlayFromDraft(taskId);
    if (els.historyManagerManualEntryOverlay) {
      els.historyManagerManualEntryOverlay.style.display = "flex";
      els.historyManagerManualEntryOverlay.setAttribute("aria-hidden", "false");
    }
    window.setTimeout(() => {
      try {
        els.historyManagerManualDateTimeBtn?.focus({ preventScroll: true });
      } catch {
        els.historyManagerManualDateTimeBtn?.focus();
      }
    }, 0);
  }

  function closeManualEntryOverlay(options?: { discardDraft?: boolean }) {
    const taskId = activeManualEntryTaskId;
    if (options?.discardDraft && taskId && manualEntryDraftsByTaskId[taskId]) {
      const nextDrafts = { ...manualEntryDraftsByTaskId };
      delete nextDrafts[taskId];
      manualEntryDraftsByTaskId = nextDrafts;
    }
    activeManualEntryTaskId = null;
    if (els.historyManagerManualEntryOverlay) {
      els.historyManagerManualEntryOverlay.style.display = "none";
      els.historyManagerManualEntryOverlay.setAttribute("aria-hidden", "true");
    }
  }

  function openManualEntryDateTimePicker() {
    const input = els.historyManagerManualDateTimeInput;
    if (!input) return;
    try {
      if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
        (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      } else {
        input.focus();
        input.click();
      }
    } catch {
      try {
        input.focus();
        input.click();
      } catch {
        input.focus();
      }
    }
  }

  function clearFlashedManualEntryRow(scheduleRender = false) {
    if (flashedManualEntryTimeout != null) {
      window.clearTimeout(flashedManualEntryTimeout);
      flashedManualEntryTimeout = null;
    }
    if (!flashedManualEntryRowId) return;
    flashedManualEntryRowId = null;
    if (scheduleRender && isHistoryManagerOpen()) renderHistoryManager();
  }

  function flashHistoryManagerRow(rowId: string) {
    clearFlashedManualEntryRow(false);
    flashedManualEntryRowId = rowId;
    flashedManualEntryTimeout = window.setTimeout(() => {
      flashedManualEntryTimeout = null;
      if (flashedManualEntryRowId !== rowId) return;
      flashedManualEntryRowId = null;
      if (isHistoryManagerOpen()) renderHistoryManager();
    }, 3000);
  }

  function scrollToFlashedManualEntryRow() {
    if (!flashedManualEntryRowId || !els.hmList) return;
    const row = els.hmList.querySelector<HTMLElement>(`[data-hm-row-id="${flashedManualEntryRowId}"]`);
    if (!row) return;
    try {
      row.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch {
      row.scrollIntoView();
    }
  }

  function getFinalizedHistoryByTaskId(): HistoryByTaskId {
    const projected = ctx.getHistoryByTaskId() || {};
    const next: HistoryByTaskId = {};
    Object.keys(projected).forEach((taskId) => {
      const rows = Array.isArray(projected[taskId]) ? projected[taskId] : [];
      next[taskId] = rows.filter((entry: any) => !entry?.isLiveSession);
    });
    return next;
  }

  function canUseAdvancedHistory() {
    return ctx.hasEntitlement("advancedHistory");
  }

  function canUseAdvancedBackup() {
    return ctx.hasEntitlement("advancedBackup");
  }

  function getTaskMetaForHistoryId(taskId: string) {
    const normalizedTaskId = String(taskId || "").trim();
    const tasks = ctx.getTasks();
    const historyByTaskId = getFinalizedHistoryByTaskId();
    const deletedTaskMeta = ctx.getDeletedTaskMeta();
    const t = tasks.find((x) => String(x?.id || "").trim() === normalizedTaskId);
    if (t) return { name: t.name, color: (t as any).color, deleted: false };

    const dm = deletedTaskMeta && (deletedTaskMeta as any)[normalizedTaskId];
    if (dm) return { name: dm.name || "Deleted Task", color: dm.color || null, deleted: true };

    const arr = historyByTaskId && historyByTaskId[normalizedTaskId];
    if (arr && arr.length) {
      const e = arr[arr.length - 1] as any;
      return { name: e.name || "Deleted Task", color: e.color || null, deleted: true };
    }

    return { name: "Deleted Task", color: null, deleted: true };
  }

  function exportHistoryManagerCsv() {
    const historyByTaskId = getFinalizedHistoryByTaskId();
    const tasks = ctx.getTasks();
    const rows: string[] = [];
    rows.push(["taskId", "taskName", "entryName", "ts", "dateTimeIso", "ms", "color", "note"].join(","));

    const taskIds = Object.keys(historyByTaskId || {});
    taskIds.sort((a, b) => {
      const ai = tasks.findIndex((t) => String(t.id || "") === String(a));
      const bi = tasks.findIndex((t) => String(t.id || "") === String(b));
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return String(a).localeCompare(String(b));
    });

    taskIds.forEach((taskId) => {
      const entries = Array.isArray(historyByTaskId?.[taskId]) ? (historyByTaskId[taskId] || []).slice() : [];
      if (!entries.length) return;
      entries.sort((a: any, b: any) => (+a.ts || 0) - (+b.ts || 0));
      const taskMeta = getTaskMetaForHistoryId(taskId);
      const taskName = String(taskMeta?.name || "").trim() || "Task";
      entries.forEach((entry: any) => {
        const ts = Number.isFinite(+entry?.ts) ? Math.floor(+entry.ts) : 0;
        const ms = Number.isFinite(+entry?.ms) ? Math.max(0, Math.floor(+entry.ms)) : 0;
        if (ts <= 0) return;
        const dateTimeIso = new Date(ts).toISOString();
        const entryName = String(entry?.name || "").trim() || taskName;
        const color = entry?.color == null ? "" : String(entry.color);
        const note = ctx.getHistoryEntryNote(entry);
        rows.push(
          [
            ctx.csvEscape(taskId),
            ctx.csvEscape(taskName),
            ctx.csvEscape(entryName),
            ctx.csvEscape(ts),
            ctx.csvEscape(dateTimeIso),
            ctx.csvEscape(ms),
            ctx.csvEscape(color),
            ctx.csvEscape(note),
          ].join(",")
        );
      });
    });

    const d = new Date();
    const y = d.getFullYear();
    const mo = ctx.formatTwo(d.getMonth() + 1);
    const da = ctx.formatTwo(d.getDate());
    const hh = ctx.formatTwo(d.getHours());
    const mi = ctx.formatTwo(d.getMinutes());
    const ss = ctx.formatTwo(d.getSeconds());
    const filename = `tasktimer-history-${y}${mo}${da}-${hh}${mi}${ss}.csv`;
    ctx.downloadCsvFile(filename, rows.join("\n"));
  }

  function openHistoryManagerNoteOverlay(entry: { ts: unknown; ms: unknown; name: unknown; note?: unknown; taskId?: unknown }) {
    const taskId = String(entry?.taskId || "").trim();
    historyEntrySummaryInteraction.openSummary(taskId, [entry]);
  }

  const historyEntrySummaryInteraction = createHistoryEntrySummaryInteraction({
    owner: "manager",
    elements: {
      overlay: els.historyEntryNoteOverlay as HTMLElement | null,
      title: els.historyEntryNoteTitle as HTMLElement | null,
      meta: els.historyEntryNoteMeta as HTMLElement | null,
      body: els.historyEntryNoteBody as HTMLElement | null,
      editor: els.historyEntryNoteEditor as HTMLElement | null,
      input: els.historyEntryNoteInput as HTMLTextAreaElement | null,
      editBtn: els.historyEntryNoteEditBtn as HTMLButtonElement | null,
      cancelBtn: els.historyEntryNoteCancelBtn as HTMLButtonElement | null,
      saveBtn: els.historyEntryNoteSaveBtn as HTMLButtonElement | null,
    },
    escapeHtml: ctx.escapeHtmlUI,
    formatDateTime: ctx.formatDateTime,
    formatTwo: ctx.formatTwo,
    getEntryNote: ctx.getHistoryEntryNote,
    getTaskById: (taskId) =>
      ctx.getTasks().find((candidate) => String(candidate?.id || "").trim() === String(taskId || "").trim()) || null,
    getEntriesForTask: (taskId) => {
      const historyByTaskId = ctx.loadHistory();
      return Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
    },
    getRewardProgress: () => ctx.getRewardProgress(),
    openOverlay: ctx.openOverlay,
    closeOverlay: ctx.closeOverlay,
    isMobileLayout: () => window.matchMedia?.("(max-width: 640px)")?.matches ?? window.innerWidth <= 640,
  });

  async function saveHistoryManagerOverlayNote(options?: { reopen?: boolean }) {
    const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
    if (!overlay || overlay.dataset.historyEntryOwner !== "manager" || overlay.dataset.historyEntryEditable !== "true") return;
    const taskId = String(overlay.dataset.historyEntryTaskId || "").trim();
    const ts = Math.floor(Number(overlay.dataset.historyEntryTs || 0));
    const ms = Math.max(0, Math.floor(Number(overlay.dataset.historyEntryMs || 0)));
    const name = String(overlay.dataset.historyEntryName || "").trim();
    if (!taskId || ts <= 0 || !name) return;
    const historyByTaskId = ctx.loadHistory();
    const original = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
    const pos = original.findIndex(
      (entry: any) => Number(entry?.ts) === ts && Number(entry?.ms) === ms && String(entry?.name || "").trim() === name
    );
    if (pos < 0) return;
    const nextEntry = { ...original[pos], taskId };
    const note = historyEntrySummaryInteraction.getActiveInputValue().trim();
    if (note) nextEntry.note = note;
    else delete nextEntry.note;
    const nextTaskHistory = original.slice();
    nextTaskHistory[pos] = nextEntry;
    const nextHistory = { ...historyByTaskId, [taskId]: nextTaskHistory };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);
    renderHistoryManager();
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    if (options?.reopen !== false) openHistoryManagerNoteOverlay(nextEntry);
  }

  function beginHistoryManagerNoteEdit(trigger: HTMLElement | null) {
    historyEntrySummaryInteraction.beginEdit(trigger);
  }

  function importHistoryManagerCsvFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const parsed = ctx.parseCsvRows(text);
      if (!parsed.length) {
        alert("The CSV file is empty.");
        return;
      }

      const header = parsed[0].map((v, idx) => {
        const raw = String(v || "");
        const noBom = idx === 0 ? raw.replace(/^\uFEFF/, "") : raw;
        return noBom.trim().toLowerCase();
      });
      const idxTaskId = header.indexOf("taskid");
      const idxTaskName = header.indexOf("taskname");
      const idxEntryName = header.indexOf("entryname");
      const idxTs = header.indexOf("ts");
      const idxMs = header.indexOf("ms");
      const idxColor = header.indexOf("color");
      const idxNote = header.indexOf("note");
      if (idxTaskId < 0 || idxTs < 0 || idxMs < 0) {
        alert("Invalid CSV format. Expected columns: taskId, ts, ms.");
        return;
      }

      const tasks = ctx.getTasks();
      const nextHistory: HistoryByTaskId = { ...(getFinalizedHistoryByTaskId() || {}) };
      const seenByTask = new Map<string, Set<string>>();
      Object.keys(nextHistory).forEach((taskId) => {
        const set = new Set<string>();
        const arr = Array.isArray(nextHistory[taskId]) ? nextHistory[taskId] : [];
        arr.forEach((entry) => {
          set.add(`${Math.floor(+entry.ts || 0)}|${Math.floor(+entry.ms || 0)}|${String(entry.name || "")}`);
        });
        seenByTask.set(taskId, set);
      });

      let imported = 0;
      let skipped = 0;

      parsed.slice(1).forEach((row) => {
        const taskId = String(row[idxTaskId] || "").trim();
        if (!taskId) {
          skipped += 1;
          return;
        }
        const ts = Math.floor(Number(row[idxTs] || 0));
        const ms = Math.floor(Number(row[idxMs] || 0));
        if (!Number.isFinite(ts) || ts <= 0 || !Number.isFinite(ms) || ms < 0) {
          skipped += 1;
          return;
        }
        const task = tasks.find((t) => String(t.id || "") === taskId);
        const taskName = String(row[idxTaskName] || "").trim();
        const entryNameRaw = idxEntryName >= 0 ? String(row[idxEntryName] || "").trim() : "";
        const entryName = entryNameRaw || taskName || String(task?.name || "").trim() || "Task";
        const color = idxColor >= 0 ? String(row[idxColor] || "").trim() : "";
        const note = idxNote >= 0 ? String(row[idxNote] || "").trim() : "";
        const key = `${ts}|${ms}|${entryName}`;

        let seen = seenByTask.get(taskId);
        if (!seen) {
          seen = new Set<string>();
          seenByTask.set(taskId, seen);
        }
        if (seen.has(key)) {
          skipped += 1;
          return;
        }

        if (!Array.isArray(nextHistory[taskId])) nextHistory[taskId] = [];
        nextHistory[taskId].push({
          ts,
          ms,
          name: entryName,
          ...(color ? { color } : {}),
          ...(note ? { note } : {}),
        });
        seen.add(key);
        imported += 1;
      });

      if (imported <= 0) {
        alert("No valid history rows were imported.");
        return;
      }

      Object.keys(nextHistory).forEach((taskId) => {
        if (!Array.isArray(nextHistory[taskId])) return;
        nextHistory[taskId].sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      });
      ctx.setHistoryByTaskId(nextHistory);
      ctx.saveHistory(nextHistory);
      ctx.render();
      renderHistoryManager();
      alert(`Imported ${imported} row(s).${skipped ? ` Skipped ${skipped} duplicate/invalid row(s).` : ""}`);
    };
    reader.onerror = () => alert("Could not read the CSV file.");
    reader.readAsText(file);
  }

  function readHistoryManagerGenerateParamsFromConfirm(): HistoryGenParams | null {
    const host = els.confirmText as HTMLElement | null;
    if (!host) return null;
    const selectedTaskIds = Array.from(
      host.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-history-gen-task-id]:checked')
    )
      .map((el) => String(el.getAttribute("data-history-gen-task-id") || "").trim())
      .filter(Boolean);
    if (!selectedTaskIds.length) {
      alert("Select at least one task.");
      return null;
    }

    const daysBack = Math.floor(Number((host.querySelector("#historyGenDaysBack") as HTMLInputElement | null)?.value || 0));
    if (!Number.isFinite(daysBack) || daysBack <= 0) {
      alert("Enter a valid date range in days (greater than 0).");
      return null;
    }

    const entriesPerDayMin = Math.floor(
      Number((host.querySelector("#historyGenEntriesMin") as HTMLInputElement | null)?.value || 0)
    );
    const entriesPerDayMax = Math.floor(
      Number((host.querySelector("#historyGenEntriesMax") as HTMLInputElement | null)?.value || 0)
    );
    if (
      !Number.isFinite(entriesPerDayMin) ||
      !Number.isFinite(entriesPerDayMax) ||
      entriesPerDayMin < 0 ||
      entriesPerDayMax <= 0
    ) {
      alert("Entries/day min must be 0 or greater, and max must be greater than 0.");
      return null;
    }
    if (entriesPerDayMin > entriesPerDayMax) {
      alert("Entries/day minimum cannot be greater than maximum.");
      return null;
    }

    const startRaw = (host.querySelector("#historyGenStartTime") as HTMLInputElement | null)?.value || "";
    const endRaw = (host.querySelector("#historyGenEndTime") as HTMLInputElement | null)?.value || "";
    const windowStartMinute = parseHistoryGenTimeToMinute(startRaw);
    const windowEndMinute = parseHistoryGenTimeToMinute(endRaw);
    if (windowStartMinute == null || windowEndMinute == null || windowStartMinute >= windowEndMinute) {
      alert("Enter a valid time window where start is earlier than end.");
      return null;
    }

    return {
      taskIds: selectedTaskIds,
      daysBack,
      entriesPerDayMin,
      entriesPerDayMax,
      windowStartMinute,
      windowEndMinute,
      replaceExisting: !!(host.querySelector("#historyGenReplaceExisting") as HTMLInputElement | null)?.checked,
      generateRandomTimeGoals: !!(host.querySelector("#historyGenRandomGoals") as HTMLInputElement | null)?.checked,
    };
  }

  function buildHistoryManagerTestDataPreview(params: HistoryGenParams): HistoryGenPreview | null {
    const historyByTaskId = getFinalizedHistoryByTaskId();
    const tasks = ctx.getTasks();
    const cloneHistory: HistoryByTaskId = {};
    if (!params.replaceExisting) {
      Object.keys(historyByTaskId || {}).forEach((taskId) => {
        cloneHistory[taskId] = Array.isArray(historyByTaskId[taskId]) ? (historyByTaskId[taskId] || []).slice() : [];
      });
    }
    const nextHistory: HistoryByTaskId = cloneHistory;

    const taskOrderById = new Map<string, number>();
    (tasks || []).forEach((task, idx) => {
      const taskId = String(task.id || "").trim();
      if (taskId) taskOrderById.set(taskId, idx);
    });
    const selectedTasks = params.taskIds
      .map((taskId) => tasks.find((task) => String(task.id || "").trim() === String(taskId)))
      .filter((task): task is Task => !!task);
    const perTaskCount: Record<string, number> = {};
    selectedTasks.forEach((task) => {
      const taskId = String(task.id || "").trim();
      perTaskCount[taskId] = 0;
      if (!Array.isArray(nextHistory[taskId])) nextHistory[taskId] = [];
    });

    const generatedGoalsByTaskId: Record<string, HistoryGenTaskGoal> = {};
    const existingGoalsByTaskId: Record<string, HistoryGenTaskGoal> = {};
    if (params.generateRandomTimeGoals) {
      const availableWindowMinutes = Math.max(0, params.windowEndMinute - params.windowStartMinute);
      const budgets = allocateHistoryGenDailyBudgets(selectedTasks.length, availableWindowMinutes);
      if (!budgets) {
        alert("The selected time window is too small to assign at least 15 minutes/day to every selected task.");
        return null;
      }
      selectedTasks.forEach((task, index) => {
        const taskId = String(task.id || "").trim();
        generatedGoalsByTaskId[taskId] = buildHistoryGenTaskGoal(budgets[index] || 15);
      });
    } else {
      selectedTasks.forEach((task) => {
        const taskId = String(task.id || "").trim();
        const timeGoalEnabled = task.timeGoalEnabled !== false;
        const timeGoalMinutes = Math.max(0, Math.round(Number(task.timeGoalMinutes || 0) || 0));
        if (!timeGoalEnabled || timeGoalMinutes <= 0) return;
        const timeGoalPeriod: "day" | "week" = task.timeGoalPeriod === "day" ? "day" : "week";
        const dailyBudgetMinutes =
          timeGoalPeriod === "week" ? Math.max(0, Math.floor(timeGoalMinutes / 7)) : timeGoalMinutes;
        existingGoalsByTaskId[taskId] = {
          timeGoalEnabled: true,
          timeGoalValue: Math.max(0, Number(task.timeGoalValue || 0) || 0),
          timeGoalUnit: task.timeGoalUnit === "minute" ? "minute" : "hour",
          timeGoalPeriod,
          timeGoalMinutes,
          dailyBudgetMinutes,
        };
      });
    }

    const unitToMinute = (task: Task) => {
      if (task.milestoneTimeUnit === "day") return 24 * 60;
      if (task.milestoneTimeUnit === "minute") return 1;
      return 60;
    };
    const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let totalGenerated = 0;
    const generatedMinutesByTaskDay: Record<string, number> = {};
    const generatedMinutesByTaskWeek: Record<string, number> = {};
    const limitedTaskIds = new Set<string>();

    for (let dayOffset = params.daysBack - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(todayLocal);
      day.setDate(todayLocal.getDate() - dayOffset);
      const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const weekKey = getHistoryGenWeekKey(day);

      selectedTasks.forEach((task) => {
        const taskId = String(task.id || "").trim();
        if (!taskId) return;
        const taskIdx = taskOrderById.get(taskId) || 0;
        const sessions = randInt(params.entriesPerDayMin, params.entriesPerDayMax);
        const existingGoal = params.generateRandomTimeGoals ? null : existingGoalsByTaskId[taskId] || null;
        const milestonesMinutes = ctx
          .sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : [])
          .map((m) => Math.floor(Math.max(0, Number(m.hours || 0)) * unitToMinute(task)))
          .filter((m) => m > 0);

        for (let i = 0; i < sessions; i += 1) {
          const windowMinute = randInt(params.windowStartMinute, params.windowEndMinute - 1);
          const tsDate = new Date(day);
          tsDate.setHours(0, 0, 0, 0);
          const ts = tsDate.getTime() + windowMinute * 60_000 + i * 37_000 + taskIdx * 1_000;

          let durationMinutes = 0;
          if (milestonesMinutes.length) {
            const target = milestonesMinutes[(dayOffset + i + taskIdx) % milestonesMinutes.length];
            const variance = Math.max(5, Math.floor(target * 0.2));
            durationMinutes = Math.max(5, target + randInt(-variance, variance));
          } else {
            const baseMinutes = 18 + ((taskIdx * 7) % 35);
            const varianceMinutes = Math.floor(Math.random() * 55);
            durationMinutes = Math.max(5, baseMinutes + varianceMinutes);
          }

          if (existingGoal) {
            const dayBudgetKey = `${taskId}|${dayKey}`;
            const weekBudgetKey = `${taskId}|${weekKey}`;
            const usedMinutes =
              existingGoal.timeGoalPeriod === "day"
                ? generatedMinutesByTaskDay[dayBudgetKey] || 0
                : generatedMinutesByTaskWeek[weekBudgetKey] || 0;
            const remainingMinutes = Math.max(0, existingGoal.timeGoalMinutes - usedMinutes);
            if (remainingMinutes <= 0) {
              limitedTaskIds.add(taskId);
              continue;
            }
            if (durationMinutes > remainingMinutes) {
              durationMinutes = remainingMinutes;
              limitedTaskIds.add(taskId);
            }
            if (durationMinutes <= 0) continue;
            if (existingGoal.timeGoalPeriod === "day") {
              generatedMinutesByTaskDay[dayBudgetKey] = usedMinutes + durationMinutes;
            } else {
              generatedMinutesByTaskWeek[weekBudgetKey] = usedMinutes + durationMinutes;
            }
          }

          const ms = durationMinutes * 60 * 1000;
          nextHistory[taskId].push({
            ts,
            name: String(task.name || "").trim() || "Task",
            ms,
            color: ctx.sessionColorForTaskMs(task, ms),
          });
          perTaskCount[taskId] += 1;
          totalGenerated += 1;
        }
      });
    }

    Object.keys(nextHistory).forEach((taskId) => {
      const arr = Array.isArray(nextHistory[taskId]) ? nextHistory[taskId] : [];
      arr.sort((a, b) => Number(a.ts || 0) - Number(b.ts || 0));
      nextHistory[taskId] = arr;
    });

    return {
      params,
      perTaskCount,
      totalGenerated,
      nextHistory,
      generatedGoalsByTaskId,
      existingGoalsByTaskId,
      limitedTaskIds: Array.from(limitedTaskIds),
    };
  }

  async function applyHistoryManagerTestData(preview: HistoryGenPreview): Promise<void> {
    if (preview.params.generateRandomTimeGoals) {
      const nextTasks = ctx.getTasks().map((task) => {
        const taskId = String(task.id || "").trim();
        const generatedGoal = preview.generatedGoalsByTaskId[taskId];
        if (!generatedGoal) return task;
        return {
          ...task,
          timeGoalEnabled: generatedGoal.timeGoalEnabled,
          timeGoalValue: generatedGoal.timeGoalValue,
          timeGoalUnit: generatedGoal.timeGoalUnit,
          timeGoalPeriod: generatedGoal.timeGoalPeriod,
          timeGoalMinutes: generatedGoal.timeGoalMinutes,
        };
      });
      ctx.setTasks(nextTasks);
      ctx.save();
    }
    ctx.setHistoryByTaskId(preview.nextHistory);
    await ctx.saveHistoryAndWait(preview.nextHistory);
    ctx.render();
    renderHistoryManager();
    alert(`Generated ${preview.totalGenerated} test history entries.`);
  }

  function openHistoryManagerGeneratePreviewDialog(preview: HistoryGenPreview) {
    const tasks = ctx.getTasks();
    const perTaskRows = Object.entries(preview.perTaskCount)
      .map(([taskId, count]) => {
        const taskName = String(tasks.find((task) => String(task.id || "") === String(taskId))?.name || taskId || "Task").trim();
        const generatedGoal = preview.generatedGoalsByTaskId[String(taskId || "").trim()];
        const existingGoal = preview.existingGoalsByTaskId[String(taskId || "").trim()];
        const goalSummary = generatedGoal
          ? ` | Goal: ${ctx.escapeHtmlUI(formatHistoryGenGoalValue(generatedGoal.timeGoalValue))} ${ctx.escapeHtmlUI(
              generatedGoal.timeGoalUnit
            )}/${ctx.escapeHtmlUI(generatedGoal.timeGoalPeriod)} (${generatedGoal.dailyBudgetMinutes} min/day)`
          : existingGoal
          ? ` | Existing goal cap: ${ctx.escapeHtmlUI(formatHistoryGenGoalValue(existingGoal.timeGoalValue))} ${ctx.escapeHtmlUI(
              existingGoal.timeGoalUnit
            )}/${ctx.escapeHtmlUI(existingGoal.timeGoalPeriod)}`
          : "";
        const limitedNote = preview.limitedTaskIds.includes(String(taskId || "").trim()) ? ` | Limited by goal` : "";
        return `<li><b>${ctx.escapeHtmlUI(taskName)}</b>: ${count}${goalSummary}${limitedNote}</li>`;
      })
      .join("");
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (preview.params.daysBack - 1));
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    ctx.confirm("Preview Test Data", "", {
      okLabel: "Generate",
      cancelLabel: "Cancel",
      textHtml: `
        <div class="hmGenConfirm">
          <p style="margin:0 0 8px;">Selected tasks: <b>${preview.params.taskIds.length}</b></p>
          <p style="margin:0 0 8px;">Date span: <b>${ctx.escapeHtmlUI(startDate.toLocaleDateString())}</b> to <b>${ctx.escapeHtmlUI(
            endDate.toLocaleDateString()
          )}</b> (${preview.params.daysBack} days)</p>
          <p style="margin:0 0 8px;">Entries/day: <b>${preview.params.entriesPerDayMin}</b> to <b>${
            preview.params.entriesPerDayMax
          }</b></p>
          <p style="margin:0 0 8px;">Entry window: <b>${formatHistoryGenMinute(preview.params.windowStartMinute)}</b> to <b>${formatHistoryGenMinute(
            preview.params.windowEndMinute
          )}</b></p>
          <p style="margin:0 0 8px;">Random goals: <b>${preview.params.generateRandomTimeGoals ? "Yes" : "No"}</b></p>
          <p style="margin:0 0 8px;">Existing goals enforced: <b>${
            !preview.params.generateRandomTimeGoals && Object.keys(preview.existingGoalsByTaskId).length ? "Yes" : "No"
          }</b></p>
          <p style="margin:0 0 8px;">Replace existing: <b>${preview.params.replaceExisting ? "Yes" : "No"}</b></p>
          <p style="margin:0 0 8px;">Total generated: <b>${preview.totalGenerated}</b></p>
          <ul style="margin:0; padding-left:20px;">${perTaskRows || "<li>No tasks</li>"}</ul>
        </div>
      `,
      onOk: () => {
        void applyHistoryManagerTestData(preview);
        ctx.closeConfirm();
      },
      onCancel: () => ctx.closeConfirm(),
    });
  }

  function openHistoryManagerGenerateConfigDialog() {
    const tasks = ctx.getTasks();
    const taskList = (tasks || []).filter((task) => String(task.id || "").trim());
    if (!taskList.length) {
      alert("Add at least one task before generating test history.");
      return;
    }
    const taskOptions = taskList
      .map((task) => {
        const taskId = String(task.id || "").trim();
        const taskName = String(task.name || "").trim() || "Task";
        return `<label class="hmGenTaskRow" style="display:flex; align-items:center; gap:8px; margin:4px 0;">
          <input type="checkbox" data-history-gen-task-id="${ctx.escapeHtmlUI(taskId)}" />
          <span>${ctx.escapeHtmlUI(taskName)}</span>
        </label>`;
      })
      .join("");

    ctx.confirm("Generate Test Data", "", {
      okLabel: "Preview",
      cancelLabel: "Cancel",
      textHtml: `
        <div class="hmGenConfirm">
          <div style="margin:0 0 8px;"><b>Select tasks</b></div>
          <div id="historyGenTaskList" style="max-height:180px; overflow:auto; border:1px solid var(--line, rgba(255,255,255,.14)); border-radius:10px; padding:8px;">
            ${taskOptions}
          </div>
          <div style="display:grid; gap:8px; margin-top:10px;">
            <div style="display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, .9fr) minmax(0, .9fr); gap:8px; align-items:end;">
              <label style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <span>Days back</span>
              <input id="historyGenDaysBack" type="number" min="1" max="3650" value="90" style="width:100%; min-width:0;" />
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <span>Entries/day min</span>
              <input id="historyGenEntriesMin" type="number" min="0" max="1000" value="1" style="width:100%; min-width:0;" />
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <span>Entries/day max</span>
              <input id="historyGenEntriesMax" type="number" min="1" max="1000" value="3" style="width:100%; min-width:0;" />
              </label>
            </div>
            <div style="display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); gap:8px; align-items:end;">
              <label style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <span>Start time</span>
              <input id="historyGenStartTime" type="time" value="06:00" style="width:100%; min-width:0;" />
              </label>
              <label style="display:flex; flex-direction:column; gap:4px; min-width:0;">
              <span>End time</span>
              <input id="historyGenEndTime" type="time" value="20:00" style="width:100%; min-width:0;" />
              </label>
            </div>
            <label style="display:flex; align-items:center; gap:8px; margin-top:2px;">
              <input id="historyGenRandomGoals" type="checkbox" />
              <span>Generate Random Time Goal(s)</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; margin-top:2px;">
              <input id="historyGenReplaceExisting" type="checkbox" checked />
              <span>Replace existing history</span>
            </label>
          </div>
        </div>
      `,
      onOk: () => {
        const params = readHistoryManagerGenerateParamsFromConfirm();
        if (!params) return;
        const preview = buildHistoryManagerTestDataPreview(params);
        if (!preview) return;
        openHistoryManagerGeneratePreviewDialog(preview);
      },
      onCancel: () => ctx.closeConfirm(),
    });
  }

  function syncHistoryManagerBulkUi() {
    const hmBulkEditMode = ctx.getHmBulkEditMode();
    const hmBulkSelectedRows = ctx.getHmBulkSelectedRows();
    if (els.historyManagerBulkBtn) {
      els.historyManagerBulkBtn.textContent = "Bulk Edit";
      els.historyManagerBulkBtn.classList.toggle("btn-accent", hmBulkEditMode);
      els.historyManagerBulkBtn.classList.toggle("btn-ghost", !hmBulkEditMode);
    }
    if (els.historyManagerBulkDeleteBtn) {
      const count = hmBulkSelectedRows.size;
      if (hmBulkEditMode && count > 0) {
        els.historyManagerBulkDeleteBtn.style.display = "";
        els.historyManagerBulkDeleteBtn.textContent = count === 1 ? "Delete (1)" : `Delete (${count})`;
      } else {
        els.historyManagerBulkDeleteBtn.style.display = "none";
      }
    }
  }

  function renderHistoryManager() {
    const hmBulkSelectedRows = ctx.getHmBulkSelectedRows();
    const hmBulkEditMode = ctx.getHmBulkEditMode();
    const hmSortKey = ctx.getHmSortKey();
    const hmSortDir = ctx.getHmSortDir();
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = ctx.isArchitectUser() ? "" : "none";
    }
    const listEl = document.getElementById("hmList");
    if (!listEl) return;
    const renderResult = renderHistoryManagerHtml({
      existingListEl: listEl,
      historyByTaskId: (ctx.getHistoryByTaskId() as Record<string, any[]>) || {},
      tasks: ctx.getTasks(),
      taskIdFilter: resolveHistoryManagerTaskIdFilter(window.location.search || ""),
      hmBulkSelectedRows,
      hmBulkEditMode,
      hmSortKey,
      hmSortDir,
      hmExpandedTaskGroups: ctx.getHmExpandedTaskGroups(),
      hmExpandedDateGroups: ctx.getHmExpandedDateGroups(),
      formatTwo: ctx.formatTwo,
      formatDateTime: ctx.formatDateTime,
      getTaskMetaForHistoryId,
      getHistoryEntryNote: (entry) => ctx.getHistoryEntryNote(entry),
      canUseManualEntry: canUseAdvancedHistory(),
      flashedRowId: flashedManualEntryRowId,
    });
    ctx.setHmExpandedTaskGroups(renderResult.expandedTaskGroups);
    ctx.setHmExpandedDateGroups(renderResult.expandedDateGroups);
    ctx.setHmRowsByTask(renderResult.rowIdsByTask);
    ctx.setHmRowsByTaskDate(renderResult.rowIdsByTaskDate);
    if (renderResult.isEmpty) {
      listEl.innerHTML = renderResult.emptyHtml;
      return;
    }
    listEl.innerHTML = renderResult.html;
    hmBulkSelectedRows.forEach((id) => {
      if (!renderResult.validRowIds.has(id)) hmBulkSelectedRows.delete(id);
    });
    syncHistoryManagerBulkUi();
    scrollToFlashedManualEntryRow();
  }

  function openHistoryManager() {
    if (isHistoryManagerOpen()) {
      if (!historyManagerLoading) renderHistoryManager();
      return;
    }
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = ctx.isArchitectUser() ? "" : "none";
    }
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "block";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    const loadCycle = historyManagerLoadCycle + 1;
    historyManagerLoadCycle = loadCycle;
    renderHistoryManager();
    setHistoryManagerLoading(false);
    void (async () => {
      try {
        await refreshHistoryManagerFromCloud();
      } finally {
        if (ctx.runtime.destroyed || !isHistoryManagerOpen() || historyManagerLoadCycle !== loadCycle) return;
        renderHistoryManager();
        setHistoryManagerLoading(false);
      }
    })();
  }

  function getHistoryManagerReturnRoute() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const explicit = String(params.get("returnTo") || "").trim();
      if (explicit === "tasks") return "/tasklaunch";
      if (explicit === "settings") return "/settings";
      const taskId = String(params.get("taskId") || "").trim();
      return taskId ? "/tasklaunch" : "/settings";
    } catch {
      return "/settings";
    }
  }

  function isHistoryManagerOpen() {
    const screen = els.historyManagerScreen as HTMLElement | null;
    return !!screen && screen.style.display !== "none" && screen.getAttribute("aria-hidden") !== "true";
  }

  async function refreshHistoryManagerFromCloud() {
    const inFlight = ctx.getHistoryManagerRefreshInFlight();
    if (inFlight) return inFlight;
    const nextInFlight = (async () => {
      try {
        await ctx.refreshHistoryFromCloud();
        ctx.setDeletedTaskMeta(ctx.loadDeletedMeta());
        ctx.load();
        ctx.setHistoryByTaskId(ctx.loadHistory());
      } catch {
        // Keep last known in-memory state if cloud refresh fails.
      } finally {
        ctx.setHistoryManagerRefreshInFlight(null);
      }
    })();
    ctx.setHistoryManagerRefreshInFlight(nextInFlight);
    return nextInFlight;
  }

  function closeHistoryManager() {
    historyManagerLoadCycle += 1;
    setHistoryManagerLoading(false);
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "none";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    ctx.setHmExpandedTaskGroups(new Set<string>());
    ctx.setHmExpandedDateGroups(new Set<string>());
    ctx.setHmBulkEditMode(false);
    ctx.setHmBulkSelectedRows(new Set<string>());
    ctx.setHmRowsByTask({});
    ctx.setHmRowsByTaskDate({});
    manualEntryDraftsByTaskId = {};
    activeManualEntryTaskId = null;
    clearFlashedManualEntryRow(false);
    closeManualEntryOverlay();
    syncHistoryManagerBulkUi();
  }

  function updateManualEntryDraft(taskId: string, updater: (draft: HistoryManagerManualDraft) => HistoryManagerManualDraft) {
    const currentDraft = manualEntryDraftsByTaskId[taskId] || createDefaultHistoryManagerManualDraft(Date.now());
    manualEntryDraftsByTaskId = {
      ...manualEntryDraftsByTaskId,
      [taskId]: updater(currentDraft),
    };
  }

  function openManualEntryDraft(taskId: string) {
    if (!canUseAdvancedHistory()) {
      ctx.showUpgradePrompt("Manual history entry", "pro");
      return;
    }
    openManualEntryOverlay(taskId);
  }

  function openManualEntryForTask(taskIdRaw: string) {
    const taskId = String(taskIdRaw || "").trim();
    if (!taskId) return;
    if (!canUseAdvancedHistory()) {
      ctx.showUpgradePrompt("Manual history entry", "pro");
      return;
    }
    const task = ctx.getTasks().find((entry) => String(entry?.id || "").trim() === taskId) || null;
    if (!task) return;
    openManualEntryOverlay(taskId, { forceTaskName: task.name, allowDeleted: true });
  }

  function saveManualEntryDraft(taskId: string) {
    if (!canUseAdvancedHistory()) {
      ctx.showUpgradePrompt("Manual history entry", "pro");
      closeManualEntryOverlay({ discardDraft: true });
      return;
    }
    const draft = manualEntryDraftsByTaskId[taskId];
    if (!draft) return;
    const meta = getTaskMetaForHistoryId(taskId);
    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: meta.name,
      taskColor: meta.color || null,
    });
    if ("error" in parsed) {
      updateManualEntryDraft(taskId, (currentDraft) => ({ ...currentDraft, errorMessage: parsed.error || "Could not save entry." }));
      syncManualEntryOverlayFromDraft(taskId);
      return;
    }
    const historyByTaskId = ctx.loadHistory();
    const nextTaskHistory = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId].slice() : [];
    nextTaskHistory.push(parsed.entry);
    const nextHistory = { ...historyByTaskId, [taskId]: nextTaskHistory };
    ctx.setHistoryByTaskId(nextHistory);
    ctx.saveHistory(nextHistory);
    void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});
    const nextDrafts = { ...manualEntryDraftsByTaskId };
    delete nextDrafts[taskId];
    manualEntryDraftsByTaskId = nextDrafts;
    closeManualEntryOverlay();
    const date = new Date(parsed.entry.ts);
    const dateKey = `${date.getFullYear()}-${ctx.formatTwo(date.getMonth() + 1)}-${ctx.formatTwo(date.getDate())}`;
    const rowId = `${taskId}|${parsed.entry.ts}|${parsed.entry.ms}|${String(parsed.entry.name || "")}`;
    const nextExpandedTaskGroups = new Set(ctx.getHmExpandedTaskGroups());
    const nextExpandedDateGroups = new Set(ctx.getHmExpandedDateGroups());
    nextExpandedTaskGroups.add(taskId);
    nextExpandedDateGroups.add(`${taskId}|${dateKey}`);
    ctx.setHmExpandedTaskGroups(nextExpandedTaskGroups);
    ctx.setHmExpandedDateGroups(nextExpandedDateGroups);
    flashHistoryManagerRow(rowId);
    renderHistoryManager();
  }

  function registerHistoryManagerEvents() {
    if (typeof window !== "undefined") {
      ctx.on(window, OPEN_HISTORY_MANAGER_MANUAL_ENTRY_EVENT, (event: Event) => {
        const detail = (event as CustomEvent<OpenHistoryManagerManualEntryDetail | undefined>).detail;
        const taskId = String(detail?.taskId || "").trim();
        const taskName = String(detail?.taskName || "").trim();
        if (!taskId) return;
        if (!canUseAdvancedHistory()) {
          ctx.showUpgradePrompt("Manual history entry", "pro");
          return;
        }
        openManualEntryOverlay(taskId, {
          forceTaskName: taskName || null,
          allowDeleted: true,
        });
      });
    }
    ctx.on(els.historyManagerBtn, "click", () => {
      ctx.navigateToAppRoute("/history-manager");
    });
    ctx.on(els.historyManagerExportBtn, "click", () => {
      if (!canUseAdvancedBackup()) {
        ctx.showUpgradePrompt("History Manager CSV export", "pro");
        return;
      }
      exportHistoryManagerCsv();
    });
    ctx.on(els.historyManagerImportBtn, "click", () => {
      if (!canUseAdvancedBackup()) {
        ctx.showUpgradePrompt("History Manager CSV import", "pro");
        return;
      }
      els.historyManagerImportFile?.click();
    });
    ctx.on(els.historyManagerImportFile, "change", (e: any) => {
      const f = e.target?.files && e.target.files[0] ? e.target.files[0] : null;
      e.target.value = "";
      if (f) importHistoryManagerCsvFromFile(f);
    });
    ctx.on(els.historyManagerGenerateBtn, "click", () => {
      if (!ctx.isArchitectUser()) {
        alert("Generate Test Data is architect-only.");
        return;
      }
      openHistoryManagerGenerateConfigDialog();
    });
    ctx.on(els.historyManagerBulkBtn, "click", () => {
      const nextBulkEditMode = !ctx.getHmBulkEditMode();
      ctx.setHmBulkEditMode(nextBulkEditMode);
      if (!nextBulkEditMode) ctx.setHmBulkSelectedRows(new Set<string>());
      renderHistoryManager();
    });
    ctx.on(els.historyManagerBulkDeleteBtn, "click", () => {
      const hmBulkSelectedRows = ctx.getHmBulkSelectedRows();
      const selected = Array.from(hmBulkSelectedRows);
      if (!selected.length) return;
      const byTask = groupSelectedHistoryRowsByTask(selected);
      const taskCount = Object.keys(byTask).length;
      const entryCount = selected.length;
      ctx.confirm(
        "Delete Selected History",
        `${entryCount} entr${entryCount === 1 ? "y" : "ies"} across ${taskCount} task${
          taskCount === 1 ? "" : "s"
        } will be deleted. Continue?`,
        {
          okLabel: "Delete",
          cancelLabel: "Cancel",
          onOk: () => {
            const historyByTaskId = ctx.loadHistory();
            Object.keys(byTask).forEach((taskId) => {
              const keys = byTask[taskId];
              const arr = (historyByTaskId[taskId] || []).slice();
              const next: any[] = [];
              arr.forEach((e: any) => {
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                if (keys.has(rowKey)) keys.delete(rowKey);
                else next.push(e);
              });
              historyByTaskId[taskId] = next;
              const deletedTaskMeta = ctx.getDeletedTaskMeta();
              if (next.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
                delete (deletedTaskMeta as any)[taskId];
                ctx.setDeletedTaskMeta(deletedTaskMeta);
                ctx.saveDeletedMeta(deletedTaskMeta);
              }
            });
            ctx.setHistoryByTaskId(historyByTaskId);
            ctx.saveHistory(historyByTaskId);
            void ctx.syncSharedTaskSummariesForTasks(Object.keys(byTask));
            ctx.setHmBulkSelectedRows(new Set<string>());
            renderHistoryManager();
            ctx.closeConfirm();
            void ctx
              .refreshHistoryFromCloud()
              .then((nextHistory) => {
                ctx.setHistoryByTaskId(nextHistory || {});
                renderHistoryManager();
              })
              .catch(() => {
                // Keep local post-delete state when cloud refresh is unavailable.
              });
          },
          onCancel: () => ctx.closeConfirm(),
        }
      );
    });
    ctx.on(els.historyManagerBackBtn, "click", () => {
      ctx.navigateToAppRoute(getHistoryManagerReturnRoute());
    });
    ctx.on(els.hmList, "mousedown", (ev: any) => {
      const deleteBtn = ev.target?.closest?.(".hmDelBtn");
      if (!deleteBtn) return;
      ev.preventDefault?.();
      ev.stopPropagation?.();
    });
    ctx.on(els.hmList, "click", (ev: any) => {
      const bulkCheckbox = ev.target?.closest?.(".hmBulkCheckbox");
      if (bulkCheckbox) {
        ev.stopPropagation();
        return;
      }
      const sortBtn = ev.target?.closest?.(".hmSortBtn");
      if (sortBtn) {
        const key = sortBtn.getAttribute("data-hm-sort");
        if (key === "ts" || key === "ms") {
          if (ctx.getHmSortKey() === key) {
            ctx.setHmSortDir(ctx.getHmSortDir() === "asc" ? "desc" : "asc");
          } else {
            ctx.setHmSortKey(key);
            ctx.setHmSortDir("desc");
          }
          renderHistoryManager();
        }
        return;
      }

      const noteBtn = ev.target?.closest?.(".hmNoteBtn");
      if (noteBtn) {
        const taskId = noteBtn.getAttribute("data-task");
        const key = noteBtn.getAttribute("data-key");
        if (!taskId || !key) return;
        const parts = key.split("|");
        const ts = parseInt(parts[0], 10);
        const ms = parseInt(parts[1], 10);
        const liveMarkerIndex = parts.findIndex((part: string) => String(part || "").startsWith("live:"));
        const name = parts.slice(2, liveMarkerIndex >= 0 ? liveMarkerIndex : undefined).join("|");
        const liveSessionId = liveMarkerIndex >= 0 ? String(parts[liveMarkerIndex] || "").slice(5) : "";
        const entry =
          (ctx.getHistoryByTaskId()?.[taskId] || []).find(
            (e: any) =>
              Number(e?.ts) === ts &&
              Number(e?.ms) === ms &&
              String(e?.name || "") === String(name || "") &&
              (!liveSessionId || String(e?.liveSessionId || "") === liveSessionId)
          ) || null;
        if (entry) openHistoryManagerNoteOverlay({ ...entry, taskId });
        return;
      }

      const addBtn = ev.target?.closest?.(".hmAddBtn");
      if (addBtn) {
        const taskId = String(addBtn.getAttribute("data-task") || "").trim();
        if (!taskId) return;
        openManualEntryDraft(taskId);
        return;
      }

      const btn = ev.target?.closest?.(".hmDelBtn");
      if (!btn) return;

      const taskId = btn.getAttribute("data-task");
      const key = btn.getAttribute("data-key");
      if (!taskId || !key) return;
      ev.preventDefault?.();
      ev.stopPropagation?.();

      ctx.confirm("Delete Log Entry", "Delete this entry?", {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: async () => {
          const historyByTaskId = { ...(ctx.loadHistory() || {}) };
          const orig = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId].slice() : [];
          const pos = orig.findIndex((e: any) => buildHistoryManagerRowKey(e) === key);

          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            ctx.setHistoryByTaskId(historyByTaskId);
            await ctx.saveHistoryAndWait(historyByTaskId);
            void ctx.syncSharedTaskSummariesForTask(taskId).catch(() => {});

            const deletedTaskMeta = ctx.getDeletedTaskMeta();
            if (orig.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
              delete (deletedTaskMeta as any)[taskId];
              ctx.setDeletedTaskMeta(deletedTaskMeta);
              ctx.saveDeletedMeta(deletedTaskMeta);
            }
          }

          renderHistoryManager();
          ctx.closeConfirm();
        },
        onCancel: () => ctx.closeConfirm(),
      });
    });
    ctx.on(els.historyManagerManualEntryOverlay, "click", (ev: any) => {
      if (ev.target !== els.historyManagerManualEntryOverlay) return;
      closeManualEntryOverlay({ discardDraft: true });
    });
    ctx.on(els.historyManagerManualEntryCancelBtn, "click", () => {
      closeManualEntryOverlay({ discardDraft: true });
    });
    ctx.on(els.historyManagerManualEntrySaveBtn, "click", () => {
      const taskId = String(activeManualEntryTaskId || "").trim();
      if (!taskId) return;
      saveManualEntryDraft(taskId);
    });
    ctx.on(els.hmList, "change", (ev: any) => {
      if (!ctx.getHmBulkEditMode()) return;
      const el = ev.target as HTMLInputElement | null;
      if (!el || !el.classList || !el.classList.contains("hmBulkCheckbox")) return;
      const checked = !!el.checked;
      const hmBulkSelectedRows = ctx.getHmBulkSelectedRows();
      const hmRowsByTask = ctx.getHmRowsByTask();
      const hmRowsByTaskDate = ctx.getHmRowsByTaskDate();
      if (el.classList.contains("hmBulkTaskChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const ids = hmRowsByTask[taskId] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkDateChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const dateKey = el.getAttribute("data-date") || "";
        const ids = hmRowsByTaskDate[`${taskId}|${dateKey}`] || [];
        ids.forEach((id) => {
          if (checked) hmBulkSelectedRows.add(id);
          else hmBulkSelectedRows.delete(id);
        });
        renderHistoryManager();
        return;
      }
      if (el.classList.contains("hmBulkRowChk")) {
        const taskId = el.getAttribute("data-task") || "";
        const rowKey = el.getAttribute("data-key") || "";
        const id = `${taskId}|${rowKey}`;
        if (checked) hmBulkSelectedRows.add(id);
        else hmBulkSelectedRows.delete(id);
        renderHistoryManager();
      }
    });
    const bindManualEntryInput = (
      el: HTMLInputElement | null,
      field: "dateTimeValue" | "hoursValue" | "minutesValue" | "noteValue"
    ) => {
      ctx.on(el, "input", () => {
        const taskId = String(activeManualEntryTaskId || "").trim();
        if (!taskId || !manualEntryDraftsByTaskId[taskId]) return;
        updateManualEntryDraft(taskId, (draft) => ({
          ...draft,
          [field]: String(el?.value || ""),
          errorMessage: "",
        }));
        if (els.historyManagerManualEntryError) {
          els.historyManagerManualEntryError.textContent = "";
          (els.historyManagerManualEntryError as HTMLElement).style.display = "none";
        }
      });
    };
    bindManualEntryInput(els.historyManagerManualDateTimeInput, "dateTimeValue");
    bindManualEntryInput(els.historyManagerManualHoursInput, "hoursValue");
    bindManualEntryInput(els.historyManagerManualMinutesInput, "minutesValue");
    bindManualEntryInput(els.historyManagerManualNoteInput, "noteValue");
    ctx.on(els.historyManagerManualDateTimeInput, "focus", () => {
      els.historyManagerManualDateTimeInput?.blur();
    });
    ctx.on(els.historyManagerManualDateTimeBtn, "click", () => {
      openManualEntryDateTimePicker();
    });
    ctx.on(els.historyManagerManualEntryDifficultyGroup, "click", (event: Event) => {
      const button = (event.target as HTMLElement | null)?.closest?.("[data-completion-difficulty]") as HTMLElement | null;
      if (!button) return;
      const taskId = String(activeManualEntryTaskId || "").trim();
      const value = normalizeCompletionDifficulty(button.dataset.completionDifficulty);
      if (!taskId || !manualEntryDraftsByTaskId[taskId] || !value) return;
      updateManualEntryDraft(taskId, (draft) => ({
        ...draft,
        completionDifficulty: value,
        errorMessage: "",
      }));
      syncManualEntryOverlayFromDraft(taskId);
    });
    ctx.on(document, "click", (event: Event) => {
      const editNoteTarget = (event.target as HTMLElement | null)?.closest?.(
        '[data-history-summary-action="edit-note"]'
      ) as HTMLElement | null;
      if (!editNoteTarget) return;
      beginHistoryManagerNoteEdit(editNoteTarget);
    });
    ctx.on(
      document,
      "click",
      (event: Event) => {
        const closeBtn = (event.target as HTMLElement | null)?.closest?.("#historyEntryNoteOverlay .closePopup");
        if (!closeBtn) return;
        const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
        if (!overlay || overlay.dataset.historyEntryOwner !== "manager") return;
        if (overlay.dataset.historyEntryEditing === "true") {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          void saveHistoryManagerOverlayNote({ reopen: false });
          ctx.closeOverlay(overlay);
        }
      },
      { capture: true }
    );
    ctx.on(document, "input", (event: Event) => {
      const input = (event.target as HTMLElement | null)?.closest?.(
        "#historyEntryNoteOverlay .historyEntrySummaryNoteInput.isEditing"
      ) as HTMLTextAreaElement | null;
      if (!input) return;
      historyEntrySummaryInteraction.syncInputMirror(String(input.value || ""));
    });
    ctx.on(document, "keydown", (event: Event) => {
      const keyEvent = event as KeyboardEvent;
      if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
      if ((event.target as HTMLElement | null)?.closest?.("textarea, input, select, [contenteditable='true']")) return;
      const editNoteTarget = (event.target as HTMLElement | null)?.closest?.(
        '[data-history-summary-action="edit-note"]'
      ) as HTMLElement | null;
      if (!editNoteTarget) return;
      keyEvent.preventDefault();
      beginHistoryManagerNoteEdit(editNoteTarget);
    });
    ctx.on(els.historyEntryNoteEditBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "manager" || overlay.dataset.historyEntryEditable !== "true") return;
      historyEntrySummaryInteraction.syncEditorUi(true);
      els.historyEntryNoteInput?.focus();
    });
    ctx.on(els.historyEntryNoteCancelBtn, "click", () => {
      const overlay = els.historyEntryNoteOverlay as HTMLElement | null;
      if (!overlay || overlay.dataset.historyEntryOwner !== "manager") return;
      historyEntrySummaryInteraction.cancelEdit();
    });
    ctx.on(els.historyEntryNoteSaveBtn, "click", () => {
      void saveHistoryManagerOverlayNote();
    });
  }

  return {
    getTaskMetaForHistoryId,
    exportHistoryManagerCsv,
    importHistoryManagerCsvFromFile,
    readHistoryManagerGenerateParamsFromConfirm,
    buildHistoryManagerTestDataPreview,
    applyHistoryManagerTestData,
    openHistoryManagerGeneratePreviewDialog,
    openHistoryManagerGenerateConfigDialog,
    syncHistoryManagerBulkUi,
    renderHistoryManager,
    openHistoryManager,
    openManualEntryForTask,
    getHistoryManagerReturnRoute,
    isHistoryManagerOpen,
    refreshHistoryManagerFromCloud,
    closeHistoryManager,
    registerHistoryManagerEvents,
  };
}
