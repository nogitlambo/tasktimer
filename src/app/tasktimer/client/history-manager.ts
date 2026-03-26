/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HistoryByTaskId, Task } from "../lib/types";
import { escapeHistoryManagerHtml as escapeHtmlHM } from "../lib/historyManager";
import type { TaskTimerHistoryManagerContext } from "./context";

type HistoryGenParams = {
  taskIds: string[];
  daysBack: number;
  entriesPerDayMin: number;
  entriesPerDayMax: number;
  windowStartMinute: number;
  windowEndMinute: number;
  replaceExisting: boolean;
};

type HistoryGenPreview = {
  params: HistoryGenParams;
  perTaskCount: Record<string, number>;
  totalGenerated: number;
  nextHistory: HistoryByTaskId;
};

function formatHistoryManagerElapsed(msRaw: unknown, formatTwo: (value: number) => string) {
  const totalSeconds = Math.max(0, Math.floor(Math.max(0, Number(msRaw) || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${formatTwo(days)}d ${formatTwo(hours)}h ${formatTwo(minutes)}m ${formatTwo(seconds)}s`;
}

export function createTaskTimerHistoryManager(ctx: TaskTimerHistoryManagerContext) {
  const { els } = ctx;

  function getTaskMetaForHistoryId(taskId: string) {
    const tasks = ctx.getTasks();
    const historyByTaskId = ctx.getHistoryByTaskId();
    const deletedTaskMeta = ctx.getDeletedTaskMeta();
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

  function exportHistoryManagerCsv() {
    const historyByTaskId = ctx.getHistoryByTaskId();
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
      const nextHistory: HistoryByTaskId = { ...(ctx.getHistoryByTaskId() || {}) };
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

  function parseHistoryGenTimeToMinute(value: string): number | null {
    const raw = String(value || "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatHistoryGenMinute(minute: number): string {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minute || 0)));
    const hh = Math.floor(clamped / 60);
    const mm = clamped % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
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
      entriesPerDayMin <= 0 ||
      entriesPerDayMax <= 0
    ) {
      alert("Entries per day must be positive numbers.");
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
      replaceExisting: !!els.confirmDeleteAll?.checked,
    };
  }

  function buildHistoryManagerTestDataPreview(params: HistoryGenParams): HistoryGenPreview {
    const historyByTaskId = ctx.getHistoryByTaskId();
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

    const unitToMinute = (task: Task) => {
      if (task.milestoneTimeUnit === "day") return 24 * 60;
      if (task.milestoneTimeUnit === "minute") return 1;
      return 60;
    };
    const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
    const now = new Date();
    const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let totalGenerated = 0;

    for (let dayOffset = params.daysBack - 1; dayOffset >= 0; dayOffset -= 1) {
      const day = new Date(todayLocal);
      day.setDate(todayLocal.getDate() - dayOffset);

      selectedTasks.forEach((task) => {
        const taskId = String(task.id || "").trim();
        if (!taskId) return;
        const taskIdx = taskOrderById.get(taskId) || 0;
        const sessions = randInt(params.entriesPerDayMin, params.entriesPerDayMax);
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
    };
  }

  async function applyHistoryManagerTestData(preview: HistoryGenPreview): Promise<void> {
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
        return `<li><b>${ctx.escapeHtmlUI(taskName)}</b>: ${count}</li>`;
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
      checkboxLabel: "Replace existing history",
      checkboxChecked: true,
      textHtml: `
        <div class="hmGenConfirm">
          <div style="margin:0 0 8px;"><b>Select tasks</b></div>
          <div id="historyGenTaskList" style="max-height:180px; overflow:auto; border:1px solid var(--line, rgba(255,255,255,.14)); border-radius:10px; padding:8px;">
            ${taskOptions}
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Days back</span>
              <input id="historyGenDaysBack" type="number" min="1" max="3650" value="90" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Entries/day min</span>
              <input id="historyGenEntriesMin" type="number" min="1" max="1000" value="1" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Entries/day max</span>
              <input id="historyGenEntriesMax" type="number" min="1" max="1000" value="3" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>Start time</span>
              <input id="historyGenStartTime" type="time" value="06:00" />
            </label>
            <label style="display:flex; flex-direction:column; gap:4px;">
              <span>End time</span>
              <input id="historyGenEndTime" type="time" value="20:00" />
            </label>
          </div>
        </div>
      `,
      onOk: () => {
        const params = readHistoryManagerGenerateParamsFromConfirm();
        if (!params) return;
        const preview = buildHistoryManagerTestDataPreview(params);
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
    let hmExpandedTaskGroups = ctx.getHmExpandedTaskGroups();
    let hmExpandedDateGroups = ctx.getHmExpandedDateGroups();
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = ctx.isArchitectUser() ? "" : "none";
    }
    const listEl = document.getElementById("hmList");
    if (!listEl) return;
    if (listEl.children.length) {
      const nextTaskGroups = new Set<string>();
      const nextDateGroups = new Set<string>();
      listEl.querySelectorAll(".hmGroup[data-task]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        if (taskId && (el as HTMLDetailsElement).open) nextTaskGroups.add(taskId);
      });
      listEl.querySelectorAll(".hmDateGroup[data-task][data-date]").forEach((el) => {
        const taskId = (el as HTMLElement).getAttribute("data-task");
        const dateKey = (el as HTMLElement).getAttribute("data-date");
        if (taskId && dateKey && (el as HTMLDetailsElement).open) nextDateGroups.add(`${taskId}|${dateKey}`);
      });
      hmExpandedTaskGroups = nextTaskGroups;
      hmExpandedDateGroups = nextDateGroups;
      ctx.setHmExpandedTaskGroups(nextTaskGroups);
      ctx.setHmExpandedDateGroups(nextDateGroups);
    }
    const hmRowsByTask: Record<string, string[]> = {};
    const hmRowsByTaskDate: Record<string, string[]> = {};
    ctx.setHmRowsByTask(hmRowsByTask);
    ctx.setHmRowsByTaskDate(hmRowsByTaskDate);
    const taskIdFilter = (() => {
      try {
        const p = new URLSearchParams(window.location.search);
        const raw = (p.get("taskId") || "").trim();
        return raw || null;
      } catch {
        return null;
      }
    })();

    const historyByTaskId = ctx.getHistoryByTaskId();
    let hb: Record<string, any[]> = (historyByTaskId as Record<string, any[]>) || {};
    if (!hb || typeof hb !== "object") hb = {};

    const idsWithHistory = Object.keys(hb || {}).filter((id) => {
      const arr = hb[id];
      return Array.isArray(arr) && arr.length;
    });
    const filteredIds = taskIdFilter ? idsWithHistory.filter((id) => String(id) === String(taskIdFilter)) : idsWithHistory;

    if (!filteredIds.length) {
      listEl.innerHTML = taskIdFilter
        ? `<div class="hmEmpty">No history entries found for this task.</div>`
        : `<div class="hmEmpty">No history entries found.</div>`;
      return;
    }

    const tasks = ctx.getTasks();
    const currentOrder = new Map((tasks || []).map((t, index) => [String(t.id), index] as const));
    filteredIds.sort((a, b) => {
      const ai = currentOrder.get(String(a));
      const bi = currentOrder.get(String(b));
      const aIsCurrent = ai != null;
      const bIsCurrent = bi != null;
      if (aIsCurrent && bIsCurrent) return ai - bi;
      if (aIsCurrent) return -1;
      if (bIsCurrent) return 1;
      const ar = hb[a][hb[a].length - 1]?.ts || 0;
      const br = hb[b][hb[b].length - 1]?.ts || 0;
      return br - ar;
    });

    const groups = filteredIds
      .map((taskId) => {
        const meta = getTaskMetaForHistoryId(taskId);
        const arr = (hb[taskId] || []).slice().sort((x: any, y: any) => (y.ts || 0) - (x.ts || 0));
        const localDateKey = (ts: number) => {
          const d = new Date(ts);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const da = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${da}`;
        };
        const localDateLabel = (key: string) => {
          const [y, m, d] = key.split("-").map((x) => parseInt(x, 10));
          const dt = new Date(y, (m || 1) - 1, d || 1);
          try {
            return dt.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
          } catch {
            return key;
          }
        };

        const rowsByDate: Record<string, any[]> = {};
        arr.forEach((e: any) => {
          const key = localDateKey(+e.ts || 0);
          if (!rowsByDate[key]) rowsByDate[key] = [];
          rowsByDate[key].push(e);
        });

        const dateGroupsHtml = Object.keys(rowsByDate)
          .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
          .map((dateKey) => {
            const entries = (rowsByDate[dateKey] || []).slice().sort((a: any, b: any) => {
              const av = hmSortKey === "ms" ? +a.ms || 0 : +a.ts || 0;
              const bv = hmSortKey === "ms" ? +b.ms || 0 : +b.ts || 0;
              return hmSortDir === "asc" ? av - bv : bv - av;
            });
            const rowIds = entries.map((e: any) => `${taskId}|${e.ts}|${e.ms}|${String(e.name || "")}`);
            hmRowsByTaskDate[`${taskId}|${dateKey}`] = rowIds;
            if (!hmRowsByTask[taskId]) hmRowsByTask[taskId] = [];
            hmRowsByTask[taskId].push(...rowIds);
            const dateChecked = rowIds.length > 0 && rowIds.every((id) => hmBulkSelectedRows.has(id));
            const rows = entries
              .map((e: any) => {
                const dt = ctx.formatDateTime(e.ts);
                const tm = formatHistoryManagerElapsed(e.ms || 0, ctx.formatTwo);
                const rowKey = `${e.ts}|${e.ms}|${String(e.name || "")}`;
                const rowId = `${taskId}|${rowKey}`;
                const rowCheckbox = hmBulkEditMode
                  ? `<input class="hmBulkCheckbox hmBulkRowChk" type="checkbox" data-task="${taskId}" data-key="${escapeHtmlHM(
                      rowKey
                    )}" ${hmBulkSelectedRows.has(rowId) ? "checked" : ""} />`
                  : "";
                return `
                  <tr>
                    <td class="hmSelectCell">${rowCheckbox}</td>
                    <td>${dt}</td>
                    <td>${tm}</td>
                    <td style="text-align:right;">
                      <button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(
                  rowKey
                )}" aria-label="Delete log" title="Delete log">&#128465;</button>
                    </td>
                  </tr>
                `;
              })
              .join("");
            const dateOpen = hmExpandedDateGroups.has(`${taskId}|${dateKey}`) ? " open" : "";
            const dateSortArrow = hmSortKey === "ts" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const elapsedSortArrow = hmSortKey === "ms" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
            const dateCheckbox = hmBulkEditMode
              ? `<input class="hmBulkCheckbox hmBulkDateChk" type="checkbox" data-task="${taskId}" data-date="${dateKey}" ${
                  dateChecked ? "checked" : ""
                } />`
              : "";
            return `
              <details class="hmDateGroup" data-task="${taskId}" data-date="${dateKey}"${dateOpen}>
                <summary class="hmDateHeading">${dateCheckbox}${escapeHtmlHM(localDateLabel(dateKey))}</summary>
                <table class="hmTable" role="table">
                  <thead>
                    <tr>
                      <th class="hmSelectHead"></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ts">Date/Time${dateSortArrow}</button></th>
                      <th><button class="hmSortBtn" type="button" data-hm-sort="ms">Elapsed${elapsedSortArrow}</button></th>
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

        const swatch = `<span class="hmExpandIcon" aria-hidden="true"></span>`;
        const badge = meta.deleted ? `<span class="hmBadge deleted">Deleted</span>` : ``;
        const taskRows = hmRowsByTask[taskId] || [];
        const taskChecked = taskRows.length > 0 && taskRows.every((id) => hmBulkSelectedRows.has(id));
        const taskCheckbox = hmBulkEditMode
          ? `<input class="hmBulkCheckbox hmBulkTaskChk" type="checkbox" data-task="${taskId}" ${
              taskChecked ? "checked" : ""
            } />`
          : "";

        const taskOpen = hmExpandedTaskGroups.has(String(taskId)) ? " open" : "";
        return `
          <details class="hmGroup" data-task="${taskId}"${taskOpen}>
            <summary class="hmSummary">
              <div class="hmTitleRow">
                ${taskCheckbox}
                ${swatch}
                <div class="hmTaskName">${escapeHtmlHM(meta.name || "Task")}</div>
                ${badge}
              </div>
              <div class="hmCount">${arr.length} logs</div>
            </summary>

            ${dateGroupsHtml}
          </details>
        `;
      })
      .join("");

    listEl.innerHTML = groups;
    const validRowIds = new Set<string>();
    Object.values(hmRowsByTask).forEach((ids) => ids.forEach((id) => validRowIds.add(id)));
    hmBulkSelectedRows.forEach((id) => {
      if (!validRowIds.has(id)) hmBulkSelectedRows.delete(id);
    });
    syncHistoryManagerBulkUi();
  }

  function openHistoryManager() {
    if (els.historyManagerGenerateBtn) {
      els.historyManagerGenerateBtn.style.display = ctx.isArchitectUser() ? "" : "none";
    }
    if (els.historyManagerScreen) {
      (els.historyManagerScreen as HTMLElement).style.display = "block";
      (els.historyManagerScreen as HTMLElement).setAttribute("aria-hidden", "false");
    }
    renderHistoryManager();
    void refreshHistoryManagerFromCloud().then(() => {
      if (ctx.runtime.destroyed || !isHistoryManagerOpen()) return;
      renderHistoryManager();
    });
  }

  function getHistoryManagerReturnRoute() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const explicit = String(params.get("returnTo") || "").trim();
      if (explicit === "tasks") return "/tasktimer";
      if (explicit === "settings") return "/tasktimer/settings";
      const taskId = String(params.get("taskId") || "").trim();
      return taskId ? "/tasktimer" : "/tasktimer/settings";
    } catch {
      return "/tasktimer/settings";
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
    syncHistoryManagerBulkUi();
  }

  function registerHistoryManagerEvents() {
    ctx.on(els.historyManagerBtn, "click", () => {
      ctx.navigateToAppRoute("/tasktimer/history-manager");
    });
    ctx.on(els.historyManagerExportBtn, "click", () => {
      exportHistoryManagerCsv();
    });
    ctx.on(els.historyManagerImportBtn, "click", () => {
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
      const byTask: Record<string, Set<string>> = {};
      selected.forEach((id) => {
        const firstSep = id.indexOf("|");
        if (firstSep <= 0) return;
        const taskId = id.slice(0, firstSep);
        const rowKey = id.slice(firstSep + 1);
        if (!byTask[taskId]) byTask[taskId] = new Set<string>();
        byTask[taskId].add(rowKey);
      });
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

      const btn = ev.target?.closest?.(".hmDelBtn");
      if (!btn) return;

      const taskId = btn.getAttribute("data-task");
      const key = btn.getAttribute("data-key");
      if (!taskId || !key) return;

      const parts = key.split("|");
      const ts = parseInt(parts[0], 10);
      const ms = parseInt(parts[1], 10);
      const name = parts.slice(2).join("|");

      ctx.confirm("Delete Log Entry", "Delete this entry?", {
        okLabel: "Delete",
        cancelLabel: "Cancel",
        onOk: () => {
          const historyByTaskId = ctx.loadHistory();
          const orig = historyByTaskId[taskId] || [];
          const pos = orig.findIndex(
            (e: any) => e.ts === ts && e.ms === ms && String(e.name || "") === String(name || "")
          );

          if (pos !== -1) {
            orig.splice(pos, 1);
            historyByTaskId[taskId] = orig;
            ctx.setHistoryByTaskId(historyByTaskId);
            ctx.saveHistory(historyByTaskId);
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
    getHistoryManagerReturnRoute,
    isHistoryManagerOpen,
    refreshHistoryManagerFromCloud,
    closeHistoryManager,
    registerHistoryManagerEvents,
  };
}
