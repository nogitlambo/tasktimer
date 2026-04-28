/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task } from "../lib/types";
import { completionDifficultyLabel } from "../lib/completionDifficulty";
import { escapeHistoryManagerHtml as escapeHtmlHM } from "../lib/historyManager";
import {
  buildHistoryManagerRowKey,
  formatHistoryManagerElapsed,
} from "./history-manager-shared";

type HistoryManagerSortKey = "ts" | "ms";
type HistoryManagerSortDir = "asc" | "desc";

type RenderArgs = {
  existingListEl: HTMLElement;
  historyByTaskId: Record<string, any[]>;
  tasks: Task[];
  taskIdFilter: string | null;
  hmBulkSelectedRows: Set<string>;
  hmBulkEditMode: boolean;
  hmSortKey: HistoryManagerSortKey;
  hmSortDir: HistoryManagerSortDir;
  hmExpandedTaskGroups: Set<string>;
  hmExpandedDateGroups: Set<string>;
  formatTwo: (value: number) => string;
  formatDateTime: (value: number) => string;
  getTaskMetaForHistoryId: (taskId: string) => { name: string; color?: string | null; deleted?: boolean };
  getHistoryEntryNote: (entry: unknown) => string;
  canUseManualEntry: boolean;
  flashedRowId?: string | null;
};

type HistoryManagerRenderResult = {
  html: string;
  rowIdsByTask: Record<string, string[]>;
  rowIdsByTaskDate: Record<string, string[]>;
  validRowIds: Set<string>;
  expandedTaskGroups: Set<string>;
  expandedDateGroups: Set<string>;
  isEmpty: boolean;
  emptyHtml: string;
};

function getLocalDateKey(ts: number) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDateLabel(key: string) {
  const [year, month, day] = key.split("-").map((value) => parseInt(value, 10));
  const date = new Date(year, (month || 1) - 1, day || 1);
  try {
    return date.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return key;
  }
}

function captureExpandedGroups(listEl: HTMLElement) {
  const taskGroups = new Set<string>();
  const dateGroups = new Set<string>();
  if (!listEl.children.length) {
    return { taskGroups, dateGroups };
  }
  listEl.querySelectorAll(".hmGroup[data-task]").forEach((el) => {
    const taskId = (el as HTMLElement).getAttribute("data-task");
    if (taskId && (el as HTMLDetailsElement).open) taskGroups.add(taskId);
  });
  listEl.querySelectorAll(".hmDateGroup[data-task][data-date]").forEach((el) => {
    const taskId = (el as HTMLElement).getAttribute("data-task");
    const dateKey = (el as HTMLElement).getAttribute("data-date");
    if (taskId && dateKey && (el as HTMLDetailsElement).open) dateGroups.add(`${taskId}|${dateKey}`);
  });
  return { taskGroups, dateGroups };
}

export function resolveHistoryManagerTaskIdFilter(search: string) {
  try {
    const params = new URLSearchParams(search || "");
    const raw = String(params.get("taskId") || "").trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function renderHistoryManagerHtml(args: RenderArgs): HistoryManagerRenderResult {
  const {
    existingListEl,
    historyByTaskId,
    tasks,
    taskIdFilter,
    hmBulkSelectedRows,
    hmBulkEditMode,
    hmSortKey,
    hmSortDir,
    hmExpandedTaskGroups,
    hmExpandedDateGroups,
    formatTwo,
    formatDateTime,
    getTaskMetaForHistoryId,
    getHistoryEntryNote,
    canUseManualEntry,
    flashedRowId = null,
  } = args;
  const capturedExpanded = captureExpandedGroups(existingListEl);
  const expanded = {
    taskGroups: new Set<string>([...capturedExpanded.taskGroups, ...hmExpandedTaskGroups]),
    dateGroups: new Set<string>([...capturedExpanded.dateGroups, ...hmExpandedDateGroups]),
  };
  const rowIdsByTask: Record<string, string[]> = {};
  const rowIdsByTaskDate: Record<string, string[]> = {};
  const validRowIds = new Set<string>();
  const idsWithHistory = Object.keys(historyByTaskId || {}).filter((id) => {
    const entries = historyByTaskId[id];
    return Array.isArray(entries) && entries.length;
  });
  const filteredIds = taskIdFilter ? idsWithHistory.filter((id) => String(id) === String(taskIdFilter)) : idsWithHistory;

  if (!filteredIds.length) {
    return {
      html: "",
      rowIdsByTask,
      rowIdsByTaskDate,
      validRowIds,
      expandedTaskGroups: expanded.taskGroups,
      expandedDateGroups: expanded.dateGroups,
      isEmpty: true,
      emptyHtml: taskIdFilter
        ? '<div class="hmEmpty">No history entries found for this task.</div>'
        : '<div class="hmEmpty">No history entries found.</div>',
    };
  }

  const currentOrder = new Map((tasks || []).map((task, index) => [String(task.id), index] as const));
  filteredIds.sort((a, b) => {
    const leftOrder = currentOrder.get(String(a));
    const rightOrder = currentOrder.get(String(b));
    const leftCurrent = leftOrder != null;
    const rightCurrent = rightOrder != null;
    if (leftCurrent && rightCurrent) return leftOrder - rightOrder;
    if (leftCurrent) return -1;
    if (rightCurrent) return 1;
    const leftRecent = historyByTaskId[a][historyByTaskId[a].length - 1]?.ts || 0;
    const rightRecent = historyByTaskId[b][historyByTaskId[b].length - 1]?.ts || 0;
    return rightRecent - leftRecent;
  });

  const html = filteredIds
    .map((taskId) => {
      const meta = getTaskMetaForHistoryId(taskId);
      const entriesByTask = (historyByTaskId[taskId] || []).slice().sort((left: any, right: any) => (right.ts || 0) - (left.ts || 0));
      const rowsByDate: Record<string, any[]> = {};
      entriesByTask.forEach((entry: any) => {
        const key = getLocalDateKey(+entry.ts || 0);
        if (!rowsByDate[key]) rowsByDate[key] = [];
        rowsByDate[key].push(entry);
      });

      const dateGroupsHtml = Object.keys(rowsByDate)
        .sort((left, right) => (left < right ? 1 : left > right ? -1 : 0))
        .map((dateKey) => {
          const entries = (rowsByDate[dateKey] || []).slice().sort((left: any, right: any) => {
            const leftValue = hmSortKey === "ms" ? +left.ms || 0 : +left.ts || 0;
            const rightValue = hmSortKey === "ms" ? +right.ms || 0 : +right.ts || 0;
            return hmSortDir === "asc" ? leftValue - rightValue : rightValue - leftValue;
          });
          const rowIds = entries.map((entry: any) => `${taskId}|${buildHistoryManagerRowKey(entry)}`);
          rowIdsByTaskDate[`${taskId}|${dateKey}`] = rowIds;
          if (!rowIdsByTask[taskId]) rowIdsByTask[taskId] = [];
          rowIdsByTask[taskId].push(...rowIds);
          rowIds.forEach((rowId) => validRowIds.add(rowId));
          const dateChecked = rowIds.length > 0 && rowIds.every((id) => hmBulkSelectedRows.has(id));
          const rows = entries
            .map((entry: any) => {
              const rowKey = buildHistoryManagerRowKey(entry);
              const rowId = `${taskId}|${rowKey}`;
              const note = getHistoryEntryNote(entry);
              const sentimentLabel = completionDifficultyLabel(entry?.completionDifficulty) || "-";
              const isLiveSession = !!entry?.isLiveSession;
              const noteCell = note
                ? `<button class="hmNoteBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" title="${escapeHtmlHM(note)}"><span class="hmNoteBtnText">${escapeHtmlHM(note)}</span></button>`
                : '<span class="hmNoteEmpty">-</span>';
              const rowCheckbox = hmBulkEditMode && !isLiveSession
                ? `<input class="hmBulkCheckbox hmBulkRowChk" type="checkbox" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" ${hmBulkSelectedRows.has(rowId) ? "checked" : ""} />`
                : "";
              const dateTimeCell = isLiveSession ? `${formatDateTime(entry.ts)} (Live)` : formatDateTime(entry.ts);
              const deleteCell = isLiveSession
                ? '<span class="hmNoteEmpty">-</span>'
                : `<button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" aria-label="Delete log" title="Delete log">&#128465;</button>`;
              const flashAttr = flashedRowId === rowId ? ' class="hmRowFlash" data-hm-row-flash="true"' : "";
              return `
                <tr data-hm-row-id="${escapeHtmlHM(rowId)}"${flashAttr}>
                  <td class="hmSelectCell">${rowCheckbox}</td>
                  <td>${dateTimeCell}</td>
                  <td>${formatHistoryManagerElapsed(entry.ms || 0, formatTwo)}</td>
                  <td class="hmSentimentCell">${escapeHtmlHM(sentimentLabel)}</td>
                  <td class="hmNotesCell">${noteCell}</td>
                  <td style="text-align:right;">${deleteCell}</td>
                </tr>
              `;
            })
            .join("");
          const dateSortArrow = hmSortKey === "ts" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
          const elapsedSortArrow = hmSortKey === "ms" ? (hmSortDir === "asc" ? " ▲" : " ▼") : "";
          const dateCheckbox = hmBulkEditMode
            ? `<input class="hmBulkCheckbox hmBulkDateChk" type="checkbox" data-task="${taskId}" data-date="${dateKey}" ${dateChecked ? "checked" : ""} />`
            : "";
          const isOpen = expanded.dateGroups.has(`${taskId}|${dateKey}`) ? " open" : "";
          return `
            <details class="hmDateGroup" data-task="${taskId}" data-date="${dateKey}"${isOpen}>
              <summary class="hmDateHeading">${dateCheckbox}${escapeHtmlHM(getLocalDateLabel(dateKey))}</summary>
              <table class="hmTable" role="table">
                <thead>
                  <tr>
                    <th class="hmSelectHead"></th>
                    <th><button class="hmSortBtn" type="button" data-hm-sort="ts">DATE/TIME${dateSortArrow}</button></th>
                    <th><button class="hmSortBtn" type="button" data-hm-sort="ms">ELAPSED${elapsedSortArrow}</button></th>
                    <th class="hmSentimentHead">SENTIMENT</th>
                    <th class="hmNotesHead">NOTES</th>
                    <th style="text-align:right;">DELETE</th>
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

      const taskRows = rowIdsByTask[taskId] || [];
      const taskChecked = taskRows.length > 0 && taskRows.every((id) => hmBulkSelectedRows.has(id));
      const taskCheckbox = hmBulkEditMode
        ? `<input class="hmBulkCheckbox hmBulkTaskChk" type="checkbox" data-task="${taskId}" ${taskChecked ? "checked" : ""} />`
        : "";
      const badge = meta.deleted ? '<span class="hmBadge deleted">Deleted</span>' : "";
      const taskActions = !meta.deleted && canUseManualEntry
        ? `
            <button class="iconBtn hmAddBtn" type="button" data-task="${taskId}" aria-label="Add manual history entry" title="Add manual history entry">+</button>
          `
        : "";
      const isOpen = expanded.taskGroups.has(String(taskId)) ? " open" : "";
      return `
        <details class="hmGroup" data-task="${taskId}"${isOpen}>
          <summary class="hmSummary">
            <div class="hmTitleRow">
              ${taskCheckbox}
              <span class="hmExpandIcon" aria-hidden="true"></span>
              <div class="hmTaskName">${escapeHtmlHM(meta.name || "Task")}</div>
              ${badge}
            </div>
            <div class="hmSummaryMeta">
              <div class="hmCount">${entriesByTask.length} logs</div>
              ${taskActions}
            </div>
          </summary>
          ${dateGroupsHtml}
        </details>
      `;
    })
    .join("");

  return {
    html,
    rowIdsByTask,
    rowIdsByTaskDate,
    validRowIds,
    expandedTaskGroups: expanded.taskGroups,
    expandedDateGroups: expanded.dateGroups,
    isEmpty: false,
    emptyHtml: "",
  };
}
