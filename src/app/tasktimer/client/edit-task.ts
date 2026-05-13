import type { Task, TaskPlannedStartByDay } from "../lib/types";
import {
  formatAggregateTimeGoalValidationMessage,
  formatAddTaskDurationReadout,
  getAggregateTimeGoalValidationForReplacement,
  getAddTaskDurationMaxForPeriod,
  isAggregateTimeGoalValidationWorsened,
  normalizeTaskConfigMilestones,
  validateAggregateTimeGoalTotals,
} from "../lib/taskConfig";
import {
  findNextAvailableScheduleSlot,
  findScheduleOverlap,
  formatScheduleSlotSuggestion,
  getTaskScheduledDays,
  hasTaskMixedScheduleTimes,
  isRecurringDailyScheduleTask,
  normalizeScheduleStoredTime,
  normalizeTaskPlannedStartByDay,
  resolveNextScheduleDayDate,
  SCHEDULE_DAY_ORDER,
  type ScheduleDay,
  syncLegacyPlannedStartFields,
} from "../lib/schedule-placement";
import { getTaskColorFamilyForColor, normalizeTaskColor, TASK_COLOR_FAMILIES } from "../lib/taskColors";
import {
  clampCheckpointValueToTimeGoal,
  formatCheckpointSliderLabel,
  formatCheckpointSliderProgress,
  getCheckpointSliderMaxMinutes,
  sliderMinutesToCheckpointValue,
  type CheckpointSliderUnit,
} from "./checkpoint-slider";
import type { TaskTimerEditTaskContext } from "./context";
import { readPlannedStartValueFromSelectors, syncPlannedStartSelectors } from "./planned-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function normalizeRecurringScheduleFieldsForSave(task: Task, sourceTask?: Task | null) {
  if (task.taskType !== "recurring") return;

  const normalizedByDay = normalizeTaskPlannedStartByDay(task.plannedStartByDay);
  const normalizedPlannedStartTime = normalizeScheduleStoredTime(task.plannedStartTime);

  if (task.plannedStartOpenEnded) {
    if (normalizedByDay) syncLegacyPlannedStartFields(task, normalizedByDay);
    return;
  }

  if (!normalizedPlannedStartTime) {
    if (normalizedByDay) syncLegacyPlannedStartFields(task, normalizedByDay);
    return;
  }

  const sourceHasLegacyDailySchedule =
    !!sourceTask &&
    sourceTask.taskType === "recurring" &&
    !sourceTask.plannedStartOpenEnded &&
    sourceTask.plannedStartDay == null &&
    !!normalizeScheduleStoredTime(sourceTask.plannedStartTime);
  const sourceIsRecurringDaily =
    !!sourceTask &&
    sourceTask.taskType === "recurring" &&
    (isRecurringDailyScheduleTask(sourceTask) || sourceHasLegacyDailySchedule);
  const sourceIsOnceOff = sourceTask?.taskType === "once-off";
  const taskAlreadyCoversAllDays =
    !!normalizedByDay &&
    SCHEDULE_DAY_ORDER.every((day) => normalizeScheduleStoredTime(normalizedByDay[day]) === normalizedPlannedStartTime);

  if (sourceIsOnceOff || sourceIsRecurringDaily || taskAlreadyCoversAllDays) {
    const nextByDay = Object.fromEntries(
      SCHEDULE_DAY_ORDER.map((day) => [day, normalizedPlannedStartTime])
    ) as TaskPlannedStartByDay;
    syncLegacyPlannedStartFields(task, nextByDay);
    return;
  }

  if (normalizedByDay) {
    const scheduledDays = SCHEDULE_DAY_ORDER.filter((day) => !!normalizeScheduleStoredTime(normalizedByDay[day]));
    const nextByDay = Object.fromEntries(
      scheduledDays.map((day) => [day, normalizedPlannedStartTime])
    ) as TaskPlannedStartByDay;
    syncLegacyPlannedStartFields(task, nextByDay);
    return;
  }

  const sourceByDay = normalizeTaskPlannedStartByDay(sourceTask?.plannedStartByDay);
  if (sourceByDay) {
    const scheduledDays = getTaskScheduledDays(sourceTask || task);
    const nextByDay = Object.fromEntries(
      scheduledDays.map((day) => [day, normalizedPlannedStartTime])
    ) as TaskPlannedStartByDay;
    syncLegacyPlannedStartFields(task, nextByDay);
    return;
  }

  task.plannedStartDay = null;
  task.plannedStartByDay = null;
  task.plannedStartTime = normalizedPlannedStartTime;
  syncLegacyPlannedStartFields(task);
}

export function getEditTimeGoalSaveFields(
  taskType: Task["taskType"],
  value: number,
  unit: "minute" | "hour",
  period: "day" | "week"
) {
  const safeValue = Math.max(0, Number(value) || 0);
  const timeGoalPeriod = taskType === "once-off" ? "day" : period;
  const timeGoalMinutes =
    taskType === "once-off"
      ? unit === "minute"
        ? safeValue
        : safeValue * 60
      : unit === "minute"
        ? period === "day"
          ? safeValue
          : safeValue * 7
        : period === "day"
          ? safeValue * 60
          : safeValue * 60 * 7;

  return { timeGoalPeriod, timeGoalMinutes };
}

export function taskHasMeaningfulScheduleConfig(task: Task | null | undefined) {
  if (!task) return false;
  if (!!task.timeGoalEnabled && Number(task.timeGoalMinutes || 0) > 0) return true;
  if (!!task.milestonesEnabled || (Array.isArray(task.milestones) && task.milestones.length > 0)) return true;
  if (!!task.plannedStartOpenEnded) return true;
  if (!!normalizeTaskPlannedStartByDay(task.plannedStartByDay)) return true;
  if (!!normalizeScheduleStoredTime(task.plannedStartTime)) return true;
  if (task.taskType === "once-off" && (!!task.onceOffDay || !!task.onceOffTargetDate || !!task.plannedStartDay)) return true;
  return false;
}

export function restoreEditScheduleFieldsFromSnapshot(task: Task, snapshot: Task) {
  task.taskType = snapshot.taskType === "once-off" ? "once-off" : "recurring";
  task.onceOffDay = snapshot.onceOffDay || null;
  task.onceOffTargetDate = snapshot.onceOffTargetDate || null;
  task.timeGoalEnabled = !!snapshot.timeGoalEnabled;
  task.timeGoalValue = Number(snapshot.timeGoalValue || 0);
  task.timeGoalUnit = snapshot.timeGoalUnit === "minute" ? "minute" : "hour";
  task.timeGoalPeriod = snapshot.timeGoalPeriod === "day" ? "day" : "week";
  task.timeGoalMinutes = Number(snapshot.timeGoalMinutes || 0);
  task.milestonesEnabled = !!snapshot.milestonesEnabled;
  task.milestoneTimeUnit = snapshot.milestoneTimeUnit === "minute" ? "minute" : "hour";
  task.milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones.map((milestone) => ({ ...milestone })) : [];
  task.checkpointSoundEnabled = !!snapshot.checkpointSoundEnabled;
  task.checkpointSoundMode = snapshot.checkpointSoundMode === "repeat" ? "repeat" : "once";
  task.checkpointToastEnabled = !!snapshot.checkpointToastEnabled;
  task.checkpointToastMode = snapshot.checkpointToastMode === "manual" ? "manual" : "auto5s";
  task.plannedStartDay = snapshot.plannedStartDay || null;
  task.plannedStartTime = snapshot.plannedStartTime || null;
  task.plannedStartByDay = snapshot.plannedStartByDay ? { ...snapshot.plannedStartByDay } : null;
  task.plannedStartOpenEnded = !!snapshot.plannedStartOpenEnded;
  task.plannedStartPushRemindersEnabled = snapshot.plannedStartPushRemindersEnabled !== false;
}

export function clearTaskScheduleConfig(task: Task) {
  task.taskType = "recurring";
  task.onceOffDay = null;
  task.onceOffTargetDate = null;
  task.timeGoalEnabled = false;
  task.timeGoalValue = 0;
  task.timeGoalUnit = "hour";
  task.timeGoalPeriod = "week";
  task.timeGoalMinutes = 0;
  task.milestonesEnabled = false;
  task.milestoneTimeUnit = "hour";
  task.milestones = [];
  task.checkpointSoundEnabled = false;
  task.checkpointSoundMode = "once";
  task.checkpointToastEnabled = false;
  task.checkpointToastMode = "auto5s";
  task.presetIntervalsEnabled = false;
  task.presetIntervalValue = 0;
  task.presetIntervalLastMilestoneId = null;
  task.presetIntervalNextSeq = 1;
  task.plannedStartDay = null;
  task.plannedStartTime = null;
  task.plannedStartByDay = null;
  task.plannedStartOpenEnded = false;
  task.plannedStartPushRemindersEnabled = false;
}

export function createTaskTimerEditTask(ctx: TaskTimerEditTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  const EDIT_OVERLAY_SLIDE_MS = 260;
  let editOverlayHideTimer: number | null = null;
  let editOverlayOpeningTimer: number | null = null;
  let editOverlayOriginRect: { left: number; top: number; width: number; height: number } | null = null;
  let editTaskScheduleEnabled = true;
  let editTaskScheduleRestoreSnapshot: Task | null = null;

  function clearEditOverlayHideTimer() {
    if (editOverlayHideTimer == null) return;
    window.clearTimeout(editOverlayHideTimer);
    editOverlayHideTimer = null;
  }

  function clearEditOverlayOpeningTimer() {
    if (editOverlayOpeningTimer == null) return;
    window.clearTimeout(editOverlayOpeningTimer);
    editOverlayOpeningTimer = null;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    } catch {
      return false;
    }
  }

  function clearEditOverlayOrigin(overlay?: HTMLElement | null) {
    const target = overlay || (els.editOverlay as HTMLElement | null);
    editOverlayOriginRect = null;
    if (!target) return;
    target.classList.remove("isMorphingFromTask", "isOpening");
    target.style.removeProperty("--edit-origin-translate-x");
    target.style.removeProperty("--edit-origin-translate-y");
    target.style.removeProperty("--edit-origin-scale-x");
    target.style.removeProperty("--edit-origin-scale-y");
  }

  function applyEditOverlayOriginVars(
    overlay: HTMLElement,
    modal: HTMLElement,
    sourceRect: { left: number; top: number; width: number; height: number }
  ) {
    const modalRect = modal.getBoundingClientRect();
    if (
      sourceRect.width <= 0 ||
      sourceRect.height <= 0 ||
      modalRect.width <= 0 ||
      modalRect.height <= 0
    ) {
      return false;
    }
    overlay.style.setProperty("--edit-origin-translate-x", `${sourceRect.left - modalRect.left}px`);
    overlay.style.setProperty("--edit-origin-translate-y", `${sourceRect.top - modalRect.top}px`);
    overlay.style.setProperty("--edit-origin-scale-x", String(Math.max(0.015, sourceRect.width / modalRect.width)));
    overlay.style.setProperty("--edit-origin-scale-y", String(Math.max(0.015, sourceRect.height / modalRect.height)));
    return true;
  }

  function refreshEditOverlayOriginFromStoredRect(overlay: HTMLElement) {
    const modal = overlay.querySelector<HTMLElement>(".modal") || null;
    if (!modal || !editOverlayOriginRect || prefersReducedMotion()) return false;
    return applyEditOverlayOriginVars(overlay, modal, editOverlayOriginRect);
  }

  function setEditOverlayOrigin(sourceEl?: HTMLElement | null) {
    const overlay = els.editOverlay as HTMLElement | null;
    const modal = overlay?.querySelector<HTMLElement>(".modal") || null;
    if (!overlay || !modal || !sourceEl || prefersReducedMotion()) {
      clearEditOverlayOrigin(overlay);
      return false;
    }
    const sourceRect = sourceEl.getBoundingClientRect();
    const nextOriginRect = {
      left: sourceRect.left,
      top: sourceRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
    };
    if (!applyEditOverlayOriginVars(overlay, modal, nextOriginRect)) {
      clearEditOverlayOrigin(overlay);
      return false;
    }
    editOverlayOriginRect = nextOriginRect;
    overlay.classList.add("isMorphingFromTask");
    return true;
  }

  function showEditOverlay(sourceEl?: HTMLElement | null) {
    const overlay = els.editOverlay as HTMLElement | null;
    if (!overlay) return;
    clearEditOverlayHideTimer();
    clearEditOverlayOpeningTimer();
    overlay.style.display = "flex";
    overlay.classList.remove("isOpen", "isClosing", "isOpening", "isMorphingFromTask");
    const hasOrigin = setEditOverlayOrigin(sourceEl);
    if (hasOrigin) overlay.classList.add("isOpening");
    void overlay.offsetHeight;
    overlay.classList.add("isOpen");
    if (hasOrigin) {
      editOverlayOpeningTimer = window.setTimeout(() => {
        overlay.classList.remove("isOpening");
        editOverlayOpeningTimer = null;
      }, EDIT_OVERLAY_SLIDE_MS);
    }
  }

  function hideEditOverlay(immediate = false) {
    const overlay = els.editOverlay as HTMLElement | null;
    if (!overlay) return;
    clearEditOverlayHideTimer();
    clearEditOverlayOpeningTimer();
    if (immediate) {
      overlay.classList.remove("isOpen", "isClosing", "isOpening");
      overlay.style.display = "none";
      clearEditOverlayOrigin(overlay);
      return;
    }
    if (!editOverlayOriginRect || !refreshEditOverlayOriginFromStoredRect(overlay)) {
      clearEditOverlayOrigin(overlay);
    }
    overlay.classList.remove("isOpening");
    overlay.classList.remove("isOpen");
    overlay.classList.add("isClosing");
    editOverlayHideTimer = window.setTimeout(() => {
      overlay.classList.remove("isClosing", "isOpening");
      overlay.style.display = "none";
      clearEditOverlayOrigin(overlay);
      editOverlayHideTimer = null;
    }, EDIT_OVERLAY_SLIDE_MS);
  }

  function readEditPlannedStartValueFromSelectors() {
    return readPlannedStartValueFromSelectors({
      hourSelect: els.editPlannedStartHourSelect,
      minuteSelect: els.editPlannedStartMinuteSelect,
      meridiemSelect: els.editPlannedStartMeridiemSelect,
    });
  }

  function syncEditTaskScheduleToggleUi() {
    if (els.editTaskScheduleToggle) {
      els.editTaskScheduleToggle.checked = editTaskScheduleEnabled;
    }
    els.editTaskScheduleFields?.classList.toggle("isHidden", !editTaskScheduleEnabled);
  }


  function syncEditPlannedStartSelectors(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const pushRemindersEnabled = currentTask?.plannedStartPushRemindersEnabled !== false;
    syncPlannedStartSelectors(
      {
        hourSelect: els.editPlannedStartHourSelect,
        minuteSelect: els.editPlannedStartMinuteSelect,
        meridiemSelect: els.editPlannedStartMeridiemSelect,
      },
      currentTask?.plannedStartTime || "09:00"
    );
    if (els.editPlannedStartInput) {
      els.editPlannedStartInput.value = String(currentTask?.plannedStartTime || "09:00");
    }
    if (els.editPlannedStartPushReminders) {
      els.editPlannedStartPushReminders.checked = pushRemindersEnabled;
    }
    els.editPlannedStartPushRemindersRow?.classList.remove("isDisabled");
  }

  function syncEditPlannedStartValueFromSelectors() {
    const t = getCurrentEditTask();
    if (!t) return;
    const nextValue = readEditPlannedStartValueFromSelectors();
    t.plannedStartTime = nextValue;
    if (els.editPlannedStartInput) {
      els.editPlannedStartInput.value = nextValue;
    }
    syncEditSaveAvailability(t);
  }

  function syncEditTaskTypeUi(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const taskType = currentTask?.taskType === "once-off" ? "once-off" : "recurring";
    const isOnceOff = taskType === "once-off";
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    };
    syncPill(els.editTaskTypeRecurringBtn, taskType === "recurring");
    syncPill(els.editTaskTypeOnceOffBtn, taskType === "once-off");
    els.editTaskOnceOffDayField?.classList.toggle("isHidden", !isOnceOff);
    if (els.editTaskOnceOffDaySelect) {
      els.editTaskOnceOffDaySelect.value = String(currentTask?.onceOffDay || currentTask?.plannedStartDay || "mon");
    }
  }

  function isOnceOffTaskType(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    return currentTask?.taskType === "once-off";
  }

  function canUseAdvancedTaskConfig() {
    // Time Goals and Checkpoints are available on the free plan; keep this gate local so
    // unrelated advanced task configuration entitlements remain unchanged elsewhere.
    return true;
  }

  function getCurrentEditTask() {
    return ctx.getEditTaskDraft();
  }

  function clearEditValidationState() {
    els.editValidationError?.classList.remove("isOn");
    if (els.editValidationError) els.editValidationError.textContent = "";
    els.msArea?.classList.remove("isInvalid");
    els.msList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function syncEditTaskDurationReadout(task?: Task | null) {
    if (!els.editTaskDurationReadout) return;
    const currentTask = task || getCurrentEditTask();
    const durationValue = String(els.editTaskDurationValueInput?.value || currentTask?.timeGoalValue || 0);
    const durationUnit =
      ctx.getEditTaskDurationUnit() === "minute" ? "minute" : currentTask?.timeGoalUnit === "minute" ? "minute" : "hour";
    const durationPeriod =
      ctx.getEditTaskDurationPeriod() === "day" ? "day" : currentTask?.timeGoalPeriod === "day" ? "day" : "week";
    els.editTaskDurationReadout.textContent = formatAddTaskDurationReadout({
      name: String(els.editName?.value || currentTask?.name || "").trim(),
      durationValue,
      durationUnit,
      durationPeriod,
      taskType: currentTask?.taskType === "once-off" ? "once-off" : "recurring",
      noTimeGoal: false,
      milestonesEnabled: !!currentTask?.milestonesEnabled,
      milestoneTimeUnit: currentTask?.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestones: normalizeTaskConfigMilestones(
        (Array.isArray(currentTask?.milestones) ? currentTask.milestones : []).map((milestone, index) => ({
          id: String(milestone?.id || ""),
          createdSeq:
            Number.isFinite(Number(milestone?.createdSeq)) && Number(milestone.createdSeq) > 0
              ? Math.floor(Number(milestone.createdSeq))
              : index + 1,
          value: String(Number(milestone?.hours || 0)),
          description: String(milestone?.description || ""),
          alertsEnabled: milestone?.alertsEnabled !== false,
        }))
      ),
      checkpointSoundEnabled: !!currentTask?.checkpointSoundEnabled,
      checkpointSoundMode: currentTask?.checkpointSoundMode === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!currentTask?.checkpointToastEnabled,
      checkpointToastMode: currentTask?.checkpointToastMode === "manual" ? "manual" : "auto5s",
      presetIntervalsEnabled: false,
      presetIntervalValue: "0",
      timeGoalAction: "confirmModal",
    });
  }

  function getEditTaskTimeGoalMinutesFor(value: number, unit: "minute" | "hour", period: "day" | "week") {
    if (!(value > 0)) return 0;
    if (unit === "minute") {
      return period === "day" ? value : value * 7;
    }
    return period === "day" ? value * 60 : value * 60 * 7;
  }

  function isEditTimeGoalEnabled() {
    return true;
  }

  function setEditTimeGoalEnabled(enabled: boolean) {
    void enabled;
  }

  function getEditTaskTimeGoalMinutes() {
    const value = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    if (!(value > 0)) return 0;
    if (isOnceOffTaskType()) {
      return ctx.getEditTaskDurationUnit() === "minute" ? value : value * 60;
    }
    return getEditTaskTimeGoalMinutesFor(value, ctx.getEditTaskDurationUnit(), ctx.getEditTaskDurationPeriod());
  }

  function editTaskHasActiveTimeGoal() {
    return getEditTaskTimeGoalMinutes() > 0;
  }

  function syncEditTaskTimeGoalUi(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const onceOff = isOnceOffTaskType(currentTask);
    const hasActiveTimeGoal = editTaskHasActiveTimeGoal();
    if (onceOff) {
      ctx.setEditTaskDurationPeriod("day");
    }
    els.editTaskDurationRow?.classList.remove("isHidden", "isDisabled");
    els.editTaskDurationReadout?.classList.remove("isHidden", "isDisabled");
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.disabled = false;
    if (els.editTaskDurationValueInput) {
      const parsedValue = Math.max(0, Math.floor(parseFloat(els.editTaskDurationValueInput.value || "0") || 0));
      const maxDay = getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), "day");
      const canUseDay = !onceOff && Number(parsedValue) <= maxDay;
      if (String(parsedValue || "") !== String(els.editTaskDurationValueInput.value || "")) {
        els.editTaskDurationValueInput.value = String(parsedValue || 0);
      }
      if (!onceOff) {
        ctx.setEditTaskDurationPeriod(canUseDay && ctx.getEditTaskDurationPeriod() === "day" ? "day" : "week");
      }
    }
    els.editTaskDurationRow?.querySelector(".addTaskDurationPerLabel")?.classList.toggle("isHidden", onceOff);
    els.editTaskDurationPeriodDay?.closest("#editTaskDurationPeriodPills")?.classList.toggle("isHidden", onceOff);
    const canUseDay = !onceOff && Number(els.editTaskDurationValueInput?.value || 0) <= getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), "day");
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.classList.toggle("isHidden", hidden);
      btn.disabled = hidden;
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.setAttribute("aria-hidden", hidden ? "true" : "false");
    };
    syncPill(els.editTaskDurationUnitMinute, ctx.getEditTaskDurationUnit() === "minute");
    syncPill(els.editTaskDurationUnitHour, ctx.getEditTaskDurationUnit() === "hour");
    syncPill(els.editTaskDurationPeriodDay, ctx.getEditTaskDurationPeriod() === "day", !canUseDay || onceOff);
    syncPill(els.editTaskDurationPeriodWeek, ctx.getEditTaskDurationPeriod() === "week", onceOff);
    els.editTaskDurationValueInput?.classList.remove("isInvalid");
    syncEditTaskDurationReadout(currentTask);
    const checkpointControlsDisabled = !hasActiveTimeGoal;
    els.msArea?.classList.toggle("isHidden", checkpointControlsDisabled);
    els.msArea?.classList.toggle("isDisabled", checkpointControlsDisabled || !currentTask?.milestonesEnabled);
    els.msArea?.classList.toggle("isGoalRequired", checkpointControlsDisabled);
    if (els.msToggle) {
      els.msToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.msToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.addMsBtn) {
      els.addMsBtn.disabled = checkpointControlsDisabled;
      els.addMsBtn.title = checkpointControlsDisabled ? "Set a time goal to add checkpoints" : "";
    }
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointSoundEnabled;
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointToastEnabled;
    }
    if (currentTask) {
      syncEditCheckpointAlertUi(currentTask);
    } else {
      els.editTimerSettingsGroup?.classList.add("isHidden");
    }
  }

  function validateEditTimeGoal() {
    if (!editTaskScheduleEnabled) return true;
    const value = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    if (!(value > 0)) {
      els.editTaskDurationValueInput?.classList.add("isInvalid");
      return false;
    }
    if (!isOnceOffTaskType()) {
      const max = getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), ctx.getEditTaskDurationPeriod());
      if (value > max) {
        els.editTaskDurationValueInput?.classList.add("isInvalid");
        return false;
      }
      const aggregateValidation = getEditAggregateTimeGoalValidation();
      if (aggregateValidation?.shouldBlock) {
        els.editTaskDurationValueInput?.classList.add("isInvalid");
        return false;
      }
    }
    return true;
  }

  function validateEditOnceOffDay(task?: Task | null) {
    if (!editTaskScheduleEnabled) return true;
    const currentTask = task || getCurrentEditTask();
    if (!currentTask || currentTask.taskType !== "once-off") return true;
    return !!String(els.editTaskOnceOffDaySelect?.value || currentTask.onceOffDay || "").trim();
  }

  function buildEditTimeGoalDraft(task: Task | null | undefined): Task | null {
    if (!task) return null;
    const onceOff = task.taskType === "once-off";
    return {
      ...task,
      timeGoalEnabled: true,
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: ctx.getEditTaskDurationUnit(),
      timeGoalPeriod: onceOff ? "week" : ctx.getEditTaskDurationPeriod(),
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
    };
  }

  function getEditAggregateTimeGoalValidation(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    if (currentTask?.taskType === "once-off") return null;
    const replacementTask = buildEditTimeGoalDraft(currentTask);
    if (!replacementTask) return null;

    const editIndex = ctx.getEditIndex();
    const tasks = ctx.getTasks();
    const sourceTask = editIndex != null ? tasks[editIndex] : null;
    const currentResult = validateAggregateTimeGoalTotals(tasks);
    const nextResult = getAggregateTimeGoalValidationForReplacement(tasks, replacementTask, sourceTask?.id || replacementTask.id);
    const shouldBlock = currentResult.isWithinLimit
      ? !nextResult.isWithinLimit
      : isAggregateTimeGoalValidationWorsened(currentResult, nextResult);

    return {
      currentResult,
      nextResult,
      shouldBlock,
      message: shouldBlock ? formatAggregateTimeGoalValidationMessage(nextResult) : "",
    };
  }

  function applyEditCheckpointValidationHighlights(task: Task | null | undefined) {
    if (!task) return;
    const noCheckpoints = !!task.milestonesEnabled && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const effectiveTimeGoalMinutes = task === getCurrentEditTask() ? getEditTaskTimeGoalMinutes() : Number(task.timeGoalMinutes || 0);
    const invalidCheckpointTimes =
      !!task.milestonesEnabled &&
      (sharedTasks.hasNonPositiveCheckpoint(task.milestones) ||
        sharedTasks.hasCheckpointAtOrAboveTimeGoal(task.milestones, sharedTasks.milestoneUnitSec(task), effectiveTimeGoalMinutes));
    els.msArea?.classList.toggle("isInvalid", noCheckpoints || invalidCheckpointTimes);

    const msRows = Array.from(els.msList?.querySelectorAll?.(".msRow") || []);
    const msSorted = Array.isArray(task.milestones) ? task.milestones.slice() : [];
    msRows.forEach((row, idx) => {
      const m = msSorted[idx];
      const invalid =
        !!task.milestonesEnabled &&
        !!m &&
        (!(Number(+m.hours) > 0) ||
          sharedTasks.isCheckpointAtOrAboveTimeGoal(m.hours, sharedTasks.milestoneUnitSec(task), effectiveTimeGoalMinutes));
      row.classList.toggle("isInvalid", invalid);
    });
  }

  function showEditValidationError(task: Task | null | undefined, msg: string) {
    if (!task) return;
    applyEditCheckpointValidationHighlights(task);
    if (els.editValidationError) {
      els.editValidationError.textContent = msg;
      els.editValidationError.classList.add("isOn");
    }
  }

  function formatPlannedStartOverlapMessage(tasks: Task[], candidate: Task, excludeTaskId: string) {
    const baseMessage = "This planned start overlaps another scheduled task.";
    const suggestion = findNextAvailableScheduleSlot(tasks, candidate, { excludeTaskId });
    return suggestion ? `${baseMessage} ${formatScheduleSlotSuggestion(suggestion)}` : baseMessage;
  }

  function setMilestoneUnitUi(unit: "hour" | "minute") {
    els.elapsedPadUnitHourBtn?.classList.toggle("isOn", unit === "hour");
    els.elapsedPadUnitMinuteBtn?.classList.toggle("isOn", unit === "minute");
  }

  function isEditMilestoneUnitDay(): boolean {
    return false;
  }

  function syncEditTaskColorPalette(t?: Task | null) {
    const selectedColor = normalizeTaskColor(t?.color);
    if (els.editTaskColorTrigger) {
      els.editTaskColorTrigger.classList.toggle("editTaskColorSwatchNone", !selectedColor);
      els.editTaskColorTrigger.style.setProperty("--task-color", selectedColor || "rgba(255,255,255,.18)");
    }
    const palette = els.editTaskColorPalette;
    if (!palette) return;
    const activeFamily =
      palette.getAttribute("data-active-family") ||
      getTaskColorFamilyForColor(selectedColor)?.id ||
      TASK_COLOR_FAMILIES[0].id;
    palette.setAttribute("data-active-family", activeFamily);
    if (!palette.getAttribute("data-view")) palette.setAttribute("data-view", "main");
    Array.from(palette.querySelectorAll<HTMLElement>("[data-task-color]")).forEach((button) => {
      const buttonColor = normalizeTaskColor(button.dataset.taskColor);
      const isSelected = buttonColor === selectedColor;
      button.classList.toggle("isSelected", isSelected);
      if (button.getAttribute("role") === "radio") {
        button.setAttribute("aria-checked", String(isSelected));
      }
    });
    Array.from(palette.querySelectorAll<HTMLElement>("[data-task-color-family]")).forEach((button) => {
      const isActive = button.dataset.taskColorFamily === activeFamily;
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", String(isActive));
      }
      button.classList.toggle("isActive", isActive);
    });
    Array.from(palette.querySelectorAll<HTMLElement>("[data-task-color-family-panel]")).forEach((panel) => {
      panel.hidden = panel.dataset.taskColorFamilyPanel !== activeFamily;
    });
  }

  function setEditTaskColorFamily(familyId: string | null | undefined, task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const nextFamily =
      TASK_COLOR_FAMILIES.find((family) => family.id === familyId)?.id ||
      getTaskColorFamilyForColor(currentTask?.color)?.id ||
      TASK_COLOR_FAMILIES[0].id;
    if (els.editTaskColorPalette) {
      els.editTaskColorPalette.setAttribute("data-active-family", nextFamily);
      els.editTaskColorPalette.setAttribute("data-view", "shades");
    }
    syncEditTaskColorPalette(currentTask);
  }

  function setEditTaskColorPopoverOpen(open: boolean) {
    if (els.editTaskColorPopover instanceof HTMLElement) {
      els.editTaskColorPopover.style.display = open ? "flex" : "none";
    }
    els.editTaskColorTrigger?.setAttribute("aria-expanded", String(open));
  }

  function getEditModalScrollBody(): HTMLElement | null {
    return (els.editOverlay as HTMLElement | null)?.querySelector?.(".editTaskModalBody") as HTMLElement | null;
  }

  function scrollEditModalBodyToReveal(target: HTMLElement | null | undefined, options?: { align?: "top" | "bottom" }) {
    if (!(target instanceof HTMLElement)) return;
    const scrollBody = getEditModalScrollBody();
    if (!(scrollBody instanceof HTMLElement)) return;
    const align = options?.align === "top" ? "top" : "bottom";
    const performScroll = () => {
      if (!target.isConnected) return;
      target.scrollIntoView({ behavior: "smooth", block: align === "top" ? "start" : "end", inline: "nearest" });
      window.requestAnimationFrame(() => {
        const bodyRect = scrollBody.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const padding = 16;
        const targetTop = targetRect.top - bodyRect.top + scrollBody.scrollTop;
        const targetBottom = targetRect.bottom - bodyRect.top + scrollBody.scrollTop;
        const visibleTop = scrollBody.scrollTop;
        const visibleBottom = visibleTop + scrollBody.clientHeight;
        if (targetBottom + padding > visibleBottom) {
          const nextTop = Math.max(0, targetBottom - scrollBody.clientHeight + padding);
          scrollBody.scrollTo({ top: nextTop, behavior: "smooth" });
          return;
        }
        if (targetTop - padding < visibleTop) {
          scrollBody.scrollTo({ top: Math.max(0, targetTop - padding), behavior: "smooth" });
        }
      });
    };
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(performScroll);
    });
    window.setTimeout(performScroll, 80);
  }

  function cloneTaskForEdit(task: Task): Task {
    return {
      ...task,
      color: normalizeTaskColor(task.color),
      plannedStartByDay: task.plannedStartByDay ? { ...task.plannedStartByDay } : null,
      milestones: Array.isArray(task.milestones)
        ? task.milestones.map((milestone) => ({
            ...milestone,
            id: String((milestone as { id?: string }).id || ""),
            createdSeq: Number.isFinite(Number((milestone as { createdSeq?: number }).createdSeq))
              ? Math.floor(Number((milestone as { createdSeq?: number }).createdSeq))
              : 0,
            description: String(milestone?.description || ""),
            alertsEnabled: milestone?.alertsEnabled !== false,
          }))
        : [],
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
    };
  }

  function hasAnyMilestoneAlertsEnabled(task: Task | null | undefined) {
    return !!task?.milestonesEnabled && Array.isArray(task.milestones) && task.milestones.some((milestone) => milestone?.alertsEnabled !== false);
  }

  function getEditTaskCheckpointAccentColor(task: Task | null | undefined) {
    return normalizeTaskColor(task?.color) || "#58e1ff";
  }

  function renderMilestoneEditor(t: Task) {
    if (!els.msList) return;
    els.msList.innerHTML = "";

    const ms = (t.milestones || []).slice();
    const unit = (t.milestoneTimeUnit === "minute" ? "minute" : "hour") as CheckpointSliderUnit;
    const timeGoalMinutes = getEditTaskTimeGoalMinutes();
    const sliderMax = getCheckpointSliderMaxMinutes(timeGoalMinutes);

    ms.forEach((m, idx) => {
      const clamped = clampCheckpointValueToTimeGoal(Number(m.hours) || 0, unit, timeGoalMinutes);
      m.hours = clamped.value;
      const row = document.createElement("div");
      row.className = "msRow";
      row.style.setProperty("--checkpoint-slider-accent", getEditTaskCheckpointAccentColor(t));
      (row as HTMLElement & { dataset: DOMStringMap }).dataset.msIndex = String(idx);

      row.innerHTML = `
        <button type="button" class="iconBtn checkpointBellBtn${m.alertsEnabled !== false ? " isOn" : ""}" data-action="toggleMsAlert" aria-label="${m.alertsEnabled !== false ? "Disable checkpoint alerts" : "Enable checkpoint alerts"}" aria-pressed="${m.alertsEnabled !== false ? "true" : "false"}" title="${m.alertsEnabled !== false ? "Checkpoint alerts on" : "Checkpoint alerts off"}">
          <span class="checkpointBellBtnIcon" aria-hidden="true"></span>
        </button>
        <div class="msSliderCluster">
          <div class="msSliderReadout" aria-live="polite">
            <span class="msSliderValue" data-field="value-label">${formatCheckpointSliderLabel(clamped.sliderMinutes)}</span>
            <span class="msSliderMeta" data-field="value-progress">${formatCheckpointSliderProgress(clamped.sliderMinutes, timeGoalMinutes)}</span>
          </div>
          <div class="msSliderTrackRow">
            <span class="msSliderBound" aria-hidden="true">Start</span>
            <input
              class="msSliderInput"
              data-field="value-slider"
              type="range"
              min="1"
              max="${sliderMax}"
              step="1"
              value="${clamped.sliderMinutes}"
              aria-label="Checkpoint time"
            />
            <span class="msSliderBound" aria-hidden="true">Goal</span>
          </div>
        </div>
        <button type="button" class="iconBtn checkpointDeleteBtn" title="Remove checkpoint" aria-label="Remove checkpoint" data-action="rmMs">&times;</button>
      `;

      const bell = row.querySelector('[data-action="toggleMsAlert"]') as HTMLButtonElement | null;
      ctx.on(bell, "click", () => {
        m.alertsEnabled = m.alertsEnabled === false;
        t.milestones = ms;
        syncEditCheckpointAlertUi(t);
        renderMilestoneEditor(t);
      });

      const sliderInput = row.querySelector('[data-field="value-slider"]') as HTMLInputElement | null;
      const valueLabel = row.querySelector('[data-field="value-label"]') as HTMLElement | null;
      const valueProgress = row.querySelector('[data-field="value-progress"]') as HTMLElement | null;
      const syncCheckpointValue = () => {
        const nextSliderMinutes = Number(sliderInput?.value || clamped.sliderMinutes) || clamped.sliderMinutes;
        const next = clampCheckpointValueToTimeGoal(sliderMinutesToCheckpointValue(nextSliderMinutes, unit), unit, timeGoalMinutes);
        if (sliderInput) sliderInput.value = String(next.sliderMinutes);
        if (valueLabel) valueLabel.textContent = formatCheckpointSliderLabel(next.sliderMinutes);
        if (valueProgress) valueProgress.textContent = formatCheckpointSliderProgress(next.sliderMinutes, timeGoalMinutes);
        m.hours = next.value;
        t.milestones = ms;
        clearEditValidationState();
        syncEditCheckpointAlertUi(t);
        syncEditSaveAvailability(t);
      };
      ctx.on(sliderInput, "input", syncCheckpointValue);
      ctx.on(sliderInput, "change", syncCheckpointValue);

      const rm = row.querySelector('[data-action="rmMs"]') as HTMLElement | null;
      ctx.on(rm, "click", () => {
        ms.splice(idx, 1);
        t.milestones = ms;
        renderMilestoneEditor(t);
      });

      els.msList?.appendChild(row);
    });

    t.milestones = ms;
    syncEditSaveAvailability(t);
  }

  function finalizeEditSave(sourceTask: Task, t: Task) {
    const timeGoalEnabledForSave = true;
    t.color = normalizeTaskColor(t.color);
    const checkpointingEnabledForSave = timeGoalEnabledForSave && !!t.milestonesEnabled;
    const hasEnabledMilestoneAlerts = checkpointingEnabledForSave && hasAnyMilestoneAlertsEnabled(t);
    t.checkpointSoundEnabled = hasEnabledMilestoneAlerts;
    t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
    t.checkpointToastEnabled = hasEnabledMilestoneAlerts;
    t.presetIntervalsEnabled = false;
    t.presetIntervalValue = 0;
    t.timeGoalAction = "confirmModal";
    t.timeGoalEnabled = timeGoalEnabledForSave;
    if (!t.timeGoalEnabled) t.milestonesEnabled = false;
    t.timeGoalValue = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    t.timeGoalUnit = ctx.getEditTaskDurationUnit();
    const timeGoalSaveFields = getEditTimeGoalSaveFields(
      t.taskType,
      t.timeGoalValue,
      t.timeGoalUnit,
      ctx.getEditTaskDurationPeriod()
    );
    t.timeGoalPeriod = timeGoalSaveFields.timeGoalPeriod;
    t.timeGoalMinutes = timeGoalSaveFields.timeGoalMinutes;
    t.milestones = (Array.isArray(t.milestones) ? t.milestones : []).map((milestone) => ({
      ...milestone,
      description: "",
    }));
    t.plannedStartPushRemindersEnabled = !!els.editPlannedStartPushReminders?.checked;
    if (t.taskType === "once-off") {
      const onceOffDay = String(els.editTaskOnceOffDaySelect?.value || t.onceOffDay || t.plannedStartDay || "mon").trim().toLowerCase() as ScheduleDay;
      const plannedTime = String(readEditPlannedStartValueFromSelectors() || t.plannedStartTime || "09:00").trim() || "09:00";
      t.onceOffDay = onceOffDay;
      t.onceOffTargetDate = resolveNextScheduleDayDate(onceOffDay);
      t.plannedStartOpenEnded = false;
      t.plannedStartDay = onceOffDay;
      t.plannedStartTime = plannedTime;
      t.plannedStartByDay = { [onceOffDay]: plannedTime };
    } else {
      t.onceOffDay = null;
      t.onceOffTargetDate = null;
      normalizeRecurringScheduleFieldsForSave(t, sourceTask);
    }
    sharedTasks.ensureMilestoneIdentity(t);
    t.milestones = ctx.sortMilestones(t.milestones);
    const sourceTaskId = String(sourceTask.id || "");
    if (findScheduleOverlap(ctx.getTasks(), t, { excludeTaskId: sourceTaskId })) {
      ctx.syncEditSaveAvailability(t);
      ctx.showEditValidationError(t, formatPlannedStartOverlapMessage(ctx.getTasks(), t, sourceTaskId));
      return false;
    }
    delete (t as Task & { mode?: string }).mode;
    Object.assign(sourceTask, ctx.cloneTaskForEdit(t));
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
    ctx.render();
    return true;
  }

  function finalizeUnscheduledEditSave(sourceTask: Task, t: Task) {
    t.name = (els.editName?.value || "").trim() || t.name;
    t.color = normalizeTaskColor(t.color);
    clearTaskScheduleConfig(t);
    delete (t as Task & { mode?: string }).mode;
    Object.assign(sourceTask, ctx.cloneTaskForEdit(t));
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
    ctx.render();
    return true;
  }

  function syncEditCheckpointAlertUi(t: Task) {
    sharedTasks.ensureMilestoneIdentity(t);
    const hasActiveTimeGoal = editTaskHasActiveTimeGoal();
    const checkpointingEnabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    const derivedAlertState = sharedTasks.deriveCheckpointAlertEnabledState(t);
    t.checkpointSoundEnabled = checkpointingEnabled && derivedAlertState.soundEnabled;
    t.checkpointToastEnabled = checkpointingEnabled && derivedAlertState.toastEnabled;
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.value = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
      els.editCheckpointSoundModeSelect.disabled =
        !checkpointingEnabled || !ctx.getCheckpointAlertSoundEnabled() || !t.checkpointSoundEnabled;
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.value = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
      els.editCheckpointToastModeSelect.disabled =
        !checkpointingEnabled || !ctx.getCheckpointAlertToastEnabled() || !t.checkpointToastEnabled;
    }
    els.editCheckpointSoundModeField?.classList.toggle("isDisabled", !checkpointingEnabled || !ctx.getCheckpointAlertSoundEnabled() || !t.checkpointSoundEnabled);
    els.editCheckpointToastModeField?.classList.toggle("isDisabled", !checkpointingEnabled || !ctx.getCheckpointAlertToastEnabled() || !t.checkpointToastEnabled);
    els.editTimerSettingsGroup?.classList.toggle("isHidden", !hasActiveTimeGoal);
  }

  function syncEditMilestoneSectionUi(t: Task) {
    const hasActiveTimeGoal = editTaskHasActiveTimeGoal();
    const enabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    if (els.msToggle instanceof HTMLInputElement && els.msToggle.type === "checkbox") {
      els.msToggle.checked = enabled;
      els.msToggle.disabled = !hasActiveTimeGoal;
    } else {
      els.msToggle?.classList.toggle("on", enabled);
    }
    els.msToggle?.setAttribute("aria-checked", String(enabled));
    els.msToggle?.setAttribute("aria-disabled", !hasActiveTimeGoal ? "true" : "false");
    els.msArea?.classList.toggle("on", enabled);
    els.msArea?.classList.remove("isHidden");
    els.msArea?.classList.toggle("isDisabled", !enabled);
    els.msArea?.classList.toggle("isGoalRequired", !hasActiveTimeGoal);
    els.msList?.parentElement?.classList.toggle("isHidden", !enabled);
  }

  function ensureEditDefaultCheckpoint(t: Task) {
    if (!editTaskHasActiveTimeGoal()) return false;
    if (Array.isArray(t.milestones) && t.milestones.length > 0) return false;
    t.milestones = t.milestones || [];
    sharedTasks.ensureMilestoneIdentity(t);
    const nextSeq = sharedTasks.getPresetIntervalNextSeqNum(t);
    t.milestones.push({ id: sharedTasks.createId(), createdSeq: nextSeq, hours: 0, description: "", alertsEnabled: true });
    t.presetIntervalLastMilestoneId = t.milestones[t.milestones.length - 1]?.id || null;
    t.presetIntervalNextSeq = nextSeq + 1;
    renderMilestoneEditor(t);
    return true;
  }

  function refreshEditCheckpointEditorForTimeGoalChange(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    if (!currentTask) return;
    syncEditMilestoneSectionUi(currentTask);
    renderMilestoneEditor(currentTask);
    syncEditCheckpointAlertUi(currentTask);
    syncEditSaveAvailability(currentTask);
  }

  function buildEditDraftSnapshot(task: Task | null | undefined) {
    if (!task) return "";
    const milestones = ctx.sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : []).map((m) => ({
      id: String((m as { id?: string }).id || ""),
      createdSeq: Number.isFinite(+(m as { createdSeq?: number }).createdSeq!) ? Math.floor(+(m as { createdSeq?: number }).createdSeq!) : 0,
      hours: Number.isFinite(+m.hours) ? +m.hours : 0,
      description: String(m.description || ""),
      alertsEnabled: m.alertsEnabled !== false,
    }));
    const hasEnabledMilestoneAlerts = hasAnyMilestoneAlertsEnabled(task);
    return JSON.stringify({
      name: String(els.editName?.value || task.name || "").trim(),
      scheduleEnabled: editTaskScheduleEnabled,
      plannedStartTime: String(task.plannedStartTime || "").trim() || null,
      color: normalizeTaskColor(task.color),
      plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
      timeGoalEnabled: true,
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: ctx.getEditTaskDurationUnit(),
      timeGoalPeriod: ctx.getEditTaskDurationPeriod(),
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
      milestoneTimeUnit: task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestonesEnabled: !!task.milestonesEnabled,
      milestones,
      checkpointSoundEnabled: hasEnabledMilestoneAlerts,
      checkpointSoundMode: els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: hasEnabledMilestoneAlerts,
      checkpointToastMode: els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s",
      timeGoalAction: "confirmModal",
      presetIntervalsEnabled: false,
      presetIntervalValue: 0,
    });
  }

  function syncEditSaveAvailability(t?: Task | null) {
    const task = t || getCurrentEditTask();
    if (!els.saveEditBtn) return;
    clearEditValidationState();
    if (!task) {
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.title = "";
      return;
    }
    if (!editTaskScheduleEnabled) {
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      els.saveEditBtn.disabled = false;
      els.saveEditBtn.title = "Save Changes";
      return;
    }
    const invalidTimeGoal = !validateEditTimeGoal();
    const invalidOnceOffDay = !validateEditOnceOffDay(task);
    const aggregateValidation = getEditAggregateTimeGoalValidation(task);
    const checkpointingActive = !!task.milestonesEnabled && editTaskHasActiveTimeGoal();
    const noCheckpoints = checkpointingActive && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const invalidCheckpointTimes =
      checkpointingActive &&
      (sharedTasks.hasNonPositiveCheckpoint(task.milestones) ||
        sharedTasks.hasCheckpointAtOrAboveTimeGoal(task.milestones, sharedTasks.milestoneUnitSec(task), getEditTaskTimeGoalMinutes()));
    const blocked = invalidTimeGoal || invalidOnceOffDay || !!aggregateValidation?.shouldBlock || noCheckpoints || invalidCheckpointTimes;
    els.saveEditBtn.disabled = blocked;
    els.saveEditBtn.title = blocked ? "Resolve validation issues before saving" : "Save Changes";
    if (!blocked) return;
    applyEditCheckpointValidationHighlights(task);
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (ctx.getElapsedPadDraft() || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
  }

  function setCheckpointUnitForTask(task: Task | null | undefined, nextUnit: "hour" | "minute") {
    if (!task) return;
    task.milestoneTimeUnit = nextUnit;
    setMilestoneUnitUi(nextUnit);
    if (els.elapsedPadTitle) {
      els.elapsedPadTitle.textContent = `Set Checkpoint <${nextUnit === "minute" ? "minutes" : "hours"}>`;
    }
  }

  function openElapsedPadForMilestone(
    task: Task,
    milestone: { hours: number; description: string },
    ms: Task["milestones"],
    onApplied?: () => void
  ) {
    if (!els.elapsedPadOverlay) return;
    ctx.setElapsedPadTarget(null);
    ctx.setElapsedPadMilestoneRef({ task, milestone, ms, onApplied });
    const original = String(+milestone.hours || 0);
    ctx.setElapsedPadOriginal(original);
    ctx.setElapsedPadDraft(original);
    if (els.elapsedPadTitle) {
      const unit = task?.milestoneTimeUnit === "minute" ? "minutes" : "hours";
      els.elapsedPadTitle.textContent = `Set Checkpoint <${unit}>`;
    }
    setMilestoneUnitUi(task?.milestoneTimeUnit === "minute" ? "minute" : "hour");
    clearElapsedPadError();
    renderElapsedPadDisplay();
    (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
  }

  function closeElapsedPad(applyValue: boolean) {
    const elapsedPadTarget = ctx.getElapsedPadTarget();
    const elapsedPadMilestoneRef = ctx.getElapsedPadMilestoneRef();
    const elapsedPadDraft = ctx.getElapsedPadDraft();
    const elapsedPadOriginal = ctx.getElapsedPadOriginal();
    if (applyValue && (elapsedPadTarget || elapsedPadMilestoneRef)) {
      const valid =
        elapsedPadMilestoneRef && !elapsedPadTarget
          ? (() => {
              const parsed = parseFloat(elapsedPadDraft || "");
              if (!Number.isFinite(parsed) || isNaN(parsed) || parsed < 0) return null;
              return String(parsed);
            })()
          : null;
      if (valid == null) {
        setElapsedPadError("Enter a valid number");
        return;
      }
      if (elapsedPadTarget) {
        elapsedPadTarget.value = valid;
      } else if (elapsedPadMilestoneRef) {
        const nextHours = Number(valid);
        const isEditDraftMilestone = elapsedPadMilestoneRef.task === getCurrentEditTask();
        const timeGoalMinutes = isEditDraftMilestone ? ctx.getEditTaskTimeGoalMinutes() : ctx.getAddTaskTimeGoalMinutesState();
        if (sharedTasks.isCheckpointAtOrAboveTimeGoal(nextHours, sharedTasks.milestoneUnitSec(elapsedPadMilestoneRef.task), timeGoalMinutes)) {
          const timeGoalText = sharedTasks.formatCheckpointTimeGoalText(elapsedPadMilestoneRef.task, {
            timeGoalMinutes,
            forEditDraft: isEditDraftMilestone,
          });
          setElapsedPadError(`Checkpoint must be less than the time goal of ${timeGoalText}`);
          return;
        }
        elapsedPadMilestoneRef.milestone.hours = nextHours;
        elapsedPadMilestoneRef.task.milestones = elapsedPadMilestoneRef.ms;
        if (elapsedPadMilestoneRef.onApplied) elapsedPadMilestoneRef.onApplied();
        else ctx.renderMilestoneEditor(elapsedPadMilestoneRef.task);
      }
    } else if (!applyValue && elapsedPadTarget) {
      elapsedPadTarget.value = elapsedPadOriginal;
    }
    clearElapsedPadError();
    if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "none";
    const editIndex = ctx.getEditIndex();
    const tasks = ctx.getTasks();
    if (editIndex != null && tasks[editIndex]) {
      ctx.syncEditCheckpointAlertUi(tasks[editIndex]);
      ctx.syncEditSaveAvailability(tasks[editIndex]);
    }
    ctx.setElapsedPadTarget(null);
    ctx.setElapsedPadMilestoneRef(null);
    ctx.setElapsedPadDraft("");
    ctx.setElapsedPadOriginal("");
  }

  function padAppendDigit(digit: string) {
    clearElapsedPadError();
    const raw = `${ctx.getElapsedPadDraft() || ""}${digit}`;
    const next = raw.includes(".") ? raw : raw.replace(/^0+(?=\d)/, "");
    ctx.setElapsedPadDraft(next.slice(0, 6) || "0");
    renderElapsedPadDisplay();
  }

  function padAppendDot() {
    clearElapsedPadError();
    if (!ctx.getElapsedPadMilestoneRef() || ctx.getElapsedPadTarget()) return;
    const current = ctx.getElapsedPadDraft() || "0";
    if (current.includes(".")) return;
    ctx.setElapsedPadDraft(`${current}.`);
    renderElapsedPadDisplay();
  }

  function padBackspace() {
    clearElapsedPadError();
    const next = (ctx.getElapsedPadDraft() || "").slice(0, -1);
    ctx.setElapsedPadDraft(next || "0");
    renderElapsedPadDisplay();
  }

  function padClear() {
    clearElapsedPadError();
    ctx.setElapsedPadDraft("0");
    renderElapsedPadDisplay();
  }

  function openEdit(i: number, sourceEl?: HTMLElement | null) {
    const sourceTask = ctx.getTasks()[i];
    if (!sourceTask) return;
    const t = ctx.cloneTaskForEdit(sourceTask);
    editTaskScheduleRestoreSnapshot = ctx.cloneTaskForEdit(sourceTask);
    editTaskScheduleEnabled = taskHasMeaningfulScheduleConfig(sourceTask);
    t.plannedStartPushRemindersEnabled = t.plannedStartPushRemindersEnabled !== false;
    t.milestoneTimeUnit = t.milestoneTimeUnit === "minute" ? "minute" : "hour";
    ctx.setEditIndex(i);
    ctx.setEditTaskDraft(t);
    if (els.editName) els.editName.value = t.name || "";
    if (els.editTaskOnceOffDaySelect) els.editTaskOnceOffDaySelect.value = String(t.onceOffDay || t.plannedStartDay || "mon");
    syncEditTaskScheduleToggleUi();
    syncEditTaskTypeUi(t);
    syncEditTaskColorPalette(t);
    syncEditPlannedStartSelectors(t);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
    ctx.setEditTaskDurationUnit(t.timeGoalUnit === "minute" ? "minute" : "hour");
    ctx.setEditTaskDurationPeriod(t.timeGoalPeriod === "day" ? "day" : "week");
    ctx.syncEditTaskTimeGoalUi(t);
    ctx.syncEditCheckpointAlertUi(t);
    ctx.syncEditSaveAvailability(t);
    ctx.syncEditMilestoneSectionUi(t);
    ctx.setMilestoneUnitUi(t.milestoneTimeUnit === "minute" ? "minute" : "hour");
    ctx.renderMilestoneEditor(t);
    sharedTasks.ensureMilestoneIdentity(t);
    ctx.syncEditCheckpointAlertUi(t);
    ctx.setEditDraftSnapshot(ctx.buildEditDraftSnapshot(t));
    ctx.clearEditValidationState();
    ctx.syncEditSaveAvailability(t);
    showEditOverlay(sourceEl);
  }

  function finishUnscheduledEditSave(sourceTask: Task, t: Task) {
    if (!finalizeUnscheduledEditSave(sourceTask, t)) return false;
    hideEditOverlay();
    setEditTaskColorPopoverOpen(false);
    ctx.clearEditValidationState();
    closeElapsedPad(false);
    ctx.setEditIndex(null);
    ctx.setEditTaskDraft(null);
    ctx.setEditDraftSnapshot("");
    editTaskScheduleRestoreSnapshot = null;
    return true;
  }

  function confirmClearTaskSchedule(sourceTask: Task, t: Task, onCancel?: () => void) {
    els.confirmOverlay?.classList.add("isClearTaskScheduleConfirm");
    return void ctx.confirm(
      "Clear Task Schedule",
      "This will clear the time goal, schedule(s) and checkpoints for this task.",
      {
        okLabel: "Save & Close",
        cancelLabel: "Cancel",
        onOk: () => {
          ctx.closeConfirm();
          finishUnscheduledEditSave(sourceTask, t);
        },
        onCancel: () => {
          ctx.closeConfirm();
          onCancel?.();
        },
      }
    );
  }

  function closeEdit(saveChanges: boolean) {
    const editIndex = ctx.getEditIndex();
    const sourceTask = editIndex != null ? ctx.getTasks()[editIndex] : null;
    const t = getCurrentEditTask();
    if (saveChanges && t && sourceTask) {
      if (!editTaskScheduleEnabled) {
        if (taskHasMeaningfulScheduleConfig(sourceTask)) {
          return confirmClearTaskSchedule(sourceTask, t);
        }
        finishUnscheduledEditSave(sourceTask, t);
        return;
      }
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      const aggregateValidation = getEditAggregateTimeGoalValidation(t);
      if (!validateEditOnceOffDay(t)) {
        return void ctx.showEditValidationError(t, "Choose a day for this once-off task.");
      }
      if (!ctx.validateEditTimeGoal()) {
        return void ctx.showEditValidationError(
          t,
          aggregateValidation?.shouldBlock ? aggregateValidation.message : "Enter a valid time goal."
        );
      }
      const checkpointingActiveForSave = !!t.milestonesEnabled && ctx.editTaskHasActiveTimeGoal();
      if (checkpointingActiveForSave && (!Array.isArray(t.milestones) || t.milestones.length === 0)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Add at least 1 timer checkpoint before saving.");
      }
      if (checkpointingActiveForSave && sharedTasks.hasNonPositiveCheckpoint(t.milestones)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be greater than 0.");
      }
      if (
        checkpointingActiveForSave &&
        sharedTasks.hasCheckpointAtOrAboveTimeGoal(t.milestones, sharedTasks.milestoneUnitSec(t), ctx.getEditTaskTimeGoalMinutes())
      ) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be less than the time goal.");
      }
      t.name = (els.editName?.value || "").trim() || t.name;
      t.plannedStartOpenEnded = false;
      t.plannedStartTime = readEditPlannedStartValueFromSelectors();
      if (hasTaskMixedScheduleTimes(sourceTask)) {
        const sharedTime = readEditPlannedStartValueFromSelectors();
        const scheduledDays = getTaskScheduledDays(sourceTask);
        if (scheduledDays.length > 1) {
          els.confirmOverlay?.classList.add("isApplySharedScheduleConfirm");
          return void ctx.confirm(
            "Apply Shared Schedule",
            `This task will use the same planned start time on each scheduled day. Apply ${sharedTime} to all scheduled days?`,
            {
              okLabel: "Apply",
              cancelLabel: "Cancel",
              onOk: () => {
                const nextByDay = Object.fromEntries(
                  scheduledDays.map((day: NonNullable<Task["plannedStartDay"]>) => [day, sharedTime])
                ) as NonNullable<Task["plannedStartByDay"]>;
                t.plannedStartByDay = nextByDay;
                t.plannedStartOpenEnded = false;
                t.plannedStartTime = sharedTime;
                syncLegacyPlannedStartFields(t, nextByDay);
                ctx.closeConfirm();
                if (!finalizeEditSave(sourceTask, t)) return;
                hideEditOverlay();
                ctx.clearEditValidationState();
                closeElapsedPad(false);
                ctx.setEditIndex(null);
                ctx.setEditTaskDraft(null);
                ctx.setEditDraftSnapshot("");
              },
              onCancel: () => ctx.closeConfirm(),
            }
          );
        }
      }
      if (!finalizeEditSave(sourceTask, t)) return;
    }
    hideEditOverlay();
    setEditTaskColorPopoverOpen(false);
    ctx.clearEditValidationState();
    closeElapsedPad(false);
    ctx.setEditIndex(null);
    ctx.setEditTaskDraft(null);
    ctx.setEditDraftSnapshot("");
    editTaskScheduleRestoreSnapshot = null;
  }

  function handleEditNameInput() {
    const t = getCurrentEditTask();
    if (!t) return;
    ctx.syncEditTaskDurationReadout(t);
    ctx.syncEditSaveAvailability(t);
  }

  function handleElapsedPadOverlayClick(e: any) {
    if (e.target === els.elapsedPadOverlay) closeElapsedPad(false);
  }

  function handleElapsedPadKeyClick(event: any) {
    const el = event?.currentTarget as HTMLElement | null;
    if (!el) return;
    const digit = el.getAttribute("data-pad-digit");
    const action = el.getAttribute("data-pad-action");
    if (digit != null) return void padAppendDigit(digit);
    if (action === "back") return void padBackspace();
    if (action === "dot") return void padAppendDot();
    if (action === "clear") padClear();
  }

  function registerEditTaskEvents() {
    ctx.on(els.cancelEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(false);
    });
    ctx.on(els.saveEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(true);
    });
    ctx.on(els.editName, "input", handleEditNameInput);
    ctx.on(els.editTaskScheduleToggle, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      const editIndex = ctx.getEditIndex();
      const sourceTask = editIndex != null ? ctx.getTasks()[editIndex] : null;
      editTaskScheduleEnabled = !!els.editTaskScheduleToggle?.checked;
      if (editTaskScheduleEnabled && editTaskScheduleRestoreSnapshot) {
        restoreEditScheduleFieldsFromSnapshot(t, editTaskScheduleRestoreSnapshot);
        if (els.editTaskOnceOffDaySelect) els.editTaskOnceOffDaySelect.value = String(t.onceOffDay || t.plannedStartDay || "mon");
        if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
        ctx.setEditTaskDurationUnit(t.timeGoalUnit === "minute" ? "minute" : "hour");
        ctx.setEditTaskDurationPeriod(t.timeGoalPeriod === "day" ? "day" : "week");
        syncEditTaskTypeUi(t);
        syncEditPlannedStartSelectors(t);
        ctx.setMilestoneUnitUi(t.milestoneTimeUnit === "minute" ? "minute" : "hour");
        ctx.renderMilestoneEditor(t);
      }
      syncEditTaskScheduleToggleUi();
      if (editTaskScheduleEnabled) {
        ctx.syncEditTaskTimeGoalUi(t);
        ctx.syncEditCheckpointAlertUi(t);
        ctx.syncEditMilestoneSectionUi(t);
      }
      ctx.syncEditSaveAvailability(t);
      if (!editTaskScheduleEnabled && sourceTask) {
        confirmClearTaskSchedule(sourceTask, t, () => {
          editTaskScheduleEnabled = true;
          if (editTaskScheduleRestoreSnapshot) {
            restoreEditScheduleFieldsFromSnapshot(t, editTaskScheduleRestoreSnapshot);
            if (els.editTaskOnceOffDaySelect) els.editTaskOnceOffDaySelect.value = String(t.onceOffDay || t.plannedStartDay || "mon");
            if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
            ctx.setEditTaskDurationUnit(t.timeGoalUnit === "minute" ? "minute" : "hour");
            ctx.setEditTaskDurationPeriod(t.timeGoalPeriod === "day" ? "day" : "week");
            syncEditTaskTypeUi(t);
            syncEditPlannedStartSelectors(t);
            ctx.setMilestoneUnitUi(t.milestoneTimeUnit === "minute" ? "minute" : "hour");
            ctx.renderMilestoneEditor(t);
          }
          syncEditTaskScheduleToggleUi();
          ctx.syncEditTaskTimeGoalUi(t);
          ctx.syncEditCheckpointAlertUi(t);
          ctx.syncEditMilestoneSectionUi(t);
          ctx.syncEditSaveAvailability(t);
        });
      }
    });
    ctx.on(els.editTaskColorTrigger, "click", (event: any) => {
      event?.preventDefault?.();
      const isOpen = els.editTaskColorPopover instanceof HTMLElement && els.editTaskColorPopover.style.display === "flex";
      if (!isOpen && els.editTaskColorPalette) {
        const nextFamily =
          getTaskColorFamilyForColor(getCurrentEditTask()?.color)?.id ||
          els.editTaskColorPalette.getAttribute("data-active-family") ||
          TASK_COLOR_FAMILIES[0].id;
        els.editTaskColorPalette.setAttribute("data-active-family", nextFamily);
        els.editTaskColorPalette.setAttribute("data-view", "main");
        syncEditTaskColorPalette(getCurrentEditTask());
      }
      setEditTaskColorPopoverOpen(!isOpen);
    });
    ctx.on(els.editTaskColorPopover, "click", (event: any) => {
      if (event?.target === els.editTaskColorPopover) setEditTaskColorPopoverOpen(false);
    });
    ctx.on(els.editTaskColorPalette, "click", (event: any) => {
      const t = getCurrentEditTask();
      const familyButton = (event?.target as HTMLElement | null)?.closest?.('[data-task-color-family][role="tab"]') as HTMLElement | null;
      if (familyButton && els.editTaskColorPalette?.contains(familyButton)) {
        setEditTaskColorFamily(familyButton.dataset.taskColorFamily);
        return;
      }
      const backButton = (event?.target as HTMLElement | null)?.closest?.("[data-task-color-back='true']") as HTMLElement | null;
      if (backButton && els.editTaskColorPalette?.contains(backButton)) {
        els.editTaskColorPalette.setAttribute("data-view", "main");
        syncEditTaskColorPalette(t);
        return;
      }
      const button = (event?.target as HTMLElement | null)?.closest?.("[data-task-color]") as HTMLElement | null;
      if (!button || !t || !els.editTaskColorPalette?.contains(button)) return;
      t.color = normalizeTaskColor(button.dataset.taskColor);
      if (Array.isArray(t.milestones) && t.milestones.length > 0) {
        renderMilestoneEditor(t);
      }
      syncEditTaskColorPalette(t);
      syncEditSaveAvailability(t);
      setEditTaskColorPopoverOpen(false);
    });
    const editTaskAdvancedMenu = document.getElementById("editTaskAdvancedMenu") as HTMLDetailsElement | null;
    ctx.on(editTaskAdvancedMenu, "toggle", () => {
      if (!editTaskAdvancedMenu?.open) return;
      scrollEditModalBodyToReveal(
        (editTaskAdvancedMenu.querySelector(".editTaskAdvancedBody") as HTMLElement | null) || editTaskAdvancedMenu,
        { align: "bottom" }
      );
    });
    ctx.on(els.editTaskTypeRecurringBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || t.taskType === "recurring") return;
      t.taskType = "recurring";
      t.onceOffDay = null;
      t.onceOffTargetDate = null;
      syncEditTaskTypeUi(t);
      syncEditPlannedStartSelectors(t);
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskTypeOnceOffBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || t.taskType === "once-off") return;
      t.taskType = "once-off";
      t.onceOffDay = (String(t.onceOffDay || t.plannedStartDay || "mon").trim().toLowerCase() || "mon") as ScheduleDay;
      syncEditTaskTypeUi(t);
      syncEditPlannedStartSelectors(t);
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskOnceOffDaySelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.onceOffDay = String(els.editTaskOnceOffDaySelect?.value || "mon").trim().toLowerCase() as ScheduleDay;
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPlannedStartHourSelect, "change", syncEditPlannedStartValueFromSelectors);
    ctx.on(els.editPlannedStartMinuteSelect, "change", syncEditPlannedStartValueFromSelectors);
    ctx.on(els.editPlannedStartMeridiemSelect, "change", syncEditPlannedStartValueFromSelectors);
    ctx.on(els.editPlannedStartPushReminders, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.plannedStartPushRemindersEnabled = !!els.editPlannedStartPushReminders?.checked;
      syncEditPlannedStartSelectors(t);
      syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskDurationValueInput, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskDurationValueInput, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskDurationUnitMinute, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      ctx.setEditTaskDurationUnit("minute");
      t.milestoneTimeUnit = "minute";
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskDurationUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      ctx.setEditTaskDurationUnit("hour");
      t.milestoneTimeUnit = "hour";
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskDurationPeriodDay, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      ctx.setEditTaskDurationPeriod("day");
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editTaskDurationPeriodWeek, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      ctx.setEditTaskDurationPeriod("week");
      ctx.syncEditTaskTimeGoalUi(t);
      refreshEditCheckpointEditorForTimeGoalChange(t);
    });
    ctx.on(els.editCheckpointSoundModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointToastModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointToastMode = els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.msToggle, "change", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      t.milestonesEnabled =
        els.msToggle instanceof HTMLInputElement && els.msToggle.type === "checkbox" ? els.msToggle.checked : !t.milestonesEnabled;
      if (t.milestonesEnabled) ensureEditDefaultCheckpoint(t);
      ctx.syncEditMilestoneSectionUi(t);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
      if (!t.milestonesEnabled) {
        ctx.syncEditMilestoneSectionUi(t);
        return;
      }
      scrollEditModalBodyToReveal((els.addMsBtn as HTMLElement | null) || (els.msList?.parentElement as HTMLElement | null), {
        align: "bottom",
      });
    });
    ctx.on(els.addMsBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) {
        if (t) ctx.syncEditCheckpointAlertUi(t);
        return;
      }
      t.milestones = t.milestones || [];
      sharedTasks.ensureMilestoneIdentity(t);
      const nextSeq = sharedTasks.getPresetIntervalNextSeqNum(t);
      t.milestones.push({ id: sharedTasks.createId(), createdSeq: nextSeq, hours: 0, description: "", alertsEnabled: true });
      t.presetIntervalLastMilestoneId = t.milestones[t.milestones.length - 1]?.id || null;
      t.presetIntervalNextSeq = nextSeq + 1;
      ctx.renderMilestoneEditor(t);
      ctx.clearEditValidationState();
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });

    ctx.on(els.elapsedPadOverlay, "click", handleElapsedPadOverlayClick);
    ctx.on(els.elapsedPadCancelBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeElapsedPad(false);
    });
    ctx.on(els.elapsedPadDoneBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeElapsedPad(true);
    });
    ctx.on(els.elapsedPadUnitHourBtn, "click", () => {
      const milestoneRef = ctx.getElapsedPadMilestoneRef();
      if (!milestoneRef) return;
      setCheckpointUnitForTask(milestoneRef.task, "hour");
      if (milestoneRef.onApplied) milestoneRef.onApplied();
      else ctx.renderMilestoneEditor(milestoneRef.task);
    });
    ctx.on(els.elapsedPadUnitMinuteBtn, "click", () => {
      const milestoneRef = ctx.getElapsedPadMilestoneRef();
      if (!milestoneRef) return;
      setCheckpointUnitForTask(milestoneRef.task, "minute");
      if (milestoneRef.onApplied) milestoneRef.onApplied();
      else ctx.renderMilestoneEditor(milestoneRef.task);
    });
    const padKeys = Array.from(document.querySelectorAll("#elapsedPadOverlay [data-pad-digit], #elapsedPadOverlay [data-pad-action]"));
    padKeys.forEach((el) => ctx.on(el as HTMLElement, "click", handleElapsedPadKeyClick));
  }

  return {
    openEdit,
    closeEdit,
    openElapsedPadForMilestone,
    closeElapsedPad,
    getCurrentEditTask,
    clearEditValidationState,
    syncEditTaskDurationReadout,
    syncEditTaskTimeGoalUi,
    validateEditTimeGoal,
    getEditTaskTimeGoalMinutes,
    getEditTaskTimeGoalMinutesFor,
    isEditTimeGoalEnabled,
    setEditTimeGoalEnabled,
    editTaskHasActiveTimeGoal,
    applyEditCheckpointValidationHighlights,
    showEditValidationError,
    setMilestoneUnitUi,
    cloneTaskForEdit,
    renderMilestoneEditor,
    syncEditCheckpointAlertUi,
    syncEditMilestoneSectionUi,
    buildEditDraftSnapshot,
    syncEditSaveAvailability,
    isEditMilestoneUnitDay,
    registerEditTaskEvents,
  };
}
