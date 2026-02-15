/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task, DeletedTaskMeta } from "./types";
import { nowMs, formatTwo, formatTime, formatDateTime } from "./lib/time";
import { cryptoRandomId, escapeRegExp, newTaskId } from "./lib/ids";
import { sortMilestones } from "./lib/milestones";
import { fillBackgroundForPct, sessionColorForTaskMs } from "./lib/colors";
import {
  STORAGE_KEY,
  HISTORY_KEY,
  DELETED_META_KEY,
  loadTasks,
  saveTasks,
  loadHistory,
  saveHistory,
  loadDeletedMeta,
  saveDeletedMeta,
  cleanupHistory,
} from "./lib/storage";

export type TaskTimerClientHandle = {
  destroy: () => void;
};

export function initTaskTimerClient(): TaskTimerClientHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }

  const listeners: Array<{
    el: EventTarget;
    type: string;
    fn: EventListenerOrEventListenerObject;
    opts?: boolean | AddEventListenerOptions;
  }> = [];

  const on = (
    el: EventTarget | null | undefined,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions
  ) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    listeners.push({ el, type, fn, opts });
  };

  let destroyed = false;
  let tickTimeout: number | null = null;
  let tickRaf: number | null = null;

  const destroy = () => {
    destroyed = true;

    if (tickTimeout != null) window.clearTimeout(tickTimeout);
    if (tickRaf != null) window.cancelAnimationFrame(tickRaf);

    for (const l of listeners) {
      try {
        l.el.removeEventListener(l.type, l.fn, l.opts as any);
      } catch {
        // ignore
      }
    }
  };

  let deletedTaskMeta: DeletedTaskMeta = {};
  let tasks: Task[] = [];
  let editIndex: number | null = null;

  let confirmAction: null | (() => void) = null;
  let confirmActionAlt: null | (() => void) = null;

  let historyByTaskId: HistoryByTaskId = {};
  let historyTaskId: string | null = null;
  let historyPage = 0;
  let historyEditMode = false;
  let historyBarRects: Array<any> = [];
  let historySelectedAbsIndex: number | null = null;
  let historySelectedRelIndex: number | null = null;
  let addTaskMilestonesEnabled = false;
  let addTaskMilestoneTimeUnit: "day" | "hour" = "hour";
  let addTaskMilestones: Task["milestones"] = [];
  let elapsedPadTarget: HTMLInputElement | null = null;
  let elapsedPadMilestoneRef: {
    task: Task;
    milestone: { hours: number; description: string };
    ms: Task["milestones"];
    onApplied?: () => void;
  } | null = null;
  let elapsedPadDraft = "";
  let elapsedPadOriginal = "";

  const els = {
    taskList: document.getElementById("taskList"),
    openAddTaskBtn: document.getElementById("openAddTaskBtn"),
    addTaskOverlay: document.getElementById("addTaskOverlay"),
    addTaskForm: document.getElementById("addTaskForm"),
    addTaskName: document.getElementById("addTaskName") as HTMLInputElement | null,
    addTaskError: document.getElementById("addTaskError"),
    addTaskMsToggle: document.getElementById("addTaskMsToggle"),
    addTaskMsUnitRow: document.getElementById("addTaskMsUnitRow"),
    addTaskMsUnitDay: document.getElementById("addTaskMsUnitDay"),
    addTaskMsUnitHour: document.getElementById("addTaskMsUnitHour"),
    addTaskAddMsBtn: document.getElementById("addTaskAddMsBtn") as HTMLButtonElement | null,
    addTaskMsArea: document.getElementById("addTaskMsArea"),
    addTaskMsList: document.getElementById("addTaskMsList"),
    addTaskCancelBtn: document.getElementById("addTaskCancelBtn"),
    resetAllBtn: document.getElementById("resetAllBtn"),

    menuIcon: document.getElementById("menuIcon"),
    menuOverlay: document.getElementById("menuOverlay"),
    historyManagerScreen: document.getElementById("historyManagerScreen"),
    historyManagerBtn: document.getElementById("historyManagerBtn"),
    historyManagerBackBtn: document.getElementById("historyManagerBackBtn"),
    hmList: document.getElementById("hmList"),
    closeMenuBtn: document.getElementById("closeMenuBtn"),

    aboutOverlay: document.getElementById("aboutOverlay"),
    howtoOverlay: document.getElementById("howtoOverlay"),
    appearanceOverlay: document.getElementById("appearanceOverlay"),
    contactOverlay: document.getElementById("contactOverlay"),

    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile") as HTMLInputElement | null,

    editOverlay: document.getElementById("editOverlay"),
    editName: document.getElementById("editName") as HTMLInputElement | null,
    editD: document.getElementById("editD") as HTMLInputElement | null,
    editH: document.getElementById("editH") as HTMLInputElement | null,
    editM: document.getElementById("editM") as HTMLInputElement | null,
    editS: document.getElementById("editS") as HTMLInputElement | null,
    msToggle: document.getElementById("msToggle"),
    msArea: document.getElementById("msArea"),
    msUnitRow: document.getElementById("msUnitRow"),
    msUnitDay: document.getElementById("msUnitDay"),
    msUnitHour: document.getElementById("msUnitHour"),
    msList: document.getElementById("msList"),
    addMsBtn: document.getElementById("addMsBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    saveEditBtn: document.getElementById("saveEditBtn"),
    elapsedPadOverlay: document.getElementById("elapsedPadOverlay"),
    elapsedPadTitle: document.getElementById("elapsedPadTitle"),
    elapsedPadDisplay: document.getElementById("elapsedPadDisplay"),
    elapsedPadError: document.getElementById("elapsedPadError"),
    elapsedPadCancelBtn: document.getElementById("elapsedPadCancelBtn"),
    elapsedPadDoneBtn: document.getElementById("elapsedPadDoneBtn"),

    confirmOverlay: document.getElementById("confirmOverlay"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmText: document.getElementById("confirmText"),
    confirmChkRow: document.getElementById("confirmChkRow"),
    confirmDeleteAll: document.getElementById("confirmDeleteAll") as HTMLInputElement | null,
    confirmCancelBtn: document.getElementById("confirmCancelBtn"),
    confirmOkBtn: document.getElementById("confirmOkBtn"),
    confirmAltBtn: document.getElementById("confirmAltBtn"),
    confirmChkLabel: document.getElementById("confirmChkLabel"),

    confirmChkRow2: document.getElementById("confirmChkRow2"),
    confirmChkLabel2: document.getElementById("confirmChkLabel2"),
    confirmLogChk: document.getElementById("confirmLogChk") as HTMLInputElement | null,

    historyScreen: document.getElementById("historyScreen"),
    historyBackBtn: document.getElementById("historyBackBtn"),
    historyTitle: document.getElementById("historyTitle"),
    historyOlderBtn: document.getElementById("historyOlderBtn") as HTMLButtonElement | null,
    historyNewerBtn: document.getElementById("historyNewerBtn") as HTMLButtonElement | null,
    historyRangeText: document.getElementById("historyRangeText"),
    historyBest: document.getElementById("historyBest"),
    historyCanvas: document.getElementById("historyChart") as HTMLCanvasElement | null,
    historyCanvasWrap: document.getElementById("historyCanvasWrap"),
    historyEditBtn: document.getElementById("historyEditBtn"),
    historyDeleteBtn: document.getElementById("historyDeleteBtn") as HTMLButtonElement | null,
    historyTrashRow: document.getElementById("historyTrashRow"),
  };

  function makeTask(name: string, order?: number): Task {
    return {
      id: cryptoRandomId(),
      name,
      order: order || 1,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestoneTimeUnit: "hour",
      milestones: [],
      hasStarted: false,
    };
  }

  function defaultTasks(): Task[] {
    return [makeTask("Exercise", 1), makeTask("Study", 2), makeTask("Meditation", 3)];
  }

  function load() {
    const loaded = loadTasks();
    if (!loaded || !Array.isArray(loaded) || loaded.length === 0) {
      tasks = defaultTasks();
      saveTasks(tasks);
      return;
    }
    tasks = loaded;
    tasks.forEach((t) => {
      if (t.milestoneTimeUnit !== "day" && t.milestoneTimeUnit !== "hour") t.milestoneTimeUnit = "hour";
    });
  }

  function save() {
    saveTasks(tasks);
  }

  function loadHistoryIntoMemory() {
    historyByTaskId = loadHistory();
    historyByTaskId = cleanupHistory(historyByTaskId);
    saveHistory(historyByTaskId);
  }

  function safeJsonParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  function makeBackupPayload() {
    return {
      schema: "taskticka_backup_v1",
      exportedAt: new Date().toISOString(),
      tasks: tasks || [],
      history: historyByTaskId || {},
    };
  }

  function exportBackup() {
    const d = new Date();
    const y = d.getFullYear();
    const mo = formatTwo(d.getMonth() + 1);
    const da = formatTwo(d.getDate());
    const hh = formatTwo(d.getHours());
    const mi = formatTwo(d.getMinutes());
    const ss = formatTwo(d.getSeconds());
    const filename = `taskticka-backup-${y}${mo}${da}-${hh}${mi}${ss}.json`;
    const payload = makeBackupPayload();
    downloadTextFile(filename, JSON.stringify(payload, null, 2));
    closeOverlay(els.menuOverlay as HTMLElement | null);
  }

  function normalizeImportedTask(t: any): Task {
    const out = makeTask(String(t.name || "Task"), 1);
    out.id = String(t.id || cryptoRandomId());
    out.order = Number.isFinite(+t.order) ? +t.order : 1;
    out.accumulatedMs = Number.isFinite(+t.accumulatedMs) ? Math.max(0, +t.accumulatedMs) : 0;
    out.running = false;
    out.startMs = null;
    out.collapsed = !!t.collapsed;
    out.milestonesEnabled = !!t.milestonesEnabled;
    out.milestoneTimeUnit = t.milestoneTimeUnit === "day" ? "day" : "hour";
    out.milestones = Array.isArray(t.milestones)
      ? t.milestones.map((m: any) => ({
          hours: Number.isFinite(+m.hours) ? +m.hours : 0,
          description: String(m.description || ""),
        }))
      : [];
    out.milestones = sortMilestones(out.milestones);
    out.hasStarted = !!t.hasStarted;
    return out;
  }

  function mergeBackup(payload: any) {
    if (!payload || typeof payload !== "object") return { ok: false, msg: "Invalid backup file." };

    const importedTasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    const importedHistory = payload.history && typeof payload.history === "object" ? payload.history : {};

    const existingMaxOrder = tasks.reduce((mx, t) => Math.max(mx, +t.order || 0), 0) || 0;
    const existingIds = new Set(tasks.map((t) => String(t.id)));
    const idMap: Record<string, string> = {};

    const orderedImport = importedTasks.slice().sort((a: any, b: any) => (+a.order || 0) - (+b.order || 0));

    let added = 0;

    orderedImport.forEach((rawTask: any, idx: number) => {
      if (!rawTask || typeof rawTask !== "object") return;
      const nt = normalizeImportedTask(rawTask);

      const oldId = String(nt.id || cryptoRandomId());
      let newId = oldId;
      if (existingIds.has(newId)) newId = cryptoRandomId();

      idMap[oldId] = newId;
      nt.id = newId;
      nt.order = existingMaxOrder + idx + 1;

      existingIds.add(newId);
      tasks.push(nt);
      added += 1;
    });

    Object.keys(importedHistory).forEach((oldId) => {
      const arr = (importedHistory as any)[oldId];
      if (!Array.isArray(arr) || arr.length === 0) return;

      const destId = idMap[String(oldId)] || String(oldId);
      if (!Array.isArray(historyByTaskId[destId])) historyByTaskId[destId] = [];

      arr.forEach((e: any) => {
        if (!e || typeof e !== "object") return;
        const ts = Number.isFinite(+e.ts) ? +e.ts : null;
        const ms = Number.isFinite(+e.ms) ? Math.max(0, +e.ms) : null;
        if (!ts || !ms) return;
        historyByTaskId[destId].push({
          name: String(e.name || ""),
          ms,
          ts,
          color: e.color ? String(e.color) : undefined,
        });
      });
    });

    save();
    saveHistory(historyByTaskId);
    historyByTaskId = cleanupHistory(historyByTaskId);
    saveHistory(historyByTaskId);
    render();

    return { ok: true, msg: `Imported ${added} task(s).` };
  }

  function importBackupFromFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const payload = safeJsonParse(text);
      const res = mergeBackup(payload);
      if (!res.ok) alert(res.msg || "Import failed.");
      else alert(res.msg || "Import complete.");
    };
    reader.onerror = () => alert("Could not read the file.");
    reader.readAsText(file);
  }

  function getElapsedMs(t: Task) {
    if (t.running && t.startMs) return (t.accumulatedMs || 0) + (nowMs() - t.startMs);
    return t.accumulatedMs || 0;
  }

  function getTaskElapsedMs(t: Task) {
    const runMs = t.running && typeof t.startMs === "number" ? Math.max(0, nowMs() - t.startMs) : 0;
    return Math.max(0, (t.accumulatedMs || 0) + runMs);
  }

  function canLogSession(t: Task) {
    if (!t.hasStarted) return false;
    return getTaskElapsedMs(t) > 0;
  }

  function escapeHtmlUI(str: any) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function appendHistory(taskId: string, entry: any) {
    if (!taskId) return;
    if (!Array.isArray(historyByTaskId[taskId])) historyByTaskId[taskId] = [];
    historyByTaskId[taskId].push(entry);
    saveHistory(historyByTaskId);
  }

  function openOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    overlay.style.display = "flex";
  }

  function closeOverlay(overlay: HTMLElement | null) {
    if (!overlay) return;
    try {
      if (document.activeElement && (document.activeElement as any).blur) (document.activeElement as any).blur();
    } catch {
      // ignore
    }
    overlay.style.display = "none";
  }

  function confirm(title: string, text: string, opts: any) {
    confirmAction = opts?.onOk || null;
    confirmActionAlt = opts?.onAlt || null;

    const okLabel = opts?.okLabel || "OK";
    const altLabel = opts?.altLabel || null;

    if (els.confirmOkBtn) {
      els.confirmOkBtn.textContent = okLabel;
      (els.confirmOkBtn as HTMLElement).style.display = "inline-flex";
    }

    if (els.confirmAltBtn) {
      if (altLabel) {
        els.confirmAltBtn.textContent = altLabel;
        (els.confirmAltBtn as HTMLElement).style.display = "inline-flex";
      } else {
        (els.confirmAltBtn as HTMLElement).style.display = "none";
        els.confirmAltBtn.textContent = "";
      }
    }

    const showChk = !!opts?.checkboxLabel;
    if (els.confirmChkRow) (els.confirmChkRow as HTMLElement).style.display = showChk ? "flex" : "none";
    if (showChk && els.confirmChkLabel) els.confirmChkLabel.textContent = opts.checkboxLabel;
    if (els.confirmDeleteAll) els.confirmDeleteAll.checked = showChk ? !!opts.checkboxChecked : false;

    const showChk2 = !!opts?.checkbox2Label;
    if (els.confirmChkRow2) (els.confirmChkRow2 as HTMLElement).style.display = showChk2 ? "flex" : "none";
    if (showChk2 && els.confirmChkLabel2) els.confirmChkLabel2.textContent = opts.checkbox2Label;
    if (els.confirmLogChk) els.confirmLogChk.checked = showChk2 ? !!opts.checkbox2Checked : false;

    if (els.confirmTitle) els.confirmTitle.textContent = title || "Confirm";
    if (els.confirmText) els.confirmText.textContent = text || "";

    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "flex";
  }

  function closeConfirm() {
    if (els.confirmOverlay) (els.confirmOverlay as HTMLElement).style.display = "none";
    confirmAction = null;
    confirmActionAlt = null;
    if (els.confirmAltBtn) (els.confirmAltBtn as HTMLElement).style.display = "none";
  }

  function milestoneUnitSec(t: Task | null | undefined): number {
    return t && t.milestoneTimeUnit === "day" ? 86400 : 3600;
  }

  function milestoneUnitSuffix(t: Task | null | undefined): string {
    return t && t.milestoneTimeUnit === "day" ? "d" : "h";
  }

  function setMilestoneUnitUi(unit: "day" | "hour") {
    els.msUnitDay?.classList.toggle("isOn", unit === "day");
    els.msUnitHour?.classList.toggle("isOn", unit === "hour");
  }

  function setAddTaskMilestoneUnitUi(unit: "day" | "hour") {
    els.addTaskMsUnitDay?.classList.toggle("isOn", unit === "day");
    els.addTaskMsUnitHour?.classList.toggle("isOn", unit === "hour");
  }

  function isEditMilestoneUnitDay(): boolean {
    if (editIndex == null) return false;
    const t = tasks[editIndex];
    return !!t && t.milestoneTimeUnit === "day";
  }

  function renderMilestoneEditor(t: Task) {
    if (!els.msList) return;
    els.msList.innerHTML = "";

    const ms = (t.milestones || []).slice();

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as any).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill">${escapeHtmlUI(String(+m.hours || 0))}${milestoneUnitSuffix(t)}</div>
        <input type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">✕</button>
      `;

      const pill = row.querySelector(".pill");
      on(pill, "click", () => {
        openElapsedPadForMilestone(t, m as { hours: number; description: string }, ms);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      on(desc, "input", (e: any) => {
        m.description = e?.target?.value || "";
        t.milestones = ms;
      });

      const rm = row.querySelector('[data-action="rmMs"]');
      on(rm, "click", () => {
        ms.splice(idx, 1);
        t.milestones = ms;
        renderMilestoneEditor(t);
      });

      els.msList!.appendChild(row);
    });

    t.milestones = ms;
  }

  function renderAddTaskMilestoneEditor() {
    if (!els.addTaskMsList) return;
    els.addTaskMsList.innerHTML = "";

    const ms = (addTaskMilestones || []).slice();
    const tempTask = { milestoneTimeUnit: addTaskMilestoneTimeUnit, milestones: ms } as Task;

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as any).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill">${escapeHtmlUI(String(+m.hours || 0))}${milestoneUnitSuffix(tempTask)}</div>
        <input type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">x</button>
      `;

      const pill = row.querySelector(".pill");
      on(pill, "click", () => {
        openElapsedPadForMilestone(tempTask, m as { hours: number; description: string }, ms, renderAddTaskMilestoneEditor);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      on(desc, "input", (e: any) => {
        m.description = e?.target?.value || "";
        addTaskMilestones = ms;
      });

      const rm = row.querySelector('[data-action="rmMs"]');
      on(rm, "click", () => {
        ms.splice(idx, 1);
        addTaskMilestones = ms;
        renderAddTaskMilestoneEditor();
      });

      els.addTaskMsList!.appendChild(row);
    });

    addTaskMilestones = ms;
  }

  function render() {
    if (!els.taskList) return;

    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    els.taskList.innerHTML = "";

    tasks.forEach((t, index) => {
      const elapsedMs = getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;

      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
      const maxValue = hasMilestones ? Math.max(...msSorted.map((m) => +m.hours || 0), 0) : 0;
      const maxSec = Math.max(maxValue * milestoneUnitSec(t), 1);
      const pct = hasMilestones ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

      const taskEl = document.createElement("div");
      taskEl.className = "task" + (t.collapsed ? " collapsed" : "");
      (taskEl as any).dataset.index = String(index);
      (taskEl as any).dataset.taskId = String(t.id || "");

      const collapseIcon = t.collapsed ? "►" : "▼";

      let progressHTML = "";
      if (hasMilestones) {
        let markers = "";
        const unitSuffix = milestoneUnitSuffix(t);
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0${unitSuffix}</div>`;

        msSorted.forEach((m) => {
          const val = +m.hours || 0;
          const left = Math.min((val / (maxValue || 1)) * 100, 100);
          const reached = elapsedSec >= val * milestoneUnitSec(t);
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${val}${unitSuffix}`;
          const desc = (m.description || "").trim();
          const edgeCls = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
          const leftPos = edgeCls === "mkEdgeL" ? 0 : edgeCls === "mkEdgeR" ? 100 : left;
          const wrapCls = edgeCls && label.length > 8 ? "mkWrap8" : "";
          markers += `
            <div class="mkLine" style="left:${leftPos}%"></div>
            <div class="mkTime ${cls} ${edgeCls} ${wrapCls}" style="left:${leftPos}%">${escapeHtmlUI(label)}</div>
            ${desc ? `<div class="mkDesc ${edgeCls}" style="left:${leftPos}%">${escapeHtmlUI(desc)}</div>` : ``}`;
        });

        progressHTML = `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${pct}%;background:${fillBackgroundForPct(pct)}"></div>
                ${markers}
              </div>
            </div>
          </div>`;
      }

      const showHistory = historyTaskId === t.id;
      const historyHTML = showHistory
        ? `
          <section class="historyInline" aria-label="History for ${escapeHtmlUI(t.name)}">
            <div class="historyTop">
              <div class="historyMeta">
                <div class="historyTitle">History: ${escapeHtmlUI(t.name)}</div>
              </div>
              <div class="historyMeta">
                <button class="btn btn-ghost small" type="button" data-history-action="close">Close</button>
              </div>
            </div>
            <div class="historyCanvasWrap">
              <canvas class="historyChartInline"></canvas>
            </div>
            <div class="historyTrashRow"></div>
            <div class="historyRangeRow">
              <div class="historyMeta historyRangeText">&nbsp;</div>
              <div class="historyMeta">
                <button class="btn btn-ghost small" type="button" data-history-action="older">Older</button>
                <button class="btn btn-ghost small" type="button" data-history-action="newer">Newer</button>
              </div>
            </div>
            <div class="historyBest"></div>
          </section>
        `
        : "";

      taskEl.innerHTML = `
        <div class="row">
          <div class="name" data-action="editName" title="Tap to edit">${escapeHtmlUI(t.name)}</div>
          <div class="time">${formatTime(elapsedMs)}</div>
          <div class="actions">
            <button class="iconBtn play" data-action="start" title="Start">▶</button>
            <button class="iconBtn stop" data-action="stop" title="Stop">■</button>
            <button class="iconBtn" data-action="reset" title="Reset">⟳</button>
            <button class="iconBtn" data-action="edit" title="Edit">✎</button>
            <button class="iconBtn" data-action="history" title="History">📊</button>
            <button class="iconBtn" data-action="duplicate" title="Duplicate">⧉</button>
            <button class="iconBtn" data-action="delete" title="Delete">🗑</button>
            <button class="iconBtn" data-action="collapse" title="Collapse">${escapeHtmlUI(collapseIcon)}</button>
          </div>
        </div>
        ${progressHTML}
        ${historyHTML}
      `;

      els.taskList!.appendChild(taskEl);
    });

    save();
    if (historyTaskId) renderHistory();
  }

  function startTask(i: number) {
    const t = tasks[i];
    if (!t || t.running) return;
    t.running = true;
    t.startMs = nowMs();
    t.hasStarted = true;
    save();
    render();
  }

  function stopTask(i: number) {
    const t = tasks[i];
    if (!t || !t.running) return;
    t.accumulatedMs = getElapsedMs(t);
    t.running = false;
    t.startMs = null;
    save();
    render();
  }

  function toggleCollapse(i: number) {
    const t = tasks[i];
    if (!t) return;
    t.collapsed = !t.collapsed;
    save();
    render();
  }

  function openHistory(i: number) {
    const t = tasks[i];
    if (!t) return;
    if (historyTaskId === t.id) {
      closeHistory();
      return;
    }
    historyTaskId = t.id;
    historyPage = 0;
    historyEditMode = false;
    render();
  }

  function closeHistory() {
    historyTaskId = null;
    historyPage = 0;
    historyEditMode = false;
    render();
  }

  function getHistoryForTask(taskId: string) {
    const arr = Array.isArray(historyByTaskId?.[taskId]) ? historyByTaskId[taskId] : [];
    return arr.slice().sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0));
  }

  function historyPageSize() {
    return 7;
  }

  type HistoryUI = {
    root: HTMLElement;
    canvasWrap: HTMLElement | null;
    canvas: HTMLCanvasElement | null;
    rangeText: HTMLElement | null;
    olderBtn: HTMLButtonElement | null;
    newerBtn: HTMLButtonElement | null;
    best: HTMLElement | null;
    trashRow: HTMLElement | null;
    deleteBtn: HTMLButtonElement | null;
  };

  function getHistoryUi(): HistoryUI | null {
    if (!historyTaskId || !els.taskList) return null;
    const root = els.taskList.querySelector(`.task[data-task-id="${historyTaskId}"] .historyInline`) as HTMLElement | null;
    if (!root) return null;
    return {
      root,
      canvasWrap: root.querySelector(".historyCanvasWrap"),
      canvas: root.querySelector(".historyChartInline"),
      rangeText: root.querySelector(".historyRangeText"),
      olderBtn: root.querySelector('[data-history-action="older"]'),
      newerBtn: root.querySelector('[data-history-action="newer"]'),
      best: root.querySelector(".historyBest"),
      trashRow: root.querySelector(".historyTrashRow"),
      deleteBtn: root.querySelector('[data-history-action="delete"]'),
    };
  }

  function renderHistoryTrashRow(slice: any[], absStartIndex: number, ui: HistoryUI) {
    if (!ui.trashRow) return;

    if (!historyEditMode) {
      ui.trashRow.style.display = "none";
      ui.trashRow.innerHTML = "";
      return;
    }

    ui.trashRow.style.display = "flex";

    const pageSize = historyPageSize();
    const buttons: string[] = [];

    for (let i = 0; i < pageSize; i++) {
      const e = slice[i];
      const absIndex = absStartIndex + i;
      const disabled = !e;

      buttons.push(
        `<button class="historyTrashBtn" type="button" data-abs="${absIndex}" ${
          disabled ? "disabled" : ""
        } aria-label="Delete log" title="Delete log">🗑</button>`
      );
    }

    ui.trashRow.innerHTML = buttons.join("");
  }

  function drawHistoryChart(entries: any[], absStartIndex: number, ui: HistoryUI) {
    const canvas = ui.canvas;
    const wrap = ui.canvasWrap;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(300, Math.floor(rect.width));
    const h = Math.max(200, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 12;
    const padR = 12;
    const padT = 14;
    const padB = 54;

    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    ctx.strokeStyle = "rgba(255,255,255,.20)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + innerH + 0.5);
    ctx.lineTo(padL + innerW, padT + innerH + 0.5);
    ctx.stroke();

    historyBarRects = [];

    if (!entries || !entries.length) {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No entries to display", padL + innerW / 2, padT + innerH / 2);
      return;
    }

    const maxMs = Math.max(...entries.map((e) => e.ms || 0), 1);
    const historyTask =
      historyTaskId != null ? tasks.find((task) => String(task.id || "") === String(historyTaskId)) : null;
    const milestoneMs =
      historyTask && historyTask.milestonesEnabled && Array.isArray(historyTask.milestones)
        ? sortMilestones(historyTask.milestones)
            .map((m) => ({ value: +m.hours || 0, ms: Math.max(0, (+m.hours || 0) * milestoneUnitSec(historyTask) * 1000) }))
            .filter((x, i, arr) => x.ms > 0 && arr.findIndex((y) => y.ms === x.ms) === i)
        : [];
    const gap = Math.max(10, Math.floor(innerW * 0.03));
    const barW = Math.max(22, Math.floor((innerW - gap * (7 - 1)) / 7));

    ctx.textAlign = "center";

    for (let idx = 0; idx < 7; idx++) {
      const e = entries[idx];
      if (!e) continue;

      const ms = Math.max(0, e.ms || 0);
      const ratio = ms / maxMs;
      const bh = Math.max(2, Math.floor(innerH * ratio));

      const x = padL + idx * (barW + gap);
      const y = padT + innerH - bh;

      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = e.color || "rgb(0,207,200)";
      ctx.fillRect(x, y, barW, bh);
      ctx.restore();

      if (milestoneMs.length) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.72)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        for (const goal of milestoneMs) {
          const goalMs = goal.ms;
          const markerRatio = Math.max(0, Math.min(1, goalMs / maxMs));
          const markerY = padT + innerH - Math.floor(innerH * markerRatio) + 0.5;
          ctx.beginPath();
          ctx.moveTo(x + 1, markerY);
          ctx.lineTo(x + barW - 1, markerY);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255,255,255,.95)";
          ctx.font = "10px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${goal.value}${milestoneUnitSuffix(historyTask || undefined)}`, x + barW / 2, markerY);
          ctx.setLineDash([3, 2]);
        }
        ctx.restore();
      }

      historyBarRects[idx] = { x, y, w: barW, h: bh, absIndex: (absStartIndex || 0) + idx };

      if (historySelectedRelIndex === idx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, barW - 2, bh - 2);
        ctx.restore();
      }

      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

      const d = new Date(e.ts || 0);
      const dd = formatTwo(d.getDate());
      const mm = formatTwo(d.getMonth() + 1);
      const hh = formatTwo(d.getHours());
      const mi = formatTwo(d.getMinutes());

      ctx.fillText(`${dd}/${mm}:${hh}:${mi}`, x + barW / 2, padT + innerH + 22);
      ctx.fillStyle = "rgb(0,207,200)";
      ctx.font = "700 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(formatTime(ms), x + barW / 2, padT + innerH + 39);
    }
  }

  function renderHistory() {
    if (!historyTaskId) return;
    const ui = getHistoryUi();
    if (!ui) return;

    const all = getHistoryForTask(historyTaskId);
    const total = all.length;
    const pageSize = historyPageSize();

    const end = Math.max(0, total - historyPage * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = all.slice(start, end);

    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (historyPage > maxPage) historyPage = maxPage;

    if (ui.rangeText) {
      if (total === 0) ui.rangeText.textContent = "No entries yet";
      else ui.rangeText.textContent = `Showing ${slice.length} of ${total} entries`;
    }

    if (ui.olderBtn) ui.olderBtn.disabled = start <= 0;
    if (ui.newerBtn) ui.newerBtn.disabled = end >= total;

    historySelectedAbsIndex = null;
    historySelectedRelIndex = null;
    if (ui.deleteBtn) ui.deleteBtn.disabled = true;

    drawHistoryChart(slice, start, ui);
    renderHistoryTrashRow(slice, start, ui);

    if (ui.best) {
      if (total === 0) {
        ui.best.textContent = "";
      } else {
        let best = all[0];
        for (let i = 1; i < all.length; i++) {
          if ((all[i].ms || 0) > (best.ms || 0)) best = all[i];
        }
        ui.best.textContent = `All-time best: ${formatTime(best.ms || 0)} on ${formatDateTime(best.ts)}`;
      }
    }
  }

  function resetTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    confirm("Reset Task", "Reset timer to zero?", {
      okLabel: "Reset",
      cancelLabel: "Cancel",
      checkboxLabel: "Log this entry",
      checkboxChecked: true,
      onOk: () => {
        const doLog = !!els.confirmDeleteAll?.checked;

        if (doLog && canLogSession(t)) {
          const ms = getTaskElapsedMs(t);
          if (ms > 0) {
            appendHistory(t.id, { ts: nowMs(), name: t.name, ms, color: sessionColorForTaskMs(t, ms) });
          }
        }

        t.accumulatedMs = 0;
        t.running = false;
        t.startMs = null;
        t.hasStarted = false;

        save();
        render();
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function resetAll() {
    const eligibleTasks = tasks.filter((t) => canLogSession(t));

    confirm("Reset All", "Reset all timers?", {
      okLabel: "Reset",
      checkboxLabel: "Also delete all tasks",
      checkboxChecked: false,
      checkbox2Label: eligibleTasks.length ? "Log eligible sessions to History" : null,
      checkbox2Checked: eligibleTasks.length ? true : false,
      onOk: () => {
        const alsoDelete = !!els.confirmDeleteAll?.checked;
        const doLog = eligibleTasks.length ? !!els.confirmLogChk?.checked : false;

        if (doLog) {
          eligibleTasks.forEach((t) => {
            const ms = getTaskElapsedMs(t);
            if (ms > 0) {
              appendHistory(t.id, { ts: nowMs(), name: t.name, ms, color: sessionColorForTaskMs(t, ms) });
            }
          });
        }

        if (alsoDelete) {
          tasks = [];
          historyByTaskId = {};
          saveHistory(historyByTaskId);
        } else {
          tasks.forEach((t) => {
            t.accumulatedMs = 0;
            t.running = false;
            t.startMs = null;
            t.hasStarted = false;
          });
        }

        save();
        render();
        closeConfirm();
      },
    });
  }

  function openEdit(i: number) {
    const t = tasks[i];
    if (!t) return;
    editIndex = i;

    if (els.editName) els.editName.value = t.name || "";

    const elapsedMs = getElapsedMs(t);
    const totalSec = Math.floor(elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const remAfterDays = totalSec % 86400;
    const h = Math.floor(remAfterDays / 3600);
    const m = Math.floor((remAfterDays % 3600) / 60);
    const s = remAfterDays % 60;

    if (els.editD) els.editD.value = String(d);
    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);

    els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
    els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
    els.msArea?.classList.toggle("on", !!t.milestonesEnabled);
    setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : "hour");

    renderMilestoneEditor(t);

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const t = editIndex != null ? tasks[editIndex] : null;

    if (saveChanges && t) {
      t.name = (els.editName?.value || "").trim() || t.name;

      const dd = Math.max(0, parseInt(els.editD?.value || "0", 10) || 0);
      const rawH = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
      const hh = isEditMilestoneUnitDay() ? Math.min(23, rawH) : rawH;
      const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
      const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));

      const newMs = (dd * 86400 + hh * 3600 + mm * 60 + ss) * 1000;

      t.accumulatedMs = newMs;
      t.startMs = t.running ? nowMs() : null;

      t.milestones = sortMilestones(t.milestones);

      save();
      render();
    }

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    closeElapsedPad(false);
    editIndex = null;
  }

  function elapsedPadLabelForInput(input: HTMLInputElement | null) {
    if (!input) return "Value";
    if (input === els.editD) return "Days";
    if (input === els.editH) return "Hours";
    if (input === els.editM) return "Minutes";
    if (input === els.editS) return "Seconds";
    return "Value";
  }

  function elapsedPadRangeForInput(input: HTMLInputElement | null) {
    if (input === els.editD) return { min: 0, max: Number.POSITIVE_INFINITY };
    if (input === els.editH) {
      return isEditMilestoneUnitDay()
        ? { min: 0, max: 23 }
        : { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (input === els.editM || input === els.editS) return { min: 0, max: 59 };
    return { min: 0, max: 59 };
  }

  function elapsedPadErrorTextForInput(input: HTMLInputElement | null) {
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(range.max)) return `Enter a number greater than or equal to ${range.min}`;
    return `Enter a number within the range ${range.min}-${range.max}`;
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function elapsedPadValidatedValue(raw: string, input: HTMLInputElement | null) {
    const parsed = parseInt(raw || "", 10);
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(parsed) || isNaN(parsed)) return null;
    if (parsed < range.min || parsed > range.max) return null;
    return String(parsed);
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (elapsedPadDraft || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
  }

  function openElapsedPad(input: HTMLInputElement | null) {
    if (!input || !els.elapsedPadOverlay) return;
    elapsedPadMilestoneRef = null;
    elapsedPadTarget = input;
    elapsedPadOriginal = input.value || "0";
    elapsedPadDraft = elapsedPadOriginal;
    if (els.elapsedPadTitle) els.elapsedPadTitle.textContent = `Enter ${elapsedPadLabelForInput(input)}`;
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    if (!els.elapsedPadOverlay) return;
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = { task, milestone, ms, onApplied };
    elapsedPadOriginal = String(+milestone.hours || 0);
    elapsedPadDraft = elapsedPadOriginal;
    if (els.elapsedPadTitle) {
      els.elapsedPadTitle.textContent =
        task.milestoneTimeUnit === "day" ? "Enter Milestone Days" : "Enter Milestone Hours";
    }
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function closeElapsedPad(applyValue: boolean) {
    if (applyValue && (elapsedPadTarget || elapsedPadMilestoneRef)) {
      const valid =
        elapsedPadMilestoneRef && !elapsedPadTarget
          ? (() => {
              const parsed = parseInt(elapsedPadDraft || "", 10);
              if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) return null;
              return String(parsed);
            })()
          : elapsedPadValidatedValue(elapsedPadDraft, elapsedPadTarget);
      if (valid == null) {
        setElapsedPadError(
          elapsedPadMilestoneRef && !elapsedPadTarget
            ? "Enter a valid number"
            : elapsedPadErrorTextForInput(elapsedPadTarget)
        );
        return;
      }
      if (elapsedPadTarget) {
        elapsedPadTarget.value = valid;
      } else if (elapsedPadMilestoneRef) {
        elapsedPadMilestoneRef.milestone.hours = Number(valid);
        elapsedPadMilestoneRef.task.milestones = elapsedPadMilestoneRef.ms;
        if (elapsedPadMilestoneRef.onApplied) elapsedPadMilestoneRef.onApplied();
        else renderMilestoneEditor(elapsedPadMilestoneRef.task);
      }
    } else if (!applyValue && elapsedPadTarget) {
      elapsedPadTarget.value = elapsedPadOriginal;
    }
    clearElapsedPadError();
    if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "none";
    elapsedPadTarget = null;
    elapsedPadMilestoneRef = null;
    elapsedPadDraft = "";
    elapsedPadOriginal = "";
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const next = `${elapsedPadDraft || ""}${digit}`.replace(/^0+(?=\d)/, "");
    elapsedPadDraft = next.slice(0, 6) || "0";
    renderElapsedPadDisplay();
  }

  function padBackspace() {
    clearElapsedPadError();
    const next = (elapsedPadDraft || "").slice(0, -1);
    elapsedPadDraft = next || "0";
    renderElapsedPadDisplay();
  }

  function padClear() {
    clearElapsedPadError();
    elapsedPadDraft = "0";
    renderElapsedPadDisplay();
  }

  function nextDuplicateName(originalName: string) {
    const name = (originalName || "Task").trim();
    const root = name.replace(/\s\d+$/, "").trim();
    let maxN = 0;

    tasks.forEach((t) => {
      const n = (t.name || "").trim();
      if (n === root) return;
      const mm = n.match(new RegExp("^" + escapeRegExp(root) + "\\s(\\d+)$"));
      if (mm) {
        const v = parseInt(mm[1], 10);
        if (!isNaN(v)) maxN = Math.max(maxN, v);
      }
    });

    return root + " " + (maxN + 1);
  }

  function duplicateTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    const newId = newTaskId();
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = newId;
    copy.name = nextDuplicateName(t.name);

    copy.running = false;
    copy.startMs = null;

    tasks.splice(i + 1, 0, copy);

    const h = historyByTaskId && historyByTaskId[t.id] ? JSON.parse(JSON.stringify(historyByTaskId[t.id])) : [];
    historyByTaskId[newId] = h;

    saveHistory(historyByTaskId);
    save();
    render();
  }

  function deleteTask(i: number) {
    const t = tasks[i];
    if (!t) return;

    confirm("Delete Task", `Delete "${t.name}"?`, {
      okLabel: "Delete",
      cancelLabel: "Cancel",
      checkboxLabel: "Delete history logs",
      checkboxChecked: true,
      onOk: () => {
        const deleteHistory = !!els.confirmDeleteAll?.checked;

        tasks.splice(i, 1);

        if (deleteHistory) {
          if (historyByTaskId && historyByTaskId[t.id]) delete historyByTaskId[t.id];
          if (deletedTaskMeta && (deletedTaskMeta as any)[t.id]) delete (deletedTaskMeta as any)[t.id];
          saveHistory(historyByTaskId);

          if (deletedTaskMeta && (deletedTaskMeta as any)[t.id]) delete (deletedTaskMeta as any)[t.id];
          saveDeletedMeta(deletedTaskMeta);
        } else {
          deletedTaskMeta = deletedTaskMeta || ({} as DeletedTaskMeta);
          (deletedTaskMeta as any)[t.id] = { name: t.name, color: t.color || null, deletedAt: nowMs() };
          saveDeletedMeta(deletedTaskMeta);
          saveHistory(historyByTaskId);
        }

        save();
        render();
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  function getTaskMetaForHistoryId(taskId: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (t) return { name: t.name, color: (t as any).color, deleted: false };

    const dm = deletedTaskMeta && (deletedTaskMeta as any)[taskId];
    if (dm) return { name: dm.name || "Deleted Task", color: dm.color || null, deleted: true };

    const arr = historyByTaskId && historyByTaskId[taskId];
    if (arr && arr.length) {
      const e = arr[arr.length - 1] as any;
      return { name: e.name || "Deleted Task", color: e.color || null, deleted: true };
    }

    return { name: "Deleted Task", color: null, deleted: true };
  }

  function escapeHtmlHM(str: any) {
    return String(str || "").replace(/[&<>"']/g, (s) => {
      const map: any = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[s];
    });
  }

  function renderHistoryManager() {
    const listEl = document.getElementById("hmList");
    if (!listEl) return;

    let hb: Record<string, any[]> = {};
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      hb = raw ? JSON.parse(raw) : {};
      if (!hb || typeof hb !== "object") hb = {};
    } catch {
      hb = {};
    }

    const idsWithHistory = Object.keys(hb || {}).filter((id) => {
      const arr = (hb as any)[id];
      return Array.isArray(arr) && arr.length;
    });

    if (!idsWithHistory.length) {
      listEl.innerHTML = `<div class="hmEmpty">No history entries found.</div>`;
      return;
    }

    const currentOrder = (tasks || []).map((t) => String(t.id));
    idsWithHistory.sort((a, b) => {
      const ai = currentOrder.indexOf(String(a));
      const bi = currentOrder.indexOf(String(b));
      const aIsCurrent = ai !== -1;
      const bIsCurrent = bi !== -1;
      if (aIsCurrent && bIsCurrent) return ai - bi;
      if (aIsCurrent) return -1;
      if (bIsCurrent) return 1;
      const ar = (hb as any)[a][(hb as any)[a].length - 1]?.ts || 0;
      const br = (hb as any)[b][(hb as any)[b].length - 1]?.ts || 0;
      return br - ar;
    });

    const groups = idsWithHistory
      .map((taskId) => {
        const meta = getTaskMetaForHistoryId(taskId);
        const arr = ((hb as any)[taskId] || []).slice().sort((x: any, y: any) => (y.ts || 0) - (x.ts || 0));

        const rows = arr
          .map((e: any) => {
            const dt = formatDateTime(e.ts);
            const tm = formatTime(e.ms || 0);
            const key = `${e.ts}|${e.ms}|${String(e.name || "")}`;
            return `
              <tr>
                <td>${dt}</td>
                <td>${tm}</td>
                <td style="text-align:right;">
                  <button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(
              key
            )}" aria-label="Delete log" title="Delete log">🗑</button>
                </td>
              </tr>
            `;
          })
          .join("");

        const swatch = meta.color
          ? `<span class="hmSwatch" style="background:${meta.color};"></span>`
          : `<span class="hmSwatch"></span>`;
        const badge = meta.deleted ? `<span class="hmBadge deleted">Deleted</span>` : ``;

        return `
          <details class="hmGroup">
            <summary class="hmSummary">
              <div class="hmTitleRow">
                ${swatch}
                <div class="hmTaskName">${escapeHtmlHM(meta.name || "Task")}</div>
                ${badge}
              </div>
              <div class="hmCount">${arr.length} logs</div>
            </summary>

            <table class="hmTable" role="table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Elapsed</th>
                  <th style="text-align:right;">Delete</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </details>
        `;
      })
      .join("");

    listEl.innerHTML = groups;
  }

  function openHistoryManager() {
    if (els.menuOverlay) (els.menuOverlay as HTMLElement).style.display = "none";
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "block";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    renderHistoryManager();
  }

  function closeHistoryManager() {
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "none";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
  }

  function openPopup(which: string) {
    if (which === "historyManager") {
      openHistoryManager();
      return;
    }

    closeOverlay(els.menuOverlay as HTMLElement | null);

    const map: Record<string, HTMLElement | null> = {
      about: els.aboutOverlay as HTMLElement | null,
      howto: els.howtoOverlay as HTMLElement | null,
      appearance: els.appearanceOverlay as HTMLElement | null,
      contact: els.contactOverlay as HTMLElement | null,
    };

    if (map[which]) openOverlay(map[which]);
  }

  function wireEvents() {
    const setAddTaskError = (msg: string) => {
      if (els.addTaskError) els.addTaskError.textContent = msg;
    };

    const syncAddTaskMilestonesUi = () => {
      els.addTaskMsToggle?.classList.toggle("on", addTaskMilestonesEnabled);
      els.addTaskMsToggle?.setAttribute("aria-checked", String(addTaskMilestonesEnabled));
      els.addTaskMsArea?.classList.toggle("on", addTaskMilestonesEnabled);
      setAddTaskMilestoneUnitUi(addTaskMilestoneTimeUnit);
    };

    const resetAddTaskMilestones = () => {
      addTaskMilestonesEnabled = false;
      addTaskMilestoneTimeUnit = "hour";
      addTaskMilestones = [];
      if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
      syncAddTaskMilestonesUi();
    };

    const openAddTaskModal = () => {
      resetAddTaskMilestones();
      setAddTaskError("");
      openOverlay(els.addTaskOverlay as HTMLElement | null);
      setTimeout(() => {
        try {
          els.addTaskName?.focus();
        } catch {
          // ignore
        }
      }, 60);
    };

    const closeAddTaskModal = () => {
      closeOverlay(els.addTaskOverlay as HTMLElement | null);
      if (els.addTaskName) els.addTaskName.value = "";
      setAddTaskError("");
      resetAddTaskMilestones();
    };

    on(els.openAddTaskBtn, "click", openAddTaskModal);
    on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    on(els.addTaskOverlay, "click", (e: any) => {
      if (e.target === els.addTaskOverlay) closeAddTaskModal();
    });

    on(els.addTaskMsToggle, "click", () => {
      addTaskMilestonesEnabled = !addTaskMilestonesEnabled;
      syncAddTaskMilestonesUi();
    });

    on(els.addTaskMsUnitDay, "click", () => {
      addTaskMilestoneTimeUnit = "day";
      setAddTaskMilestoneUnitUi("day");
      renderAddTaskMilestoneEditor();
    });

    on(els.addTaskMsUnitHour, "click", () => {
      addTaskMilestoneTimeUnit = "hour";
      setAddTaskMilestoneUnitUi("hour");
      renderAddTaskMilestoneEditor();
    });

    on(els.addTaskName, "input", () => {
      if ((els.addTaskName?.value || "").trim()) setAddTaskError("");
    });

    on(els.addTaskAddMsBtn, "click", () => {
      if (!addTaskMilestonesEnabled) return;
      addTaskMilestones.push({ hours: 0, description: "" });
      renderAddTaskMilestoneEditor();
    });

    on(els.addTaskForm, "submit", (e: any) => {
      e.preventDefault();
      const name = (els.addTaskName?.value || "").trim();
      if (!name) {
        setAddTaskError("Task name is required");
        return;
      }
      setAddTaskError("");
      const nextOrder = (tasks.reduce((mx, t) => Math.max(mx, t.order || 0), 0) || 0) + 1;
      const newTask = makeTask(name, nextOrder);
      newTask.milestonesEnabled = addTaskMilestonesEnabled;
      newTask.milestoneTimeUnit = addTaskMilestoneTimeUnit;
      newTask.milestones = sortMilestones(addTaskMilestones.slice());
      tasks.push(newTask);
      closeAddTaskModal();
      save();
      render();
    });

    on(els.taskList, "click", (e: any) => {
      const taskEl = e.target?.closest?.(".task");
      if (!taskEl) return;
      const i = parseInt(taskEl.dataset.index, 10);
      if (!Number.isFinite(i)) return;

      const btn = e.target?.closest?.("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "start") startTask(i);
      else if (action === "stop") stopTask(i);
      else if (action === "reset") resetTask(i);
      else if (action === "delete") deleteTask(i);
      else if (action === "edit") openEdit(i);
      else if (action === "history") openHistory(i);
      else if (action === "duplicate") duplicateTask(i);
      else if (action === "editName") openEdit(i);
      else if (action === "collapse") toggleCollapse(i);
    });

    on(els.resetAllBtn, "click", resetAll);

    on(els.taskList, "click", (ev: any) => {
      const btn = ev.target?.closest?.("[data-history-action]");
      const action = btn?.getAttribute?.("data-history-action");
      if (!action) return;

      if (action === "close") {
        closeHistory();
        return;
      }
      if (action === "edit") {
        historyEditMode = !historyEditMode;
        renderHistory();
        return;
      }
      if (action === "older") {
        historyPage += 1;
        renderHistory();
        return;
      }
      if (action === "newer") {
        historyPage = Math.max(0, historyPage - 1);
        renderHistory();
        return;
      }
      if (action !== "delete" || historySelectedAbsIndex == null || !historyTaskId) return;

      const all = getHistoryForTask(historyTaskId);
      const e = all[historySelectedAbsIndex];
      if (!e) return;

      confirm("Delete Log Entry", `Delete this entry (${formatTime(e.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          const all2 = getHistoryForTask(historyTaskId);
          if (historySelectedAbsIndex! >= 0 && historySelectedAbsIndex! < all2.length) {
            all2.splice(historySelectedAbsIndex!, 1);
            historyByTaskId[historyTaskId] = all2 as any;
            saveHistory(historyByTaskId);

            const maxPage = Math.max(0, Math.ceil(all2.length / historyPageSize()) - 1);
            historyPage = Math.min(historyPage, maxPage);
            renderHistory();
          }
          closeConfirm();
        },
      });
    });

    on(els.taskList, "click", (ev: any) => {
      const canvas = ev.target?.closest?.(".historyChartInline") as HTMLCanvasElement | null;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      let hit: any = null;
      for (let i = 0; i < historyBarRects.length; i++) {
        const r = historyBarRects[i];
        if (!r) continue;
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
          hit = { rel: i, abs: r.absIndex };
          break;
        }
      }

      if (hit) {
        historySelectedRelIndex = hit.rel;
        historySelectedAbsIndex = hit.abs;
        const ui = getHistoryUi();
        if (ui?.deleteBtn) ui.deleteBtn.disabled = false;
      } else {
        historySelectedRelIndex = null;
        historySelectedAbsIndex = null;
        const ui = getHistoryUi();
        if (ui?.deleteBtn) ui.deleteBtn.disabled = true;
      }

      renderHistory();
    });

    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    let touchWrap: HTMLElement | null = null;

    on(
      els.taskList,
      "touchstart",
      (e: any) => {
        touchWrap = e.target?.closest?.(".historyCanvasWrap") || null;
        if (!touchWrap) return;
        if (!e.touches || !e.touches.length) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    on(
      els.taskList,
      "touchend",
      (e: any) => {
        if (!touchWrap) return;
        if (touchStartX === null || touchStartY === null) return;
        const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
        if (!t) return;

        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;

        touchStartX = null;
        touchStartY = null;
        touchWrap = null;

        if (Math.abs(dx) < 40) return;
        if (Math.abs(dy) > 60) return;

        if (dx < 0) {
          const ui = getHistoryUi();
          if (!ui?.olderBtn?.disabled) {
            historyPage += 1;
            renderHistory();
          }
        } else {
          const ui = getHistoryUi();
          if (!ui?.newerBtn?.disabled) {
            historyPage = Math.max(0, historyPage - 1);
            renderHistory();
          }
        }
      },
      { passive: true }
    );

    on(window, "resize", () => {
      if (historyTaskId) renderHistory();
    });

    on(els.menuIcon, "click", () => openOverlay(els.menuOverlay as HTMLElement | null));
    on(els.closeMenuBtn, "click", () => closeOverlay(els.menuOverlay as HTMLElement | null));

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    on(els.exportBtn, "click", exportBackup);
    on(els.importBtn, "click", () => els.importFile?.click());

    on(els.importFile, "change", (e: any) => {
      const f = e.target?.files && e.target.files[0] ? e.target.files[0] : null;
      e.target.value = "";
      if (f) importBackupFromFile(f);
    });

    document.querySelectorAll(".closePopup").forEach((btn) => {
      on(btn, "click", () => {
        const ov = (btn as HTMLElement).closest(".overlay") as HTMLElement | null;
        if (ov) closeOverlay(ov);
      });
    });

    on(els.cancelEditBtn, "click", () => closeEdit(false));
    on(els.saveEditBtn, "click", () => closeEdit(true));
    on(els.editD, "click", (e: any) => {
      e.preventDefault();
      openElapsedPad(els.editD);
    });
    on(els.editH, "click", (e: any) => {
      e.preventDefault();
      openElapsedPad(els.editH);
    });
    on(els.editM, "click", (e: any) => {
      e.preventDefault();
      openElapsedPad(els.editM);
    });
    on(els.editS, "click", (e: any) => {
      e.preventDefault();
      openElapsedPad(els.editS);
    });
    on(els.editD, "focus", () => openElapsedPad(els.editD));
    on(els.editH, "focus", () => openElapsedPad(els.editH));
    on(els.editM, "focus", () => openElapsedPad(els.editM));
    on(els.editS, "focus", () => openElapsedPad(els.editS));

    on(els.elapsedPadOverlay, "click", (e: any) => {
      if (e.target === els.elapsedPadOverlay) closeElapsedPad(false);
    });
    on(els.elapsedPadCancelBtn, "click", () => closeElapsedPad(false));
    on(els.elapsedPadDoneBtn, "click", () => closeElapsedPad(true));

    document.querySelectorAll(".elapsedPadKey").forEach((btn) => {
      on(btn, "click", () => {
        const el = btn as HTMLElement;
        const digit = el.getAttribute("data-pad-digit");
        const action = el.getAttribute("data-pad-action");
        if (digit != null) {
          padAppendDigit(digit);
          return;
        }
        if (action === "back") {
          padBackspace();
          return;
        }
        if (action === "clear") {
          padClear();
        }
      });
    });

    on(els.msToggle, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestonesEnabled = !t.milestonesEnabled;
      els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
      els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
      els.msArea?.classList.toggle("on", !!t.milestonesEnabled);

      if (!t.milestonesEnabled) {
        save();
        render();
      }
    });

    on(els.msUnitDay, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "day";
      setMilestoneUnitUi("day");
      renderMilestoneEditor(t);
    });
    on(els.msUnitHour, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;
      t.milestoneTimeUnit = "hour";
      setMilestoneUnitUi("hour");
      renderMilestoneEditor(t);
    });

    on(els.addMsBtn, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestones = t.milestones || [];
      t.milestones.push({ hours: 0, description: "" });
      renderMilestoneEditor(t);
    });

    on(els.confirmCancelBtn, "click", closeConfirm);
    on(els.confirmAltBtn, "click", () => {
      if (typeof confirmActionAlt === "function") confirmActionAlt();
    });
    on(els.confirmOkBtn, "click", () => {
      if (typeof confirmAction === "function") confirmAction();
      else closeConfirm();
    });

    on(els.historyManagerBtn, "click", () => openPopup("historyManager"));
    on(els.historyManagerBackBtn, "click", () => {
      closeHistoryManager();
      openOverlay(els.menuOverlay as HTMLElement | null);
    });

    on(els.hmList, "click", (ev: any) => {
      const btn = ev.target?.closest?.(".hmDelBtn");
      if (!btn) return;

      const taskId = btn.getAttribute("data-task");
      const key = btn.getAttribute("data-key");
      if (!taskId || !key) return;

      const parts = key.split("|");
      const ts = parseInt(parts[0], 10);
      const ms = parseInt(parts[1], 10);
      const name = parts.slice(2).join("|");

      confirm("Delete Log Entry", "Delete this entry?", {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          historyByTaskId = loadHistory();
          const orig = historyByTaskId[taskId] || [];
          const pos = orig.findIndex(
            (e: any) => e.ts === ts && e.ms === ms && String(e.name || "") === String(name || "")
          );

          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            saveHistory(historyByTaskId);

            if (orig.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
              delete (deletedTaskMeta as any)[taskId];
              saveDeletedMeta(deletedTaskMeta);
            }
          }

          renderHistoryManager();
          closeConfirm();
        },
        onCancel: () => closeConfirm(),
      });
    });
  }

  function tick() {
    if (destroyed) return;

    if (!els.taskList) {
      tickRaf = window.requestAnimationFrame(() => {
        tickTimeout = window.setTimeout(tick, 200);
      });
      return;
    }

    const nodes = els.taskList.querySelectorAll(".task");
    nodes.forEach((node) => {
      const i = parseInt((node as HTMLElement).dataset.index || "0", 10);
      const t = tasks[i];
      if (!t) return;

      const timeEl = node.querySelector(".time");
      if (timeEl) timeEl.textContent = formatTime(getElapsedMs(t));

      if (t.milestonesEnabled && t.milestones && t.milestones.length > 0) {
        const msSorted = sortMilestones(t.milestones);
        const maxValue = Math.max(...msSorted.map((m) => +m.hours || 0), 0) || 1;
        const maxSec = maxValue * milestoneUnitSec(t);
        const pct = Math.min((getElapsedMs(t) / 1000 / maxSec) * 100, 100);

        const fill = node.querySelector(".progressFill") as HTMLElement | null;
        if (fill) {
          fill.style.width = pct + "%";
          fill.style.background = fillBackgroundForPct(pct);
        }

        const elapsedSec = getElapsedMs(t) / 1000;
        const mkTimes = node.querySelectorAll(".mkTime");

        mkTimes.forEach((mt) => {
          const txt = (mt.textContent || "").trim();
          const v = parseFloat(txt.replace(/[^0-9.]/g, "")) || 0;
          const reached = elapsedSec >= v * milestoneUnitSec(t);
          mt.classList.toggle("mkAch", reached);
          mt.classList.toggle("mkPend", !reached);
        });
      }
    });

    tickRaf = window.requestAnimationFrame(() => {
      tickTimeout = window.setTimeout(tick, 200);
    });
  }

  // Init
  deletedTaskMeta = loadDeletedMeta();
  loadHistoryIntoMemory();
  load();
  wireEvents();
  render();
  tick();

  return { destroy };
}
