import type { HistoryByTaskId, Task } from "../lib/types";
import { getTaskScheduledDayEntries } from "../lib/schedule-placement";
import type { DashboardWeekStart } from "../lib/historyChart";
import { hasRecordedTaskGoalCompletion, isTaskTimeGoalStartLockedForPeriod } from "../lib/timeGoalCompletion";
import { renderTaskCardHtml } from "./task-card-view-model";
import { applyXpAwardButtonLabelOverride, getXpAwardButtonLabelOverride } from "./xp-award-button-label-override";
import { isCompletedOnceOffTask, isTaskMarkedDone } from "../lib/taskManualCompletion";

type TaskListRendererDocument = Pick<Document, "createElement">;

type TaskListRendererOptions = {
  taskListEl: HTMLElement | null;
  documentRef: TaskListRendererDocument;
  getTasks: () => Task[];
  getHistoryByTaskId: () => HistoryByTaskId;
  getWeekStarting?: () => DashboardWeekStart;
  getTaskView: () => "list" | "tile";
  getTaskOrderBy: () => "custom" | "alpha" | "schedule" | "dateAddedAsc" | "dateAddedDesc";
  getTileColumnCount: () => number;
  setCurrentTileColumnCount: (value: number) => void;
  getOpenHistoryTaskIds: () => Set<string>;
  getPinnedHistoryTaskIds: () => Set<string>;
  getHistoryViewByTaskId: () => Record<string, { revealPhase?: "openingSpace" | "opening" | "closing" | "closingSpace" | "open" | null; revealTimer?: number | null; rangeDays?: 7 | 14; rangeMode?: "entries" | "day" }>;
  pruneInactiveHistoryTasks?: (activeTaskIds: Set<string>) => boolean;
  syncTaskFlipStatesForVisibleTasks: (activeTaskIds: Set<string>) => void;
  applyTaskFlipDomState: (taskId: string, taskEl?: HTMLElement | null) => void;
  renderHistory: (taskId: string) => void;
  getCurrentAppPage: () => string;
  renderDashboardWidgets: () => void;
  syncTimeGoalModalWithTaskState: () => void;
  maybeRestorePendingTimeGoalFlow: (restoreContext?: { source?: "push" | "appRestore"; taskId?: string }) => void;
  clearTimeoutRef: (timer: number) => void;
  requestAnimationFrameRef: (handler: () => void) => void;
  getElapsedMs: (task: Task) => number;
  sortMilestones: (milestones: Task["milestones"]) => Task["milestones"];
  milestoneUnitSec: (task: Task) => number;
  milestoneUnitSuffix: (task: Task) => string;
  checkpointRepeatActiveTaskId: () => string | null;
  isCheckpointFlashActive: (taskId: string) => boolean;
  canUseAdvancedHistory: () => boolean;
  canUseExecutiveFunction?: () => boolean;
  getExecutiveFunctionUnavailableMessage?: () => string;
  canUseSocialFeatures: () => boolean;
  hasFriends: () => boolean;
  isTaskSharedByOwner: (taskId: string) => boolean;
  getDynamicColorsEnabled: () => boolean;
  getFullColorTaskCardsEnabled: () => boolean;
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

function getTaskCreatedAtMsForSort(task: Task | null | undefined) {
  const createdAtMs = Number(task?.createdAtMs);
  if (Number.isFinite(createdAtMs) && createdAtMs > 0) return Math.floor(createdAtMs);
  return Math.max(0, Math.floor(Number(task?.order) || 0));
}

function compareTasksByDateAddedAsc(a: Task, b: Task) {
  const createdCompare = getTaskCreatedAtMsForSort(a) - getTaskCreatedAtMsForSort(b);
  if (createdCompare !== 0) return createdCompare;
  const customCompare = compareTasksByCustomOrder(a, b);
  if (customCompare !== 0) return customCompare;
  return normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
}

function compareTasksByDateAddedDesc(a: Task, b: Task) {
  const createdCompare = getTaskCreatedAtMsForSort(b) - getTaskCreatedAtMsForSort(a);
  if (createdCompare !== 0) return createdCompare;
  const customCompare = compareTasksByCustomOrder(a, b);
  if (customCompare !== 0) return customCompare;
  return normalizeTaskNameForSort(a).localeCompare(normalizeTaskNameForSort(b));
}

export function buildDisplayedTasks(tasks: Task[], taskOrderBy: "custom" | "alpha" | "schedule" | "dateAddedAsc" | "dateAddedDesc") {
  const nextTasks = tasks.slice();
  if (taskOrderBy === "alpha") return nextTasks.sort(compareTasksByAlpha);
  if (taskOrderBy === "schedule") return nextTasks.sort(compareTasksBySchedule);
  if (taskOrderBy === "dateAddedAsc") return nextTasks.sort(compareTasksByDateAddedAsc);
  if (taskOrderBy === "dateAddedDesc") return nextTasks.sort(compareTasksByDateAddedDesc);
  return nextTasks.sort(compareTasksByCustomOrder);
}

function renderEmptyTaskStateHtml() {
  return `
    <div class="taskListEmptyState" role="status" aria-live="polite">
      <div class="taskListEmptyContent">
        <p class="taskListEmptyMessage">No tasks yet</p>
        <div class="taskListEmptyActions">
          <button class="btn btn-accent small taskListEmptyAddBtn" type="button" data-action="openAddTask">Add Task</button>
        </div>
      </div>
    </div>
  `;
}

function getTaskType(task: Task | null | undefined): "recurring" | "once-off" {
  return task?.taskType === "once-off" ? "once-off" : "recurring";
}

function renderTaskTypeSectionHeaderHtml(title: string, emptyMessage: string, isEmpty: boolean) {
  return `
    <div class="taskTypeSectionHeader">
      <h2 class="taskTypeSectionTitle">${title}</h2>
    </div>
    <div class="taskTypeSectionEmpty"${isEmpty ? "" : " hidden"}>${emptyMessage}</div>
  `;
}

export function createTaskListRenderer(options: TaskListRendererOptions) {
  function renderTasksPage() {
    const taskListEl = options.taskListEl;
    if (!taskListEl) return;

    const tasks = options.getTasks();
    taskListEl.classList.toggle("hasRunningTask", tasks.some((task) => !!task?.running));
    const taskOrderBy = options.getTaskOrderBy();
    const displayedTasks = buildDisplayedTasks(tasks, taskOrderBy);
    const completedOnceOffTasks = displayedTasks
      .filter(isCompletedOnceOffTask)
      .sort((a, b) => Number(b.markedDoneAtMs || 0) - Number(a.markedDoneAtMs || 0));
    const activeTasks = displayedTasks.filter((task) => !isCompletedOnceOffTask(task));
    const recurringTasks = activeTasks.filter((task) => getTaskType(task) === "recurring");
    const onceOffTasks = activeTasks.filter((task) => getTaskType(task) === "once-off");
    const onceOffSectionTasks = onceOffTasks.concat(completedOnceOffTasks);
    const sourceIndexByTask = new Map(tasks.map((task, index) => [task, index] as const));
    taskListEl.innerHTML = "";
    const useTileColumns = options.getTaskView() === "tile";
    const tileColumnCount = useTileColumns ? options.getTileColumnCount() : 1;
    options.setCurrentTileColumnCount(tileColumnCount);
    if (useTileColumns) taskListEl.setAttribute("data-tile-columns", String(tileColumnCount));
    else taskListEl.removeAttribute("data-tile-columns");

    const openHistoryTaskIds = options.getOpenHistoryTaskIds();
    const pinnedHistoryTaskIds = options.getPinnedHistoryTaskIds();
    const historyViewByTaskId = options.getHistoryViewByTaskId();
    const historyByTaskId = options.getHistoryByTaskId();
    const activeTaskIds = new Set(tasks.map((task) => String(task.id || "")));

    options.syncTaskFlipStatesForVisibleTasks(activeTaskIds);
    options.pruneInactiveHistoryTasks?.(activeTaskIds);
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
      taskListEl.innerHTML = renderEmptyTaskStateHtml();
      if (options.getCurrentAppPage() === "dashboard") options.renderDashboardWidgets();
      options.syncTimeGoalModalWithTaskState();
      options.maybeRestorePendingTimeGoalFlow();
      return;
    }

    function createTaskTypeSection(
      taskType: "recurring" | "once-off",
      title: string,
      emptyMessage: string,
      sectionTasks: Task[]
    ) {
      const sectionEl = options.documentRef.createElement("section");
      sectionEl.className = "taskTypeSection";
      sectionEl.dataset.taskTypeSection = taskType;
      sectionEl.setAttribute("aria-label", title);
      sectionEl.innerHTML = renderTaskTypeSectionHeaderHtml(title, emptyMessage, sectionTasks.length === 0);

      const cardsEl = options.documentRef.createElement("div");
      cardsEl.className = "taskTypeSectionCards";
      cardsEl.dataset.taskTypeCards = taskType;
      if (useTileColumns) cardsEl.setAttribute("data-tile-columns", String(tileColumnCount));
      sectionEl.appendChild(cardsEl);
      taskListEl.appendChild(sectionEl);

      const columnEls: HTMLElement[] = [];
      if (useTileColumns) {
        for (let columnIndex = 0; columnIndex < tileColumnCount; columnIndex += 1) {
          const columnEl = options.documentRef.createElement("div");
          columnEl.className = "taskTileColumn";
          columnEl.dataset.tileColumn = String(columnIndex);
          cardsEl.appendChild(columnEl);
          columnEls.push(columnEl);
        }
      }

      return { sectionEl, cardsEl, columnEls };
    }

    const recurringSection = createTaskTypeSection("recurring", "Recurring", "No recurring tasks", recurringTasks);
    const onceOffSection = createTaskTypeSection("once-off", "Once-Off", "No once-off tasks", onceOffSectionTasks);

    function getTaskAppendTarget(section: { cardsEl: HTMLElement; columnEls: HTMLElement[] }, displayIndex: number) {
      if (!useTileColumns) return section.cardsEl;
      return section.columnEls[displayIndex % tileColumnCount] || section.cardsEl;
    }

    const renderTask = (task: Task, displayIndex: number, isCompletedOnceOff: boolean) => {
      const taskId = String(task.id || "");
      const elapsedMs = options.getElapsedMs(task);
      const hasMilestones = task.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.length > 0;
      const hasTimeGoal = !!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0;
      const sortedMilestones = hasMilestones ? options.sortMilestones(task.milestones) : [];
      const timeGoalSec = hasTimeGoal ? Number(task.timeGoalMinutes || 0) * 60 : 0;

      const taskEl = options.documentRef.createElement("div");
      taskEl.dataset.index = String(sourceIndexByTask.get(task) ?? -1);
      taskEl.dataset.taskId = taskId;
      taskEl.dataset.taskType = getTaskType(task);
      taskEl.setAttribute("draggable", !isCompletedOnceOff && taskOrderBy === "custom" ? "true" : "false");

      const historyState = historyViewByTaskId[taskId];
      const historyRevealPhase = historyState?.revealPhase || (openHistoryTaskIds.has(taskId) ? "open" : null);
      const showHistory = openHistoryTaskIds.has(taskId) || historyRevealPhase === "closing" || historyRevealPhase === "closingSpace";
      const isHistoryPinned = pinnedHistoryTaskIds.has(taskId);
      const taskHistory = taskId ? historyByTaskId?.[taskId] : null;
      const hasTaskHistory = Array.isArray(taskHistory) && taskHistory.length > 0;
      const hasHeldResetPrimaryAction = getXpAwardButtonLabelOverride(taskId) === "Reset";
      const isRecordedGoalCompleted = hasRecordedTaskGoalCompletion(task);
      const isCompletedForCurrentPeriod = isTaskTimeGoalStartLockedForPeriod(task, Date.now(), options.getWeekStarting?.() || "mon");
      const isHeldResetPrimaryAction = hasHeldResetPrimaryAction && !isCompletedForCurrentPeriod;
      const renderedCard = renderTaskCardHtml({
        task,
        taskId,
        elapsedMs,
        sortedMilestones,
        milestoneUnitSec: options.milestoneUnitSec(task),
        milestoneUnitSuffix: options.milestoneUnitSuffix(task),
        timeGoalSec,
        checkpointRepeatActiveTaskId: options.checkpointRepeatActiveTaskId(),
        checkpointFlashActive: options.isCheckpointFlashActive(taskId),
        historyRevealPhase,
        historyRangeDays: historyState?.rangeDays,
        historyRangeMode: historyState?.rangeMode,
        showHistory,
        isHistoryPinned,
        canUseAdvancedHistory: options.canUseAdvancedHistory(),
        canUseExecutiveFunction: options.canUseExecutiveFunction?.() ?? true,
        executiveFunctionUnavailableMessage: options.getExecutiveFunctionUnavailableMessage?.(),
        canUseSocialFeatures: options.canUseSocialFeatures(),
        hasFriends: options.hasFriends(),
        isSharedByOwner: options.isTaskSharedByOwner(taskId),
        isManuallyDone: isTaskMarkedDone(task, Date.now()),
        isHeldResetPrimaryAction,
        isStaleRecordedGoalCompleted: isRecordedGoalCompleted && !isCompletedForCurrentPeriod,
        isTimeGoalCompleted:
          isHeldResetPrimaryAction ||
          isCompletedForCurrentPeriod,
        hasTaskHistory,
        dynamicColorsEnabled: options.getDynamicColorsEnabled(),
        fullColorTaskCardsEnabled: options.getFullColorTaskCardsEnabled(),
        modeColor: options.getModeColor("mode1"),
        fillBackgroundForPct: options.fillBackgroundForPct,
        escapeHtml: options.escapeHtml,
        formatMainTaskElapsedHtml: options.formatMainTaskElapsedHtml,
      });
      taskEl.className = renderedCard.className;
      taskEl.innerHTML = renderedCard.html;
      applyXpAwardButtonLabelOverride(taskEl, taskId);
      options.applyTaskFlipDomState(taskId, taskEl);
      const section = getTaskType(task) === "once-off" ? onceOffSection : recurringSection;
      getTaskAppendTarget(section, displayIndex).appendChild(taskEl);
    };

    recurringTasks.forEach((task, displayIndex) => renderTask(task, displayIndex, false));
    onceOffTasks.forEach((task, displayIndex) => renderTask(task, displayIndex, false));
    completedOnceOffTasks.forEach((task, displayIndex) => renderTask(task, onceOffTasks.length + displayIndex, true));

    const stableOpenHistoryTaskIds = Array.from(openHistoryTaskIds).filter((taskId) => {
      const revealPhase = historyViewByTaskId[taskId]?.revealPhase;
      return revealPhase !== "openingSpace" && revealPhase !== "opening";
    });
    for (const taskId of stableOpenHistoryTaskIds) options.renderHistory(taskId);
    if (stableOpenHistoryTaskIds.length) {
      options.requestAnimationFrameRef(() => {
        options.requestAnimationFrameRef(() => {
          if (options.getCurrentAppPage() !== "tasks") return;
          for (const taskId of stableOpenHistoryTaskIds) {
            if (options.getOpenHistoryTaskIds().has(taskId)) options.renderHistory(taskId);
          }
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
