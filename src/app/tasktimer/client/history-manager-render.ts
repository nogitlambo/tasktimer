/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Task } from "../lib/types";
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
  formatTwo: (value: number) => string;
  formatDateTime: (value: number) => string;
  getTaskMetaForHistoryId: (taskId: string) => {
    name: string;
    color?: string | null;
    deleted?: boolean;
    state: "active" | "archived" | "deleted";
  };
  getHistoryEntryNote: (entry: unknown) => string;
};

type HistoryManagerRenderResult = {
  html: string;
  rowIdsByTask: Record<string, string[]>;
  validRowIds: Set<string>;
  expandedTaskGroups: Set<string>;
  isEmpty: boolean;
  emptyHtml: string;
};

function captureExpandedGroups(listEl: HTMLElement) {
  const taskGroups = new Set<string>();
  if (!listEl.children.length) {
    return { taskGroups };
  }
  listEl.querySelectorAll(".hmGroup[data-task]").forEach((el) => {
    const taskId = (el as HTMLElement).getAttribute("data-task");
    if (taskId && (el as HTMLDetailsElement).open) taskGroups.add(taskId);
  });
  return { taskGroups };
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
    formatTwo,
    formatDateTime,
    getTaskMetaForHistoryId,
    getHistoryEntryNote,
  } = args;
  const capturedExpanded = captureExpandedGroups(existingListEl);
  const expanded = {
    taskGroups: new Set<string>([...capturedExpanded.taskGroups, ...hmExpandedTaskGroups]),
  };
  const rowIdsByTask: Record<string, string[]> = {};
  const validRowIds = new Set<string>();
  const idsWithHistory = Object.keys(historyByTaskId || {}).filter((id) => {
    const entries = historyByTaskId[id];
    return Array.isArray(entries) && entries.length;
  });
  const filteredIds = taskIdFilter
    ? idsWithHistory.filter((id) => String(id) === String(taskIdFilter))
    : idsWithHistory.filter((id) => {
        const state = getTaskMetaForHistoryId(id).state;
        return state === "active" || state === "archived";
      });

  if (!filteredIds.length) {
    return {
      html: "",
      rowIdsByTask,
      validRowIds,
      expandedTaskGroups: expanded.taskGroups,
      isEmpty: true,
      emptyHtml: taskIdFilter
        ? '<div class="hmEmpty">No history entries found for this task.</div>'
        : '<div class="hmEmpty">No task history entries found.</div>',
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

  const renderTaskGroupHtml = (taskId: string) => {
    const meta = getTaskMetaForHistoryId(taskId);
    const entriesByTask = (historyByTaskId[taskId] || []).slice().sort((left: any, right: any) => {
      const leftValue = hmSortKey === "ms" ? +left.ms || 0 : +left.ts || 0;
      const rightValue = hmSortKey === "ms" ? +right.ms || 0 : +right.ts || 0;
      return hmSortDir === "asc" ? leftValue - rightValue : rightValue - leftValue;
    });
    const rowIds = entriesByTask.map((entry: any) => `${taskId}|${buildHistoryManagerRowKey(entry)}`);
    rowIdsByTask[taskId] = rowIds;
    rowIds.forEach((rowId) => validRowIds.add(rowId));

    const rows = entriesByTask
      .map((entry: any) => {
        const rowKey = buildHistoryManagerRowKey(entry);
        const rowId = `${taskId}|${rowKey}`;
        const note = getHistoryEntryNote(entry);
        const isLiveSession = !!entry?.isLiveSession;
        const noteCell = note
          ? `<button class="hmNoteBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" title="${escapeHtmlHM(note)}"><span class="hmNoteBtnText">${escapeHtmlHM(note)}</span></button>`
          : '<span class="hmNoteEmpty">-</span>';
        const rowCheckbox =
          hmBulkEditMode && !isLiveSession
            ? `<input class="hmBulkCheckbox hmBulkRowChk" type="checkbox" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" ${hmBulkSelectedRows.has(rowId) ? "checked" : ""} />`
            : "";
        const dateTimeCell = isLiveSession ? `${formatDateTime(entry.ts)} (Live)` : formatDateTime(entry.ts);
        const deleteCell = isLiveSession
          ? '<span class="hmNoteEmpty">-</span>'
          : `<button class="hmDelBtn" type="button" data-task="${taskId}" data-key="${escapeHtmlHM(rowKey)}" aria-label="Delete log" title="Delete log"><img class="hmDelIcon" src="/icons/icons_default/trash.webp" alt="" aria-hidden="true" /></button>`;
        const rowClasses = [
          hmBulkEditMode && !isLiveSession ? "hmBulkSelectableRow" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const rowClassAttr = rowClasses ? ` class="${rowClasses}"` : "";
        return `
          <tr data-hm-row-id="${escapeHtmlHM(rowId)}"${rowClassAttr}>
            <td class="hmSelectCell">${rowCheckbox}</td>
            <td>${dateTimeCell}</td>
            <td>${formatHistoryManagerElapsed(entry.ms || 0, formatTwo)}</td>
            <td class="hmNotesCell">${noteCell}</td>
            <td style="text-align:right;">${deleteCell}</td>
          </tr>
        `;
      })
      .join("");

    const taskRows = rowIdsByTask[taskId] || [];
    const taskChecked = taskRows.length > 0 && taskRows.every((id) => hmBulkSelectedRows.has(id));
    const dateSortArrow = hmSortKey === "ts" ? (hmSortDir === "asc" ? " &#9650;" : " &#9660;") : "";
    const elapsedSortArrow = hmSortKey === "ms" ? (hmSortDir === "asc" ? " &#9650;" : " &#9660;") : "";
    const taskCheckbox = hmBulkEditMode
      ? `<input class="hmBulkCheckbox hmBulkTaskChk" type="checkbox" data-task="${taskId}" ${taskChecked ? "checked" : ""} />`
      : "";
    const badge =
      meta.state === "archived"
        ? '<span class="hmBadge deleted">Archived</span>'
        : meta.deleted
          ? '<span class="hmBadge deleted">Deleted</span>'
          : "";
    const taskActions =
      meta.state === "archived"
        ? `
          <button class="btn btn-ghost small hmUnarchiveBtn" type="button" data-task="${taskId}" aria-label="Unarchive task" title="Unarchive task">Unarchive</button>
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
            <div class="hmCount">(${entriesByTask.length})</div>
            ${badge}
          </div>
          <div class="hmSummaryMeta">
            ${taskActions}
          </div>
        </summary>
        <div class="hmTaskHistoryTableWrap">
          <table class="hmTable" role="table">
            <thead>
              <tr>
                <th class="hmSelectHead"></th>
                <th><button class="hmSortBtn" type="button" data-hm-sort="ts">DATE/TIME${dateSortArrow}</button></th>
                <th><button class="hmSortBtn" type="button" data-hm-sort="ms">ELAPSED${elapsedSortArrow}</button></th>
                <th class="hmNotesHead">NOTES</th>
                <th style="text-align:right;">DELETE</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </details>
    `;
  };

  const html = filteredIds.map((taskId) => renderTaskGroupHtml(taskId)).join("");

  return {
    html,
    rowIdsByTask,
    validRowIds,
    expandedTaskGroups: expanded.taskGroups,
    isEmpty: false,
    emptyHtml: "",
  };
}
