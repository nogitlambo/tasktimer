import type { Task } from "../lib/types";
import { getTaskScheduledDayEntries } from "../lib/schedule-placement";
import { isTaskTimeGoalStartLockedToday } from "../lib/timeGoalCompletion";
import { renderTaskCardHtml } from "./task-card-view-model";

type TaskListRendererDocument = Pick<Document, "createElement">;

type TaskListRendererOptions = {
  taskListEl: HTMLElement | null;
  documentRef: TaskListRendererDocument;
  getTasks: () => Task[];
  getTaskView: () => "list" | "tile";
  getTaskOrderBy: () => "custom" | "alpha" | "schedule";
  getTileColumnCount: () => number;
  setCurrentTileColumnCount: (value: number) => void;
  getOpenHistoryTaskIds: () => Set<string>;
  getPinnedHistoryTaskIds: () => Set<string>;
  getHistoryViewByTaskId: () => Record<string, { revealPhase?: "opening" | "closing" | "open" | null; revealTimer?: number | null }>;
  syncTaskFlipStatesForVisibleTasks: (activeTaskIds: Set<string>) => void;
  applyTaskFlipDomState: (taskId: string, taskEl?: HTMLElement | null) => void;
  renderHistory: (taskId: string) => void;
  getCurrentAppPage: () => string;
  renderDashboardWidgets: () => void;
  syncTimeGoalModalWithTaskState: () => void;
  maybeRestorePendingTimeGoalFlow: () => void;
  clearTimeoutRef: (timer: number) => void;
  requestAnimationFrameRef: (handler: () => void) => void;
  getElapsedMs: (task: Task) => number;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  milestoneUnitSec: (task: Task) => number;
  milestoneUnitSuffix: (task: Task) => string;
  checkpointRepeatActiveTaskId: () => string | null;
  activeCheckpointToastTaskId: () => string | null;
  canUseAdvancedHistory: () => boolean;
  canUseSocialFeatures: () => boolean;
  isTaskSharedByOwner: (taskId: string) => boolean;
  getDynamicColorsEnabled: () => boolean;
  getModeColor: (mode: "mode1") => string;
  fillBackgroundForPct: (pct: number) => string;
  escapeHtml: (value: unknown) => string;
  formatMainTaskElapsedHtml: (elapsedMs: number, running: boolean) => string;
};

function normalizeTaskNameForSort(task: Task | null | undefined) {
  return String(task?.name || "").trim().toLocaleLowerCase();
}

function getTaskScheduleSortMinutes(task: Task | null | undefined) {
  if (!task) return null;
  const entries = getTaskScheduledDayEntries(task);
  if (!entries.length) return null;
  const minuteValues = entries
    .map((entry) => {
      const match = String(entry.time || "").match(/^(\d{2}):(\d{2})$/);
      if (!match) return null;
      const hours = Number(match[1] || 0);
      const minutes = Number(match[2] || 0);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
      return hours * 60 + minutes;
    })
    .filter((value): value is number => value != null);
  if (!minuteValues.length) return null;
  return Math.min(...minuteValues);
}

function compareTasksByCustomOrder(a: Task, b: Task) {
  return (a.order || 0) - (b.order || 0);
}

function compareTasksByAlpha(a: Task, b: Task) {
  const nameCompare = normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
  if (nameCompare !== 0) return nameCompare;
  return compareTasksByCustomOrder(a, b);
}

function compareTasksBySchedule(a: Task, b: Task) {
  const aMinutes = getTaskScheduleSortMinutes(a);
  const bMinutes = getTaskScheduleSortMinutes(b);
  if (aMinutes == null && bMinutes != null) return 1;
  if (aMinutes != null && bMinutes == null) return -1;
  if (aMinutes != null && bMinutes != null && aMinutes !== bMinutes) return aMinutes - bMinutes;
  const nameCompare = normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
  if (nameCompare !== 0) return nameCompare;
  return compareTasksByCustomOrder(a, b);
}

export function buildDisplayedTasks(tasks: Task[], taskOrderBy: "custom" | "alpha" | "schedule") {
  const nextTasks = tasks.slice();
  if (taskOrderBy === "alpha") return nextTasks.sort(compareTasksByAlpha);
  if (taskOrderBy === "schedule") return nextTasks.sort(compareTasksBySchedule);
  return nextTasks.sort(compareTasksByCustomOrder);
}

function renderTaskListEmptyState(taskListEl: HTMLElement) {
  taskListEl.innerHTML = `
        <section class="taskListEmptyState" aria-label="No tasks">
          <div class="taskListEmptyContent">
            <p class="taskListEmptyMessage">No Tasks found</p>
            <button class="btn btn-accent taskListEmptyAddBtn" type="button" data-action="openAddTask">
              + Add New Task
            </button>
          </div>
        </section>
      `;
}

export function createTaskListRenderer(options: TaskListRendererOptions) {
  function renderTasksPage() {
    const taskListEl = options.taskListEl;
    if (!taskListEl) return;

    const tasks = options.getTasks();
    const taskOrderBy = options.getTaskOrderBy();
    const displayedTasks = buildDisplayedTasks(tasks, taskOrderBy);
    const sourceIndexByTaskId = new Map(tasks.map((task, index) => [String(task.id || ""), index] as const));
    taskListEl.innerHTML = "";
    const useTileColumns = options.getTaskView() === "tile";
    const tileColumnCount = useTileColumns ? options.getTileColumnCount() : 1;
    options.setCurrentTileColumnCount(tileColumnCount);
    if (useTileColumns) taskListEl.setAttribute("data-tile-columns", String(tileColumnCount));
    else taskListEl.removeAttribute("data-tile-columns");

    const tileColumnEls: HTMLElement[] = [];
    if (useTileColumns) {
      for (let columnIndex = 0; columnIndex < tileColumnCount; columnIndex += 1) {
        const columnEl = options.documentRef.createElement("div");
        columnEl.className = "taskTileColumn";
        columnEl.dataset.tileColumn = String(columnIndex);
        taskListEl.appendChild(columnEl);
        tileColumnEls.push(columnEl);
      }
    }

    const openHistoryTaskIds = options.getOpenHistoryTaskIds();
    const pinnedHistoryTaskIds = options.getPinnedHistoryTaskIds();
    const historyViewByTaskId = options.getHistoryViewByTaskId();
    const activeTaskIds = new Set(tasks.map((task) => String(task.id || "")));

    options.syncTaskFlipStatesForVisibleTasks(activeTaskIds);
    for (const taskId of Array.from(pinnedHistoryTaskIds)) {
      if (activeTaskIds.has(taskId)) openHistoryTaskIds.add(taskId);
    }
    for (const taskId of Array.from(openHistoryTaskIds)) {
      if (!activeTaskIds.has(taskId)) {
        const staleHistoryState = historyViewByTaskId[taskId];
        if (staleHistoryState?.revealTimer != null) options.clearTimeoutRef(staleHistoryState.revealTimer);
        openHistoryTaskIds.delete(taskId);
        delete historyViewByTaskId[taskId];
      }
    }

    if (!displayedTasks.length) {
      renderTaskListEmptyState(taskListEl);
      if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
      options.syncTimeGoalModalWithTaskState();
      options.maybeRestorePendingTimeGoalFlow();
      return;
    }

    displayedTasks.forEach((task, displayIndex) => {
      const taskId = String(task.id || "");
      const elapsedMs = options.getElapsedMs(task);
      const hasMilestones = task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
      const hasTimeGoal = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0;
      const sortedMilestones = hasMilestones ? options.sortMilestones(task.milestones) : [];
      const timeGoalSec = hasTimeGoal ? Number(task.timeGoalMinutes || 0) * 60 : 0;

      const taskEl = options.documentRef.createElement("div");
      taskEl.dataset.index = String(sourceIndexByTaskId.get(taskId) ?? -1);
      taskEl.dataset.taskId = taskId;
      taskEl.setAttribute("draggable", taskOrderBy === "custom" ? "true" : "false");

      const historyState = historyViewByTaskId[taskId];
      const historyRevealPhase = historyState?.revealPhase || (openHistoryTaskIds.has(taskId) ? "open" : null);
      const showHistory = openHistoryTaskIds.has(taskId) || historyRevealPhase === "closing";
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const renderedCard = renderTaskCardHtml({
        task,
        taskId,
        elapsedMs,
        sortedMilestones,
        milestoneUnitSec: options.milestoneUnitSec(task),
        milestoneUnitSuffix: options.milestoneUnitSuffix(task),
        timeGoalSec,
        checkpointRepeatActiveTaskId: options.checkpointRepeatActiveTaskId(),
        activeCheckpointToastTaskId: options.activeCheckpointToastTaskId(),
        historyRevealPhase,
        showHistory,
        isHistoryPinned,
        canUseAdvancedHistory: options.canUseAdvancedHistory(),
        canUseSocialFeatures: options.canUseSocialFeatures(),
        isSharedByOwner: options.isTaskSharedByOwner(taskId),
        isTimeGoalCompleted: isTaskTimeGoalStartLockedToday(task),
        dynamicColorsEnabled: options.getDynamicColorsEnabled(),
        modeColor: options.getModeColor("mode1"),
        fillBackgroundForPct: options.fillBackgroundForPct,
        escapeHtml: options.escapeHtml,
        formatMainTaskElapsedHtml: options.formatMainTaskElapsedHtml,
      });
      taskEl.className = renderedCard.className;
      taskEl.innerHTML = renderedCard.html;
      options.applyTaskFlipDomState(taskId, taskEl);
      const tileColumnEl = useTileColumns ? tileColumnEls[displayIndex % tileColumnCount] : null;
      (tileColumnEl || taskListEl).appendChild(taskEl);
    });

    for (const taskId of openHistoryTaskIds) options.renderHistory(taskId);
    if (openHistoryTaskIds.size) {
      options.requestAnimationFrameRef(() => {
        options.requestAnimationFrameRef(() => {
          if (options.getCurrentAppPage() !== "tasks") return;
          for (const taskId of options.getOpenHistoryTaskIds()) options.renderHistory(taskId);
        });
      });
    }
    if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
    options.syncTimeGoalModalWithTaskState();
    options.maybeRestorePendingTimeGoalFlow();
  }

  return {
    renderTasksPage,
  };
}
