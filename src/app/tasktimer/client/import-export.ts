import type { HistoryByTaskId, Task } from "../lib/types";
import { normalizeCompletionDifficulty } from "../lib/completionDifficulty";
import type { TaskTimerImportExportContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

function padTwo(value: number) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  }, 0);
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

export function createTaskTimerImportExport(ctx: TaskTimerImportExportContext) {
  const { els } = ctx;

  function canUseAdvancedBackup() {
    return ctx.hasEntitlement("advancedBackup");
  }

  function buildExportTaskSnapshot(task: Task) {
    const taskSnapshot = {
      ...(task as Task & {
        xpDisqualifiedUntilReset?: unknown;
      }),
    };
    delete taskSnapshot.xpDisqualifiedUntilReset;
    return {
      ...taskSnapshot,
      milestonesEnabled: !!task.milestonesEnabled,
      milestoneTimeUnit: task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestones: ctx.sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : []).map((milestone) => ({
        id: String((milestone as any)?.id || ctx.createId()),
        createdSeq: Number.isFinite(+(milestone as any)?.createdSeq)
          ? Math.max(1, Math.floor(+(milestone as any).createdSeq))
          : undefined,
        hours: Number.isFinite(+milestone.hours) ? +milestone.hours : 0,
        description: String(milestone.description || ""),
      })),
      checkpointSoundEnabled: !!task.checkpointSoundEnabled,
      checkpointSoundMode: task.checkpointSoundMode === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!task.checkpointToastEnabled,
      checkpointToastMode: task.checkpointToastMode === "manual" ? "manual" : "auto5s",
      timeGoalAction: "confirmModal",
      presetIntervalsEnabled: !!task.presetIntervalsEnabled,
      presetIntervalValue: ctx.getPresetIntervalValueNum(task),
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId
        ? String(task.presetIntervalLastMilestoneId)
        : null,
      presetIntervalNextSeq: ctx.getPresetIntervalNextSeqNum(task),
    };
  }

  function makeBackupPayload() {
    const includeHistory = canUseAdvancedBackup();
    return {
      schema: "taskticka_backup_v1",
      exportedAt: new Date().toISOString(),
      planAtExport: ctx.getCurrentPlan(),
      tasks: (ctx.getTasks() || []).map((task) => buildExportTaskSnapshot(task)),
      history: includeHistory ? ctx.getHistoryByTaskId() || {} : {},
      historyExcludedReason: includeHistory ? null : "Upgrade to Pro to export history with backups.",
    };
  }

  function makeSingleTaskExportPayload(task: Task, opts?: { includeHistory?: boolean }) {
    const taskId = String(task?.id || "");
    const includeHistory = opts?.includeHistory !== false;
    const historyByTaskId = ctx.getHistoryByTaskId();
    return {
      schema: "taskticka_backup_v1",
      exportedAt: new Date().toISOString(),
      tasks: [buildExportTaskSnapshot(task)],
      history:
        includeHistory && taskId
          ? { [taskId]: Array.isArray(historyByTaskId?.[taskId]) ? (historyByTaskId[taskId] || []).slice() : [] }
          : {},
    };
  }

  function exportBackup() {
    const now = new Date();
    const filename = `taskticka-backup-${now.getFullYear()}${padTwo(now.getMonth() + 1)}${padTwo(now.getDate())}-${padTwo(now.getHours())}${padTwo(now.getMinutes())}${padTwo(now.getSeconds())}.json`;
    const payload = makeBackupPayload();
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
  }

  function exportTask(index: number, opts?: { includeHistory?: boolean }) {
    const task = ctx.getTasks()[index];
    if (!task) return;
    const now = new Date();
    const safeTaskName =
      String(task.name || "task")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "task";
    const filename = `tasktimer-export-${safeTaskName}${padTwo(now.getDate())}${padTwo(now.getMonth() + 1)}${now.getFullYear()}.json`;
    const payload = makeSingleTaskExportPayload(task, opts);
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
  }

  function normalizeImportedTask(rawTask: any): Task {
    const nextTask = ctx.makeTask(String(rawTask.name || "Task"), 1);
    nextTask.id = String(rawTask.id || ctx.createId());
    nextTask.order = Number.isFinite(+rawTask.order) ? +rawTask.order : 1;
    nextTask.accumulatedMs = Number.isFinite(+rawTask.accumulatedMs) ? Math.max(0, +rawTask.accumulatedMs) : 0;
    nextTask.running = false;
    nextTask.startMs = null;
    nextTask.collapsed = !!rawTask.collapsed;
    nextTask.milestonesEnabled = !!rawTask.milestonesEnabled;
    nextTask.milestoneTimeUnit = rawTask.milestoneTimeUnit === "minute" ? "minute" : "hour";
    nextTask.milestones = Array.isArray(rawTask.milestones)
      ? rawTask.milestones.map((milestone: any) => ({
          id: milestone?.id ? String(milestone.id) : ctx.createId(),
          createdSeq: Number.isFinite(+milestone?.createdSeq) ? Math.max(1, Math.floor(+milestone.createdSeq)) : undefined,
          hours: Number.isFinite(+milestone.hours) ? +milestone.hours : 0,
          description: String(milestone.description || ""),
        }))
      : [];
    nextTask.milestones = ctx.sortMilestones(nextTask.milestones);
    nextTask.hasStarted = !!rawTask.hasStarted;
    nextTask.checkpointSoundEnabled = !!rawTask.checkpointSoundEnabled;
    nextTask.checkpointSoundMode = rawTask.checkpointSoundMode === "repeat" ? "repeat" : "once";
    nextTask.checkpointToastEnabled = !!rawTask.checkpointToastEnabled;
    nextTask.checkpointToastMode = rawTask.checkpointToastMode === "manual" ? "manual" : "auto5s";
    nextTask.timeGoalAction = "confirmModal";
    nextTask.presetIntervalsEnabled = !!rawTask.presetIntervalsEnabled;
    nextTask.presetIntervalValue = ctx.getPresetIntervalValueNum(rawTask as Task);
    nextTask.presetIntervalLastMilestoneId = rawTask.presetIntervalLastMilestoneId
      ? String(rawTask.presetIntervalLastMilestoneId)
      : null;
    nextTask.presetIntervalNextSeq = ctx.getPresetIntervalNextSeqNum(rawTask as Task);
    ctx.ensureMilestoneIdentity(nextTask);
    return nextTask;
  }

  function mergeBackup(payload: any, opts?: { overwrite?: boolean }) {
    if (!payload || typeof payload !== "object") return { ok: false, msg: "Invalid backup file." };
    const overwrite = !!opts?.overwrite;
    const importedTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const importedHistory = payload.history && typeof payload.history === "object" ? payload.history : {};

    const currentTasks = ctx.getTasks();
    const currentHistory = ctx.getHistoryByTaskId();
    const existingMaxOrder = overwrite ? 0 : currentTasks.reduce((maxOrder, task) => Math.max(maxOrder, +task.order || 0), 0) || 0;
    const existingIds = new Set(overwrite ? [] : currentTasks.map((task) => String(task.id)));
    const idMap: Record<string, string> = {};
    const orderedImport = importedTasks.slice().sort((a: any, b: any) => (+a.order || 0) - (+b.order || 0));

    let added = 0;
    const nextTasks: Task[] = overwrite ? [] : currentTasks.slice();
    orderedImport.forEach((rawTask: any, index: number) => {
      if (!rawTask || typeof rawTask !== "object") return;
      const normalizedTask = normalizeImportedTask(rawTask);
      const oldId = String(normalizedTask.id || ctx.createId());
      let newId = oldId;
      if (existingIds.has(newId)) newId = ctx.createId();
      idMap[oldId] = newId;
      normalizedTask.id = newId;
      normalizedTask.order = existingMaxOrder + index + 1;
      existingIds.add(newId);
      nextTasks.push(normalizedTask);
      added += 1;
    });

    const nextHistory: HistoryByTaskId = overwrite ? {} : { ...(currentHistory || {}) };
    Object.keys(importedHistory).forEach((oldId) => {
      const entries = (importedHistory as any)[oldId];
      if (!Array.isArray(entries) || entries.length === 0) return;
      const destId = idMap[String(oldId)] || String(oldId);
      if (!Array.isArray(nextHistory[destId])) nextHistory[destId] = [];
      entries.forEach((entry: any) => {
        if (!entry || typeof entry !== "object") return;
        const ts = Number.isFinite(+entry.ts) ? +entry.ts : null;
        const ms = Number.isFinite(+entry.ms) ? Math.max(0, +entry.ms) : null;
        if (!ts || !ms) return;
        const note = String(entry.note || "").trim();
        const completionDifficulty = normalizeCompletionDifficulty(entry.completionDifficulty);
        nextHistory[destId].push({
          name: String(entry.name || ""),
          ms,
          ts,
          color: entry.color ? String(entry.color) : undefined,
          note: note || undefined,
          ...(completionDifficulty ? { completionDifficulty } : {}),
        });
      });
    });

    const cleanedHistory = ctx.cleanupHistory(nextHistory);
    ctx.setTasks(nextTasks);
    ctx.setHistoryByTaskId(cleanedHistory);
    ctx.save();
    ctx.saveHistory(cleanedHistory);
    ctx.render();
    return { ok: true, msg: `Imported ${added} task(s).` };
  }

  function importBackupFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const payload = safeJsonParse(text);
      const importedTasks = payload && Array.isArray(payload.tasks) ? payload.tasks : [];
      const hasExistingTasks = Array.isArray(ctx.getTasks()) && ctx.getTasks().length > 0;
      const hasIncomingTasks = importedTasks.length > 0;

      const runImport = (overwrite: boolean) => {
        const result = mergeBackup(payload, { overwrite });
        if (!result.ok) alert(result.msg || "Import failed.");
        else alert(result.msg || "Import complete.");
      };

      if (hasExistingTasks && hasIncomingTasks) {
        if (!canUseAdvancedBackup()) {
          ctx.confirm(
            "Import Backup",
            "Free restores backups by replacing current local data. Upgrade to Pro to merge imported tasks into existing data.",
            {
              okLabel: "Replace Current Data",
              cancelLabel: "Cancel",
              onOk: () => {
                runImport(true);
                ctx.closeConfirm();
              },
              onCancel: () => ctx.closeConfirm(),
            }
          );
          return;
        }
        ctx.confirm(
          "Import Backup",
          "Existing tasks were found. Do you want to add imported tasks to existing tasks, or overwrite existing data?",
          {
            okLabel: "Add",
            altLabel: "Overwrite",
            cancelLabel: "Cancel",
            onOk: () => {
              runImport(false);
              ctx.closeConfirm();
            },
            onAlt: () => {
              runImport(true);
              ctx.closeConfirm();
            },
            onCancel: () => ctx.closeConfirm(),
          }
        );
        return;
      }

      runImport(false);
    };
    reader.onerror = () => alert("Could not read the file.");
    reader.readAsText(file);
  }

  function openTaskExportModal(index: number) {
    const task = ctx.getTasks()[index];
    if (!task || !els.exportTaskOverlay) return;
    ctx.setExportTaskIndex(index);
    const taskId = String(task.id || "");
    const historyByTaskId = ctx.getHistoryByTaskId();
    const hasHistoryEntries = taskId
      ? Array.isArray(historyByTaskId?.[taskId]) && (historyByTaskId[taskId] || []).length > 0
      : false;
    if (els.exportTaskTitle) {
      const taskName = String(task.name || "Task").trim() || "Task";
      els.exportTaskTitle.textContent = `Export ${taskName}`;
    }
    if (els.exportTaskIncludeHistory) {
      els.exportTaskIncludeHistory.checked = false;
      els.exportTaskIncludeHistory.disabled = !hasHistoryEntries || !canUseAdvancedBackup();
    }
    if (els.exportTaskIncludeHistoryLabel) {
      els.exportTaskIncludeHistoryLabel.textContent = !canUseAdvancedBackup()
        ? "Task history export is available on Pro"
        : hasHistoryEntries
        ? "Include history entries"
        : "No history entries to export";
    }
    if (els.exportTaskIncludeHistoryRow) {
      els.exportTaskIncludeHistoryRow.classList.toggle("is-disabled", !hasHistoryEntries || !canUseAdvancedBackup());
    }
    ctx.openOverlay(els.exportTaskOverlay as HTMLElement | null);
  }

  function closeTaskExportModal() {
    ctx.setExportTaskIndex(null);
    if (els.exportTaskTitle) els.exportTaskTitle.textContent = "Export Task";
    if (els.exportTaskIncludeHistory) {
      els.exportTaskIncludeHistory.checked = false;
      els.exportTaskIncludeHistory.disabled = false;
    }
    if (els.exportTaskIncludeHistoryLabel) {
      els.exportTaskIncludeHistoryLabel.textContent = "Include history entries";
    }
    if (els.exportTaskIncludeHistoryRow) {
      els.exportTaskIncludeHistoryRow.classList.remove("is-disabled");
    }
    ctx.closeOverlay(els.exportTaskOverlay as HTMLElement | null);
  }

  function submitTaskExportModal() {
    const exportTaskIndex = ctx.getExportTaskIndex();
    if (exportTaskIndex == null) return;
    const includeHistory = canUseAdvancedBackup() && !!els.exportTaskIncludeHistory?.checked;
    exportTask(exportTaskIndex, { includeHistory });
    closeTaskExportModal();
  }

  function maybeOpenImportFromQuery() {
    let shouldOpenImport = false;
    let nextSearch = "";
    try {
      const params = new URLSearchParams(window.location.search);
      shouldOpenImport = params.get("import") === "1";
      if (!shouldOpenImport) return;
      params.delete("import");
      nextSearch = params.toString();
    } catch {
      return;
    }

    if (!els.importBtn) return;

    window.setTimeout(() => {
      els.importBtn?.click();
    }, 0);

    try {
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash || ""}`;
      window.history.replaceState({}, "", nextUrl);
    } catch {
      // ignore URL cleanup failures
    }
  }

  function registerImportExportEvents() {
    ctx.on(els.exportTaskCancelBtn, "click", (event: any) => {
      event?.preventDefault?.();
      closeTaskExportModal();
    });
    ctx.on(els.exportTaskConfirmBtn, "click", (event: any) => {
      event?.preventDefault?.();
      submitTaskExportModal();
    });
    ctx.on(els.exportTaskOverlay, "click", (event: any) => {
      if (event?.target === els.exportTaskOverlay) closeTaskExportModal();
    });
    ctx.on(els.exportTaskIncludeHistory, "keydown", (event: any) => {
      if (event?.key !== "Enter") return;
      event?.preventDefault?.();
      submitTaskExportModal();
    });
    ctx.on(els.exportBtn, "click", exportBackup);
    ctx.on(els.importBtn, "click", () => els.importFile?.click());
    ctx.on(els.importFile, "change", (event: any) => {
      const file = event.target?.files && event.target.files[0] ? event.target.files[0] : null;
      event.target.value = "";
      if (file) importBackupFromFile(file);
    });
  }

  return {
    exportBackup,
    exportTask,
    openTaskExportModal,
    closeTaskExportModal,
    submitTaskExportModal,
    importBackupFromFile,
    maybeOpenImportFromQuery,
    registerImportExportEvents,
  };
}
