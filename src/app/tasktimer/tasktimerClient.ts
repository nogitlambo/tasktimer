/* eslint-disable @typescript-eslint/no-explicit-any */

export type TaskTimerClientHandle = {
  destroy: () => void;
};

export function initTaskTimerClient(): TaskTimerClientHandle {
  // Guard: this must only run in the browser
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { destroy: () => {} };
  }

  // Track listeners so we can remove them on unmount (Next dev Fast Refresh friendly)
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

    // Remove all listeners we registered
    for (const l of listeners) {
      try {
        l.el.removeEventListener(l.type, l.fn, l.opts as any);
      } catch {
        // ignore
      }
    }
  };

  // Everything below is your existing script, moved inside initTaskTimerClient()
  // with small safety changes:
  // - Uses `on(...)` for event binding so we can clean up.
  // - Avoids duplicate function name collisions (escapeHtml is defined twice in your script).
  // - Uses `destroyed` to stop the tick loop.

  const STORAGE_KEY = "taskticker_tasks_v1";
  const DELETED_META_KEY = "tasktimer_deleted_meta_v1";
  const HISTORY_KEY = "taskticker_history_v1";

  let deletedTaskMeta: Record<string, any> = {};
  let tasks: any[] = [];
  let editIndex: number | null = null;

  let confirmAction: null | (() => void) = null;
  let confirmActionAlt: null | (() => void) = null;

  let historyByTaskId: Record<string, any[]> = {};
  let historyTaskId: string | null = null;
  let historyPage = 0;
  let historyEditMode = false;
  let historyBarRects: Array<any> = [];
  let historySelectedAbsIndex: number | null = null;
  let historySelectedRelIndex: number | null = null;

  const els = {
    taskList: document.getElementById("taskList"),
    openAddTaskBtn: document.getElementById("openAddTaskBtn"),
    addTaskOverlay: document.getElementById("addTaskOverlay"),
    addTaskForm: document.getElementById("addTaskForm"),
    addTaskName: document.getElementById("addTaskName") as HTMLInputElement | null,
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
    editH: document.getElementById("editH") as HTMLInputElement | null,
    editM: document.getElementById("editM") as HTMLInputElement | null,
    editS: document.getElementById("editS") as HTMLInputElement | null,
    editOrder: document.getElementById("editOrder") as HTMLInputElement | null,
    msToggle: document.getElementById("msToggle"),
    msArea: document.getElementById("msArea"),
    msList: document.getElementById("msList"),
    addMsBtn: document.getElementById("addMsBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    saveEditBtn: document.getElementById("saveEditBtn"),

    confirmOverlay: document.getElementById("confirmOverlay"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmText: document.getElementById("confirmText"),
    confirmChkRow: document.getElementById("confirmChkRow"),
    confirmDeleteAll: document.getElementById("confirmDeleteAll") as HTMLInputElement | null,
    confirmCancelBtn: document.getElementById("confirmCancelBtn"),
    confirmOkBtn: document.getElementById("confirmOkBtn"),
    confirmAltBtn: document.getElementById("confirmAltBtn"),
    confirmChkLabel: document.getElementById("confirmChkLabel"),

    // Optional elements (present in some builds)
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

  function nowMs() {
    return Date.now();
  }

  function loadDeletedMeta() {
    try {
      deletedTaskMeta = JSON.parse(localStorage.getItem(DELETED_META_KEY) || "{}") || {};
    } catch {
      deletedTaskMeta = {};
    }
  }

  function saveDeletedMeta() {
    try {
      localStorage.setItem(DELETED_META_KEY, JSON.stringify(deletedTaskMeta || {}));
    } catch {
      // ignore
    }
  }

  function cryptoRandomId() {
    try {
      const arr = new Uint32Array(2);
      (globalThis.crypto as Crypto).getRandomValues(arr);
      return arr[0].toString(16) + arr[1].toString(16);
    } catch {
      return Math.random().toString(16).slice(2);
    }
  }

  function makeTask(name: string, order?: number) {
    return {
      id: cryptoRandomId(),
      name,
      order: order || 1,
      accumulatedMs: 0,
      running: false,
      startMs: null as number | null,
      collapsed: false,
      milestonesEnabled: false,
      milestones: [] as Array<{ hours: number; description: string }>,
      hasStarted: false,
    };
  }

  function defaultTasks() {
    return [makeTask("Exercise", 1), makeTask("Study", 2), makeTask("Meditation", 3)];
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        tasks = defaultTasks();
        save();
        return;
      }
      tasks = JSON.parse(raw) || defaultTasks();
      if (!Array.isArray(tasks) || tasks.length === 0) tasks = defaultTasks();
    } catch {
      tasks = defaultTasks();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      historyByTaskId = raw ? JSON.parse(raw) : {};
      if (!historyByTaskId || typeof historyByTaskId !== "object") historyByTaskId = {};
    } catch {
      historyByTaskId = {};
    }
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyByTaskId || {}));
    } catch {
      // ignore
    }
  }

  function cleanupHistory() {
    const cutoff = nowMs() - 120 * 24 * 60 * 60 * 1000;
    let changed = false;

    Object.keys(historyByTaskId || {}).forEach((taskId) => {
      const arr = Array.isArray(historyByTaskId[taskId]) ? historyByTaskId[taskId] : [];
      const next = arr.filter((x) => (x && typeof x.ts === "number" ? x.ts : 0) >= cutoff);
      if (next.length !== arr.length) {
        historyByTaskId[taskId] = next;
        changed = true;
      }
    });

    if (changed) saveHistory();
  }

  function safeJsonParse(str: string) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  function formatTwo(n: number) {
    return n < 10 ? "0" + n : "" + n;
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

  function sortMilestones(msArr: any[]) {
    return (msArr || []).slice().sort((a, b) => (+a.hours || 0) - (+b.hours || 0));
  }

  function normalizeImportedTask(t: any) {
    const out = makeTask(String(t.name || "Task"), 1);
    out.id = String(t.id || cryptoRandomId());
    out.order = Number.isFinite(+t.order) ? +t.order : 1;
    out.accumulatedMs = Number.isFinite(+t.accumulatedMs) ? Math.max(0, +t.accumulatedMs) : 0;
    out.running = false;
    out.startMs = null;
    out.collapsed = !!t.collapsed;
    out.milestonesEnabled = !!t.milestonesEnabled;
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
    saveHistory();
    cleanupHistory();
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

  function getElapsedMs(t: any) {
    if (t.running && t.startMs) {
      return (t.accumulatedMs || 0) + (nowMs() - t.startMs);
    }
    return t.accumulatedMs || 0;
  }

  function getTaskElapsedMs(t: any) {
    if (!t) return 0;
    const runMs = t.running && typeof t.startMs === "number" ? Math.max(0, nowMs() - t.startMs) : 0;
    return Math.max(0, (t.accumulatedMs || 0) + runMs);
  }

  function canLogSession(t: any) {
    if (!t) return false;
    if (!t.hasStarted) return false;
    const ms = getTaskElapsedMs(t);
    return ms > 0;
  }

  function formatTime(ms: number) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const ss = String(s).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function formatDateTime(ts: number) {
    const d = new Date(ts);
    try {
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d.toLocaleString();
    }
  }

  // Escape used in the task list renderer
  function escapeHtmlUI(str: any) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
  }

  function pctToEndColor(pct: number) {
    const p = Math.max(0, Math.min(100, pct || 0));
    const g = { r: 12, g: 245, b: 127 };
    const o = { r: 255, g: 140, b: 0 };
    const rC = { r: 255, g: 59, b: 48 };
    let c1: any, c2: any, tt: number;
    if (p <= 50) {
      c1 = g;
      c2 = o;
      tt = p / 50;
    } else {
      c1 = o;
      c2 = rC;
      tt = (p - 50) / 50;
    }
    const rr = Math.round(lerp(c1.r, c2.r, tt));
    const gg = Math.round(lerp(c1.g, c2.g, tt));
    const bb = Math.round(lerp(c1.b, c2.b, tt));
    return `rgb(${rr},${gg},${bb})`;
  }

  function fillBackgroundForPct(pct: number) {
    return pctToEndColor(pct);
  }

  function sessionColorForTaskMs(t: any, elapsedMs: number) {
    try {
      const ms = Math.max(0, elapsedMs || 0);
      const elapsedSec = ms / 1000;

      const hasMilestones =
        t && t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      if (!hasMilestones) return pctToEndColor(0);

      const msSorted = sortMilestones(t.milestones);
      const maxHours = Math.max(...msSorted.map((m: any) => +m.hours || 0), 0);
      const maxSec = Math.max(maxHours * 3600, 1);
      const pct = Math.min((elapsedSec / maxSec) * 100, 100);
      return fillBackgroundForPct(pct);
    } catch {
      return pctToEndColor(0);
    }
  }

  function appendHistory(taskId: string, entry: any) {
    if (!taskId) return;
    if (!Array.isArray(historyByTaskId[taskId])) historyByTaskId[taskId] = [];
    historyByTaskId[taskId].push(entry);
    saveHistory();
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

  function renderMilestoneEditor(t: any) {
    if (!els.msList) return;
    els.msList.innerHTML = "";

    const ms = sortMilestones(t.milestones || []);

    ms.forEach((m: any, idx: number) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as any).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill">${escapeHtmlUI(String(+m.hours || 0))}h</div>
        <input type="text" value="${escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">✕</button>
      `;

      const pill = row.querySelector(".pill");
      on(pill, "click", () => {
        const val = window.prompt("Milestone hours (number)", String(+m.hours || 0));
        if (val === null) return;
        const hrs = Math.max(0, Number(val));
        if (!Number.isFinite(hrs)) return;
        m.hours = hrs;
        t.milestones = sortMilestones(ms);
        renderMilestoneEditor(t);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      on(desc, "input", (e: any) => {
        m.description = e?.target?.value;
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

  function render() {
    if (!els.taskList) return;

    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    els.taskList.innerHTML = "";

    tasks.forEach((t: any, index: number) => {
      const elapsedMs = getElapsedMs(t);
      const elapsedSec = elapsedMs / 1000;

      const hasMilestones = t.milestonesEnabled && Array.isArray(t.milestones) && t.milestones.length > 0;
      const msSorted = hasMilestones ? sortMilestones(t.milestones) : [];
      const maxHours = hasMilestones ? Math.max(...msSorted.map((m: any) => +m.hours || 0), 0) : 0;
      const maxSec = Math.max(maxHours * 3600, 1);
      const pct = hasMilestones ? Math.min((elapsedSec / maxSec) * 100, 100) : 0;

      const taskEl = document.createElement("div");
      taskEl.className = "task" + (t.collapsed ? " collapsed" : "");
      (taskEl as any).dataset.index = String(index);

      const collapseIcon = t.collapsed ? "►" : "▼";

      let progressHTML = "";
      if (hasMilestones) {
        let markers = "";
        markers += `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch mkEdgeL" style="left:0%">0h</div>`;

        msSorted.forEach((m: any) => {
          const hrs = +m.hours || 0;
          const left = Math.min((hrs / (maxHours || 1)) * 100, 100);
          const reached = elapsedSec >= hrs * 3600;
          const cls = reached ? "mkAch" : "mkPend";
          const label = `${hrs}h`;
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
      `;

      els.taskList!.appendChild(taskEl);
    });

    save();
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

  function getHistoryForTask(taskId: string) {
    const arr = Array.isArray((historyByTaskId as any)?.[taskId]) ? historyByTaskId[taskId] : [];
    return arr.slice().sort((a: any, b: any) => (a.ts || 0) - (b.ts || 0));
  }

  function openHistory(i: number) {
    const t = tasks[i];
    if (!t) return;
    historyTaskId = t.id;
    historyPage = 0;

    if (els.historyTitle) els.historyTitle.textContent = `History: ${t.name}`;
    if (els.historyScreen) {
      (els.historyScreen as HTMLElement).style.display = "block";
      (els.historyScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    renderHistory();
  }

  function closeHistory() {
    if (els.historyScreen) {
      (els.historyScreen as HTMLElement).style.display = "none";
      (els.historyScreen as HTMLElement).setAttribute("aria-hidden", "true");
    }
    historyTaskId = null;
    historyPage = 0;
  }

  function historyPageSize() {
    try {
      return window.matchMedia && window.matchMedia("(min-width: 900px)").matches ? 14 : 7;
    } catch {
      return 7;
    }
  }

  function renderHistoryTrashRow(slice: any[], absStartIndex: number) {
    if (!els.historyTrashRow) return;

    if (!historyEditMode) {
      (els.historyTrashRow as HTMLElement).style.display = "none";
      els.historyTrashRow.innerHTML = "";
      return;
    }

    (els.historyTrashRow as HTMLElement).style.display = "flex";

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

    els.historyTrashRow.innerHTML = buttons.join("");
  }

  function drawHistoryChart(entries: any[], absStartIndex: number) {
    const canvas = els.historyCanvas;
    const wrap = els.historyCanvasWrap as HTMLElement | null;
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
    const slots = 7;
    const gap = Math.max(10, Math.floor(innerW * 0.03));
    const barW = Math.max(22, Math.floor((innerW - gap * (slots - 1)) / slots));

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

      historyBarRects[idx] = { x, y, w: barW, h: bh, absIndex: (absStartIndex || 0) + idx };

      if (historySelectedRelIndex === idx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, barW - 2, bh - 2);
        ctx.restore();
      }

      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(formatTime(ms), x + barW / 2, y - 6);

      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.font = "11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

      const d = new Date(e.ts || 0);
      const dd = formatTwo(d.getDate());
      const mm = formatTwo(d.getMonth() + 1);
      const hh = formatTwo(d.getHours());
      const mi = formatTwo(d.getMinutes());

      ctx.fillText(`${dd}/${mm}`, x + barW / 2, padT + innerH + 22);
      ctx.fillText(`${hh}:${mi}`, x + barW / 2, padT + innerH + 38);
    }
  }

  function renderHistory() {
    if (!historyTaskId) return;

    const all = getHistoryForTask(historyTaskId);
    const total = all.length;
    const pageSize = historyPageSize();

    const end = Math.max(0, total - historyPage * pageSize);
    const start = Math.max(0, end - pageSize);
    const slice = all.slice(start, end);

    const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
    if (historyPage > maxPage) historyPage = maxPage;

    if (els.historyRangeText) {
      if (total === 0) els.historyRangeText.textContent = "No entries yet";
      else els.historyRangeText.textContent = `Showing ${slice.length} of ${total} entries`;
    }

    if (els.historyOlderBtn) els.historyOlderBtn.disabled = start <= 0;
    if (els.historyNewerBtn) els.historyNewerBtn.disabled = end >= total;

    historySelectedAbsIndex = null;
    historySelectedRelIndex = null;
    if (els.historyDeleteBtn) els.historyDeleteBtn.disabled = true;

    drawHistoryChart(slice, start);
    renderHistoryTrashRow(slice, start);

    if (els.historyBest) {
      if (total === 0) {
        els.historyBest.textContent = "";
      } else {
        let best = all[0];
        for (let i = 1; i < all.length; i++) {
          if ((all[i].ms || 0) > (best.ms || 0)) best = all[i];
        }
        els.historyBest.textContent = `All-time best: ${formatTime(best.ms || 0)} on ${formatDateTime(best.ts)}`;
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
    const msg = "Reset all timers?";

    confirm("Reset All", msg, {
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
          saveHistory();
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
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;

    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);
    if (els.editOrder) els.editOrder.value = String(t.order || i + 1);

    els.msToggle?.classList.toggle("on", !!t.milestonesEnabled);
    els.msToggle?.setAttribute("aria-checked", String(!!t.milestonesEnabled));
    els.msArea?.classList.toggle("on", !!t.milestonesEnabled);

    renderMilestoneEditor(t);

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const t = editIndex != null ? tasks[editIndex] : null;

    if (saveChanges && t) {
      t.name = (els.editName?.value || "").trim() || t.name;

      const hh = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
      const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
      const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));

      const newMs = (hh * 3600 + mm * 60 + ss) * 1000;

      t.accumulatedMs = newMs;
      if (t.running) t.startMs = nowMs();
      else t.startMs = null;

      const order = Math.max(1, parseInt(els.editOrder?.value || "1", 10) || 1);
      t.order = order;

      t.milestones = sortMilestones(t.milestones);

      save();
      render();
    }

    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    editIndex = null;
  }

  function escapeRegExp(s: string) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  function newTaskId() {
    const c = globalThis.crypto as Crypto | undefined;
    if (c && "randomUUID" in c) return (c as any).randomUUID();
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
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

    saveHistory();
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
          if (deletedTaskMeta && deletedTaskMeta[t.id]) delete deletedTaskMeta[t.id];
          saveHistory();
          saveDeletedMeta();
        } else {
          deletedTaskMeta = deletedTaskMeta || {};
          deletedTaskMeta[t.id] = { name: t.name, color: t.color || null, deletedAt: nowMs() };
          saveDeletedMeta();
          saveHistory();
        }

        save();
        render();
        closeConfirm();
      },
      onCancel: () => closeConfirm(),
    });
  }

  // History Manager helpers
  function getTaskMetaForHistoryId(taskId: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (t) return { name: t.name, color: t.color, deleted: false };

    const dm = deletedTaskMeta && (deletedTaskMeta as any)[taskId];
    if (dm) return { name: dm.name || "Deleted Task", color: dm.color || null, deleted: true };

    const arr = historyByTaskId && historyByTaskId[taskId];
    if (arr && arr.length) {
      const e = arr[arr.length - 1];
      return { name: e.name || "Deleted Task", color: e.color || null, deleted: true };
    }

    return { name: "Deleted Task", color: null, deleted: true };
  }

  // Escape used inside History Manager table HTML (your original second escapeHtml)
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

  // Event delegation and wiring
  function wireEvents() {
    // Add Task modal
    const openAddTaskModal = () => {
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
    };

    on(els.openAddTaskBtn, "click", openAddTaskModal);
    on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    on(els.addTaskOverlay, "click", (e: any) => {
      if (e.target === els.addTaskOverlay) closeAddTaskModal();
    });

    on(els.addTaskForm, "submit", (e: any) => {
      e.preventDefault();
      const name = (els.addTaskName?.value || "").trim();
      if (!name) return;
      const nextOrder = (tasks.reduce((mx, t) => Math.max(mx, t.order || 0), 0) || 0) + 1;
      tasks.push(makeTask(name, nextOrder));
      closeAddTaskModal();
      save();
      render();
    });

    // Task list delegation
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

    // History screen events
    on(els.historyBackBtn, "click", closeHistory);

    on(els.historyEditBtn, "click", () => {
      historyEditMode = !historyEditMode;
      els.historyEditBtn?.classList.toggle("isOn", historyEditMode);
      renderHistory();
    });

    on(els.historyOlderBtn, "click", () => {
      historyPage += 1;
      renderHistory();
    });

    on(els.historyNewerBtn, "click", () => {
      historyPage = Math.max(0, historyPage - 1);
      renderHistory();
    });

    on(els.historyDeleteBtn, "click", () => {
      if (historySelectedAbsIndex == null || !historyTaskId) return;
      const all = getHistoryForTask(historyTaskId);
      const e = all[historySelectedAbsIndex];
      if (!e) return;

      confirm("Delete Log Entry", `Delete this entry (${formatTime(e.ms || 0)})?`, {
        okLabel: "Delete",
        onOk: () => {
          const all2 = getHistoryForTask(historyTaskId);
          if (historySelectedAbsIndex! >= 0 && historySelectedAbsIndex! < all2.length) {
            all2.splice(historySelectedAbsIndex!, 1);
            historyByTaskId[historyTaskId] = all2;
            saveHistory();

            const maxPage = Math.max(0, Math.ceil(all2.length / historyPageSize()) - 1);
            historyPage = Math.min(historyPage, maxPage);
            renderHistory();
          }
          closeConfirm();
        },
      });
    });

    // Tap a bar to select it for deletion
    on(els.historyCanvas, "click", (ev: any) => {
      if (!els.historyCanvas) return;

      const rect = els.historyCanvas.getBoundingClientRect();
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
        if (els.historyDeleteBtn) els.historyDeleteBtn.disabled = false;
      } else {
        historySelectedRelIndex = null;
        historySelectedAbsIndex = null;
        if (els.historyDeleteBtn) els.historyDeleteBtn.disabled = true;
      }

      renderHistory();
    });

    // Swipe left/right on chart area for paging
    let touchStartX: number | null = null;
    let touchStartY: number | null = null;
    const wrap = els.historyCanvasWrap as HTMLElement | null;

    on(
      wrap,
      "touchstart",
      (e: any) => {
        if (!e.touches || !e.touches.length) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    on(
      wrap,
      "touchend",
      (e: any) => {
        if (touchStartX === null || touchStartY === null) return;
        const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
        if (!t) return;

        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;

        touchStartX = null;
        touchStartY = null;

        if (Math.abs(dx) < 40) return;
        if (Math.abs(dy) > 60) return;

        if (dx < 0) {
          if (!els.historyOlderBtn?.disabled) {
            historyPage += 1;
            renderHistory();
          }
        } else {
          if (!els.historyNewerBtn?.disabled) {
            historyPage = Math.max(0, historyPage - 1);
            renderHistory();
          }
        }
      },
      { passive: true }
    );

    on(window, "resize", () => {
      if ((els.historyScreen as HTMLElement | null)?.style.display === "block") renderHistory();
    });

    // Menu
    on(els.menuIcon, "click", () => openOverlay(els.menuOverlay as HTMLElement | null));
    on(els.closeMenuBtn, "click", () => closeOverlay(els.menuOverlay as HTMLElement | null));

    document.querySelectorAll(".menuItem").forEach((btn) => {
      on(btn, "click", () => openPopup((btn as HTMLElement).dataset.menu || ""));
    });

    // Backup export/import
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

    // Edit modal
    on(els.cancelEditBtn, "click", () => closeEdit(false));
    on(els.saveEditBtn, "click", () => closeEdit(true));

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

    on(els.addMsBtn, "click", () => {
      if (editIndex == null) return;
      const t = tasks[editIndex];
      if (!t) return;

      t.milestones = t.milestones || [];
      t.milestones.push({ hours: 24, description: "" });
      t.milestones = sortMilestones(t.milestones);
      renderMilestoneEditor(t);
    });

    // Confirm modal
    on(els.confirmCancelBtn, "click", closeConfirm);
    on(els.confirmAltBtn, "click", () => {
      if (typeof confirmActionAlt === "function") confirmActionAlt();
    });
    on(els.confirmOkBtn, "click", () => {
      if (typeof confirmAction === "function") confirmAction();
      else closeConfirm();
    });

    // History Manager events
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
          loadHistory();
          const orig = historyByTaskId[taskId] || [];
          const pos = orig.findIndex(
            (e: any) => e.ts === ts && e.ms === ms && String(e.name || "") === String(name || "")
          );
          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            saveHistory();

            if (orig.length === 0 && deletedTaskMeta && (deletedTaskMeta as any)[taskId]) {
              delete (deletedTaskMeta as any)[taskId];
              saveDeletedMeta();
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
        const maxHours = Math.max(...msSorted.map((m: any) => +m.hours || 0), 0) || 1;
        const maxSec = maxHours * 3600;
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
          const hrs = parseFloat(txt.replace("h", "")) || 0;
          const reached = elapsedSec >= hrs * 3600;
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
  loadDeletedMeta();
  loadHistory();
  cleanupHistory();
  load();
  wireEvents();
  render();
  tick();

  return { destroy };
}