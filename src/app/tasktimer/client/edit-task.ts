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
  getTaskScheduledDays,
  hasTaskMixedScheduleTimes,
  hasTaskScheduledSlots,
  normalizeScheduleStoredTime,
  normalizeTaskPlannedStartByDay,
  resolveNextScheduleDayDate,
  SCHEDULE_DAY_ORDER,
  type ScheduleDay,
  syncLegacyPlannedStartFields,
} from "../lib/schedule-placement";
import type { TaskTimerEditTaskContext } from "./context";
import { readPlannedStartValueFromSelectors, syncPlannedStartSelectors } from "./planned-start";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerEditTask(ctx: TaskTimerEditTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  const EDIT_OVERLAY_SLIDE_MS = 260;
  let editOverlayHideTimer: number | null = null;
  let editOverlayOpeningTimer: number | null = null;
  let editOverlayOriginRect: { left: number; top: number; width: number; height: number } | null = null;

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

  function syncEditPlannedStartSelectors(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const onceOff = currentTask?.taskType === "once-off";
    const openEnded = !!currentTask?.plannedStartOpenEnded;
    const disableForUnscheduledFlexible = !onceOff && openEnded && !hasTaskScheduledSlots(currentTask || ({} as Task));
    const pushRemindersEnabled = currentTask?.plannedStartPushRemindersEnabled !== false;
    syncPlannedStartSelectors(
      {
        hourSelect: els.editPlannedStartHourSelect,
        minuteSelect: els.editPlannedStartMinuteSelect,
        meridiemSelect: els.editPlannedStartMeridiemSelect,
      },
      currentTask?.plannedStartTime || "09:00",
      { disabled: disableForUnscheduledFlexible }
    );
    if (els.editPlannedStartInput) {
      els.editPlannedStartInput.value = String(currentTask?.plannedStartTime || "09:00");
    }
    if (els.editPlannedStartOpenEnded) {
      els.editPlannedStartOpenEnded.checked = openEnded;
      els.editPlannedStartOpenEnded.disabled = !!onceOff;
    }
    if (els.editPlannedStartPushReminders) {
      els.editPlannedStartPushReminders.checked = pushRemindersEnabled;
      els.editPlannedStartPushReminders.disabled = disableForUnscheduledFlexible;
    }
    els.editPlannedStartOpenEndedRow?.classList.toggle("isDisabled", !!onceOff);
    els.editPlannedStartPushRemindersRow?.classList.toggle("isDisabled", disableForUnscheduledFlexible);
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
    els.editPresetIntervalField?.classList.remove("isInvalid");
    els.msList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function syncEditTaskDurationReadout(task?: Task | null) {
    if (!els.editTaskDurationReadout) return;
    const currentTask = task || getCurrentEditTask();
    const noTimeGoal = !!els.editNoGoalCheckbox?.checked;
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
      noTimeGoal,
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
        }))
      ),
      checkpointSoundEnabled: !!currentTask?.checkpointSoundEnabled,
      checkpointSoundMode: currentTask?.checkpointSoundMode === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!currentTask?.checkpointToastEnabled,
      checkpointToastMode: currentTask?.checkpointToastMode === "manual" ? "manual" : "auto5s",
      presetIntervalsEnabled: !!currentTask?.presetIntervalsEnabled,
      presetIntervalValue: String(Number(currentTask?.presetIntervalValue || 0) || 0),
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
    return !els.editNoGoalCheckbox?.checked;
  }

  function setEditTimeGoalEnabled(enabled: boolean) {
    if (els.editNoGoalCheckbox) els.editNoGoalCheckbox.checked = !enabled;
    ctx.toggleSwitchElement(els.editTimeGoalToggle as HTMLElement | null, enabled);
    els.editTimeGoalToggle?.setAttribute("aria-checked", enabled ? "true" : "false");
  }

  function getEditTaskTimeGoalMinutes() {
    const value = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    if (!(value > 0) || !isEditTimeGoalEnabled()) return 0;
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
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const noTimeGoal = !timeGoalEnabled;
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    els.editTaskDurationRow?.classList.toggle("isHidden", !timeGoalEnabled);
    els.editTaskDurationReadout?.classList.toggle("isHidden", !timeGoalEnabled);
    els.editTaskDurationRow?.classList.toggle("isDisabled", noTimeGoal);
    els.editTaskDurationReadout?.classList.toggle("isDisabled", noTimeGoal);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.disabled = noTimeGoal;
    if (timeGoalEnabled && els.editTaskDurationValueInput) {
      const parsedValue = Math.max(0, Math.floor(parseFloat(els.editTaskDurationValueInput.value || "0") || 0));
      const maxDay = getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), "day");
      const canUseDay = !onceOff && Number(parsedValue) <= maxDay;
      if (String(parsedValue || "") !== String(els.editTaskDurationValueInput.value || "")) {
        els.editTaskDurationValueInput.value = String(parsedValue || 0);
      }
      ctx.setEditTaskDurationPeriod(canUseDay && ctx.getEditTaskDurationPeriod() === "day" ? "day" : "week");
    }
    els.editTaskDurationRow?.querySelector(".addTaskDurationPerLabel")?.classList.toggle("isHidden", onceOff);
    els.editTaskDurationPeriodDay?.closest("#editTaskDurationPeriodPills")?.classList.toggle("isHidden", onceOff);
    const canUseDay = !onceOff && Number(els.editTaskDurationValueInput?.value || 0) <= getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), "day");
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.classList.toggle("isHidden", hidden);
      btn.disabled = noTimeGoal || hidden;
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.setAttribute("aria-hidden", hidden ? "true" : "false");
    };
    syncPill(els.editTaskDurationUnitMinute, ctx.getEditTaskDurationUnit() === "minute");
    syncPill(els.editTaskDurationUnitHour, ctx.getEditTaskDurationUnit() === "hour");
    syncPill(els.editTaskDurationPeriodDay, ctx.getEditTaskDurationPeriod() === "day", !canUseDay);
    syncPill(els.editTaskDurationPeriodWeek, ctx.getEditTaskDurationPeriod() === "week");
    if (els.editTimeGoalToggle) {
      (els.editTimeGoalToggle as HTMLButtonElement).disabled = false;
      els.editTimeGoalToggle.setAttribute("aria-disabled", "false");
      els.editTimeGoalToggle.title = "";
    }
    if (els.editNoGoalCheckbox) els.editNoGoalCheckbox.disabled = false;
    els.editTaskDurationValueInput?.classList.remove("isInvalid");
    syncEditTaskDurationReadout(currentTask);
    const checkpointControlsDisabled = !hasActiveTimeGoal;
    els.msArea?.classList.toggle("isHidden", checkpointControlsDisabled);
    els.msArea?.classList.toggle("isDisabled", checkpointControlsDisabled || !currentTask?.milestonesEnabled);
    if (els.msToggle) {
      els.msToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.msToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.editPresetIntervalsToggle) {
      els.editPresetIntervalsToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editPresetIntervalsToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isDisabled", checkpointControlsDisabled);
    if (els.editPresetIntervalInput) {
      els.editPresetIntervalInput.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.presetIntervalsEnabled;
    }
    if (els.addMsBtn) {
      els.addMsBtn.disabled = checkpointControlsDisabled;
      els.addMsBtn.title = checkpointControlsDisabled ? "Set a time goal to add checkpoints" : "";
    }
    if (els.editCheckpointSoundToggle) {
      els.editCheckpointSoundToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editCheckpointSoundToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.editCheckpointToastToggle) {
      els.editCheckpointToastToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.editCheckpointToastToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointSoundEnabled;
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.disabled =
        checkpointControlsDisabled || !currentTask?.milestonesEnabled || !currentTask?.checkpointToastEnabled;
    }
    els.editCheckpointSoundToggleRow?.classList.toggle(
      "isDisabled",
      checkpointControlsDisabled || !currentTask?.milestonesEnabled || !ctx.getCheckpointAlertSoundEnabled()
    );
    els.editCheckpointToastToggleRow?.classList.toggle(
      "isDisabled",
      checkpointControlsDisabled || !currentTask?.milestonesEnabled || !ctx.getCheckpointAlertToastEnabled()
    );
    if (currentTask) {
      syncEditCheckpointAlertUi(currentTask);
    } else {
      els.editTimerSettingsGroup?.classList.add("isHidden");
      els.editCheckpointAlertsGroup?.classList.add("isHidden");
    }
  }

  function validateEditTimeGoal() {
    if (!isEditTimeGoalEnabled()) return true;
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
    const currentTask = task || getCurrentEditTask();
    if (!currentTask || currentTask.taskType !== "once-off") return true;
    return !!String(els.editTaskOnceOffDaySelect?.value || currentTask.onceOffDay || "").trim();
  }

  function buildEditTimeGoalDraft(task: Task | null | undefined): Task | null {
    if (!task) return null;
    const onceOff = task.taskType === "once-off";
    return {
      ...task,
      timeGoalEnabled: isEditTimeGoalEnabled(),
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: ctx.getEditTaskDurationUnit(),
      timeGoalPeriod: onceOff ? "week" : ctx.getEditTaskDurationPeriod(),
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
    };
  }

  function getEditAggregateTimeGoalValidation(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    if (currentTask?.taskType === "once-off" || !isEditTimeGoalEnabled()) return null;
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
    const invalidPresetInterval = !!task.milestonesEnabled && !!task.presetIntervalsEnabled && !sharedTasks.hasValidPresetInterval(task);

    els.msArea?.classList.toggle("isInvalid", noCheckpoints || invalidCheckpointTimes);
    els.editPresetIntervalField?.classList.toggle("isInvalid", invalidPresetInterval);

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

  function setMilestoneUnitUi(unit: "hour" | "minute") {
    els.elapsedPadUnitHourBtn?.classList.toggle("isOn", unit === "hour");
    els.elapsedPadUnitMinuteBtn?.classList.toggle("isOn", unit === "minute");
  }

  function isEditMilestoneUnitDay(): boolean {
    return false;
  }

  function cloneTaskForEdit(task: Task): Task {
    return {
      ...task,
      plannedStartByDay: task.plannedStartByDay ? { ...task.plannedStartByDay } : null,
      milestones: Array.isArray(task.milestones)
        ? task.milestones.map((milestone) => ({
            ...milestone,
            id: String((milestone as { id?: string }).id || ""),
            createdSeq: Number.isFinite(Number((milestone as { createdSeq?: number }).createdSeq))
              ? Math.floor(Number((milestone as { createdSeq?: number }).createdSeq))
              : 0,
            description: String(milestone?.description || ""),
          }))
        : [],
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
    };
  }

  function renderMilestoneEditor(t: Task) {
    if (!els.msList) return;
    els.msList.innerHTML = "";

    const ms = (t.milestones || []).slice();

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as HTMLElement & { dataset: DOMStringMap }).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill msSkewField">${ctx.escapeHtmlUI(String(+m.hours || 0))}${sharedTasks.milestoneUnitSuffix(t)}</div>
        <input class="msSkewInput" type="text" value="${ctx.escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">&times;</button>
      `;

      const pill = row.querySelector(".pill") as HTMLElement | null;
      ctx.on(pill, "click", () => {
        openElapsedPadForMilestone(t, m as { hours: number; description: string }, ms);
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      ctx.on(desc, "input", (e: Event) => {
        m.description = (e.target as HTMLInputElement | null)?.value || "";
        t.milestones = ms;
        syncEditSaveAvailability(t);
      });

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
    const timeGoalEnabledForSave = ctx.isEditTimeGoalEnabled();
    const checkpointingEnabledForSave = timeGoalEnabledForSave && !!t.milestonesEnabled;
    t.checkpointSoundEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
    t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
    t.checkpointToastEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
    t.presetIntervalsEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null);
    t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
    t.timeGoalAction = "confirmModal";
    t.timeGoalEnabled = timeGoalEnabledForSave;
    if (!t.timeGoalEnabled) t.milestonesEnabled = false;
    t.timeGoalValue = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
    t.timeGoalUnit = ctx.getEditTaskDurationUnit();
    t.timeGoalPeriod = t.taskType === "once-off" ? "week" : ctx.getEditTaskDurationPeriod();
    t.timeGoalMinutes = t.taskType === "once-off"
      ? t.timeGoalUnit === "minute"
        ? t.timeGoalValue
        : t.timeGoalValue * 60
      : ctx.getEditTaskTimeGoalMinutesFor(t.timeGoalValue, t.timeGoalUnit, t.timeGoalPeriod);
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
    delete (t as Task & { mode?: string }).mode;
    Object.assign(sourceTask, ctx.cloneTaskForEdit(t));
    ctx.save();
    void ctx.syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
    ctx.render();
  }

  function normalizeRecurringScheduleFieldsForSave(task: Task, sourceTask?: Task | null) {
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

  function syncEditCheckpointAlertUi(t: Task) {
    sharedTasks.ensureMilestoneIdentity(t);
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    const checkpointingEnabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    els.editCheckpointAlertsGroup?.classList.toggle("isHidden", !timeGoalEnabled || !checkpointingEnabled);
    if (els.editPresetIntervalsToggle) {
      ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, checkpointingEnabled && !!t.presetIntervalsEnabled);
    }
    if (els.editPresetIntervalInput) {
      const nextValue = sharedTasks.getPresetIntervalValueNum(t);
      if (els.editPresetIntervalInput.value !== String(nextValue)) els.editPresetIntervalInput.value = String(nextValue);
      els.editPresetIntervalInput.disabled = !checkpointingEnabled || !t.presetIntervalsEnabled;
    }
    els.editPresetIntervalsToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled);
    els.editPresetIntervalField?.classList.toggle("isHidden", !checkpointingEnabled || !t.presetIntervalsEnabled);
    if (els.editPresetIntervalNote) {
      const intervalInvalid = checkpointingEnabled && !!t.presetIntervalsEnabled && !sharedTasks.hasValidPresetInterval(t);
      if (intervalInvalid) {
        (els.editPresetIntervalNote as HTMLElement).style.display = "block";
        els.editPresetIntervalNote.textContent = "Enter a preset interval greater than 0 to add checkpoints.";
      } else {
        (els.editPresetIntervalNote as HTMLElement).style.display = "none";
        els.editPresetIntervalNote.textContent = "";
      }
    }
    ctx.toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, checkpointingEnabled && !!t.checkpointSoundEnabled);
    ctx.toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, checkpointingEnabled && !!t.checkpointToastEnabled);
    els.editCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled || !ctx.getCheckpointAlertSoundEnabled());
    els.editCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointingEnabled || !ctx.getCheckpointAlertToastEnabled());
    if (els.editCheckpointSoundModeSelect) {
      els.editCheckpointSoundModeSelect.value = t.checkpointSoundMode === "repeat" ? "repeat" : "once";
    }
    if (els.editCheckpointToastModeSelect) {
      els.editCheckpointToastModeSelect.value = t.checkpointToastMode === "manual" ? "manual" : "auto5s";
    }
    els.editCheckpointSoundModeField?.classList.toggle(
      "isHidden",
      !checkpointingEnabled || !ctx.getCheckpointAlertSoundEnabled() || !t.checkpointSoundEnabled
    );
    els.editCheckpointToastModeField?.classList.toggle(
      "isHidden",
      !checkpointingEnabled || !ctx.getCheckpointAlertToastEnabled() || !t.checkpointToastEnabled
    );
    els.editTimerSettingsGroup?.classList.toggle("isHidden", !timeGoalEnabled || !hasActiveTimeGoal);
    const notes: string[] = [];
    if (!timeGoalEnabled || !hasActiveTimeGoal) notes.push("set a time goal to enable checkpoints");
    if (!ctx.getCheckpointAlertSoundEnabled()) notes.push("sound alerts are disabled globally");
    if (!ctx.getCheckpointAlertToastEnabled()) notes.push("toast alerts are disabled globally");
    if (els.editCheckpointAlertsNote) {
      if (notes.length) {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "block";
        els.editCheckpointAlertsNote.textContent = !timeGoalEnabled || !hasActiveTimeGoal
          ? "Set a time goal to enable Time Checkpoints and related alerts."
          : "Sound and toast notifications can be enabled via Settings > Notifications";
      } else {
        (els.editCheckpointAlertsNote as HTMLElement).style.display = "none";
        els.editCheckpointAlertsNote.textContent = "";
      }
    }
  }

  function syncEditMilestoneSectionUi(t: Task) {
    const timeGoalEnabled = isEditTimeGoalEnabled();
    const hasActiveTimeGoal = timeGoalEnabled && editTaskHasActiveTimeGoal();
    const enabled = !!t.milestonesEnabled && hasActiveTimeGoal;
    if (els.msToggle instanceof HTMLInputElement && els.msToggle.type === "checkbox") {
      els.msToggle.checked = enabled;
    } else {
      els.msToggle?.classList.toggle("on", enabled);
    }
    els.msToggle?.setAttribute("aria-checked", String(enabled));
    els.msArea?.classList.toggle("on", enabled);
    els.msArea?.classList.toggle("isHidden", !timeGoalEnabled);
    els.msArea?.classList.toggle("isDisabled", !enabled);
    els.editPresetIntervalsToggleRow?.classList.toggle("isHidden", !enabled);
    els.editPresetIntervalField?.classList.toggle("isHidden", !enabled || !t.presetIntervalsEnabled);
    els.editPresetIntervalNote?.classList.toggle("isHidden", !enabled);
    els.msList?.parentElement?.classList.toggle("isHidden", !enabled);
  }

  function buildEditDraftSnapshot(task: Task | null | undefined) {
    if (!task) return "";
    const milestones = ctx.sortMilestones(Array.isArray(task.milestones) ? task.milestones.slice() : []).map((m) => ({
      id: String((m as { id?: string }).id || ""),
      createdSeq: Number.isFinite(+(m as { createdSeq?: number }).createdSeq!) ? Math.floor(+(m as { createdSeq?: number }).createdSeq!) : 0,
      hours: Number.isFinite(+m.hours) ? +m.hours : 0,
      description: String(m.description || ""),
    }));
    return JSON.stringify({
      name: String(els.editName?.value || task.name || "").trim(),
      plannedStartTime: String(task.plannedStartTime || "").trim() || null,
      plannedStartOpenEnded: !!task.plannedStartOpenEnded,
      plannedStartPushRemindersEnabled: task.plannedStartPushRemindersEnabled !== false,
      timeGoalEnabled: isEditTimeGoalEnabled(),
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: ctx.getEditTaskDurationUnit(),
      timeGoalPeriod: ctx.getEditTaskDurationPeriod(),
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
      milestoneTimeUnit: task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestonesEnabled: !!task.milestonesEnabled,
      milestones,
      checkpointSoundEnabled: !!ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null),
      checkpointSoundMode: els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null),
      checkpointToastMode: els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s",
      timeGoalAction: "confirmModal",
      presetIntervalsEnabled: !!ctx.isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null),
      presetIntervalValue: Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0),
      presetIntervalLastMilestoneId: task.presetIntervalLastMilestoneId ? String(task.presetIntervalLastMilestoneId) : null,
      presetIntervalNextSeq: sharedTasks.getPresetIntervalNextSeqNum(task),
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
    const invalidTimeGoal = !validateEditTimeGoal();
    const invalidOnceOffDay = !validateEditOnceOffDay(task);
    const aggregateValidation = getEditAggregateTimeGoalValidation(task);
    const checkpointingActive = !!task.milestonesEnabled && editTaskHasActiveTimeGoal();
    const noCheckpoints = checkpointingActive && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const invalidCheckpointTimes =
      checkpointingActive &&
      (sharedTasks.hasNonPositiveCheckpoint(task.milestones) ||
        sharedTasks.hasCheckpointAtOrAboveTimeGoal(task.milestones, sharedTasks.milestoneUnitSec(task), getEditTaskTimeGoalMinutes()));
    const invalidPresetInterval = checkpointingActive && !!task.presetIntervalsEnabled && !sharedTasks.hasValidPresetInterval(task);
    const blocked = invalidTimeGoal || invalidOnceOffDay || !!aggregateValidation?.shouldBlock || noCheckpoints || invalidCheckpointTimes || invalidPresetInterval;
    els.saveEditBtn.disabled = blocked;
    els.saveEditBtn.title = blocked ? "Resolve validation issues before saving" : "Save Changes";
    if (!blocked) return;
    applyEditCheckpointValidationHighlights(task);
  }

  function maybeToggleEditPresetIntervals(nextEnabled: boolean) {
    const t = getCurrentEditTask();
    if (!t) return;
    if (!t.milestonesEnabled) {
      t.presetIntervalsEnabled = false;
      syncEditCheckpointAlertUi(t);
      return;
    }
    if (!nextEnabled) {
      t.presetIntervalsEnabled = false;
      syncEditCheckpointAlertUi(t);
      return;
    }
    t.presetIntervalsEnabled = true;
    syncEditCheckpointAlertUi(t);
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
    t.plannedStartPushRemindersEnabled = t.plannedStartPushRemindersEnabled !== false;
    t.milestoneTimeUnit = t.milestoneTimeUnit === "minute" ? "minute" : "hour";
    ctx.setEditIndex(i);
    ctx.setEditTaskDraft(t);
    if (els.editName) els.editName.value = t.name || "";
    if (els.editTaskOnceOffDaySelect) els.editTaskOnceOffDaySelect.value = String(t.onceOffDay || t.plannedStartDay || "mon");
    syncEditTaskTypeUi(t);
    syncEditPlannedStartSelectors(t);
    ctx.setEditTimeGoalEnabled(!!t.timeGoalEnabled);
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
    if (els.editPresetIntervalInput) els.editPresetIntervalInput.value = String(Number(t.presetIntervalValue || 0) || 0);
    ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    ctx.syncEditCheckpointAlertUi(t);
    ctx.setEditDraftSnapshot(ctx.buildEditDraftSnapshot(t));
    ctx.clearEditValidationState();
    ctx.syncEditSaveAvailability(t);
    showEditOverlay(sourceEl);
  }

  function closeEdit(saveChanges: boolean) {
    const editIndex = ctx.getEditIndex();
    const sourceTask = editIndex != null ? ctx.getTasks()[editIndex] : null;
    const t = getCurrentEditTask();
    if (saveChanges && t && sourceTask) {
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      const aggregateValidation = getEditAggregateTimeGoalValidation(t);
      if (!validateEditOnceOffDay(t)) {
        return void ctx.showEditValidationError(t, "Choose a day for this once-off task.");
      }
      if (!ctx.validateEditTimeGoal()) {
        return void ctx.showEditValidationError(
          t,
          aggregateValidation?.shouldBlock ? aggregateValidation.message : "Enter a valid time goal or turn Time Goal off."
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
      if (checkpointingActiveForSave && t.presetIntervalsEnabled && !sharedTasks.hasValidPresetInterval(t)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Enter a preset interval greater than 0.");
      }
      t.name = (els.editName?.value || "").trim() || t.name;
      t.plannedStartOpenEnded = !!els.editPlannedStartOpenEnded?.checked;
      t.plannedStartTime = readEditPlannedStartValueFromSelectors();
      if (!t.plannedStartOpenEnded && hasTaskMixedScheduleTimes(sourceTask)) {
        const sharedTime = readEditPlannedStartValueFromSelectors();
        const scheduledDays = getTaskScheduledDays(sourceTask);
        if (scheduledDays.length > 1) {
          return void ctx.confirm(
            "Apply Shared Schedule",
            `Flexible is off, so this task will use the same planned start time on each scheduled day. Apply ${sharedTime} to all scheduled days?`,
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
                finalizeEditSave(sourceTask, t);
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
      finalizeEditSave(sourceTask, t);
    }
    hideEditOverlay();
    ctx.clearEditValidationState();
    closeElapsedPad(false);
    ctx.setEditIndex(null);
    ctx.setEditTaskDraft(null);
    ctx.setEditDraftSnapshot("");
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
    const syncEditTimeGoalToggle = (nextEnabled: boolean) => {
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.setEditTimeGoalEnabled(nextEnabled);
      if (nextEnabled) {
        t.milestoneTimeUnit = ctx.getEditTaskDurationUnit() === "minute" ? "minute" : "hour";
      }
      ctx.clearEditValidationState();
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditMilestoneSectionUi(t);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    };
    const syncCheckpointToggleState = (
      toggleEl: HTMLElement | null,
      readEnabled: () => boolean,
      writeEnabled: (task: Task, enabled: boolean) => void
    ) => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!readEnabled() || !ctx.editTaskHasActiveTimeGoal()) return;
      const enabled =
        toggleEl instanceof HTMLInputElement && toggleEl.type === "checkbox"
          ? toggleEl.checked
          : !ctx.isSwitchOn(toggleEl);
      ctx.toggleSwitchElement(toggleEl, enabled);
      writeEnabled(t, enabled);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    };

    ctx.on(els.cancelEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(false);
    });
    ctx.on(els.saveEditBtn, "click", (e: any) => {
      e?.preventDefault?.();
      closeEdit(true);
    });
    ctx.on(els.editName, "input", handleEditNameInput);
    ctx.on(els.editTaskTypeRecurringBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || t.taskType === "recurring") return;
      t.taskType = "recurring";
      t.onceOffDay = null;
      t.onceOffTargetDate = null;
      syncEditTaskTypeUi(t);
      syncEditPlannedStartSelectors(t);
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskTypeOnceOffBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || t.taskType === "once-off") return;
      t.taskType = "once-off";
      t.onceOffDay = (String(t.onceOffDay || t.plannedStartDay || "mon").trim().toLowerCase() || "mon") as ScheduleDay;
      syncEditTaskTypeUi(t);
      syncEditPlannedStartSelectors(t);
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
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
    ctx.on(els.editPlannedStartOpenEnded, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.plannedStartOpenEnded = !!els.editPlannedStartOpenEnded?.checked;
      syncEditPlannedStartSelectors(t);
      syncEditSaveAvailability(t);
    });
    ctx.on(els.editPlannedStartPushReminders, "change", () => {
      const t = getCurrentEditTask();
      if (!t || (t.plannedStartOpenEnded && !hasTaskScheduledSlots(t))) return;
      t.plannedStartPushRemindersEnabled = !!els.editPlannedStartPushReminders?.checked;
      syncEditPlannedStartSelectors(t);
      syncEditSaveAvailability(t);
    });
    ctx.on(els.editTimeGoalToggle, "change", () => {
      const nextEnabled =
        els.editTimeGoalToggle instanceof HTMLInputElement && els.editTimeGoalToggle.type === "checkbox"
          ? els.editTimeGoalToggle.checked
          : ctx.isSwitchOn(els.editTimeGoalToggle as HTMLElement | null);
      syncEditTimeGoalToggle(nextEnabled);
    });
    ctx.on(els.editTaskDurationValueInput, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskDurationValueInput, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
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
      ctx.syncEditSaveAvailability(t);
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
      ctx.syncEditSaveAvailability(t);
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
      ctx.syncEditSaveAvailability(t);
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
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointSoundToggle, "change", () => {
      syncCheckpointToggleState(
        els.editCheckpointSoundToggle as HTMLElement | null,
        () => ctx.getCheckpointAlertSoundEnabled(),
        (task, enabled) => {
          task.checkpointSoundEnabled = enabled;
        }
      );
    });
    ctx.on(els.editCheckpointSoundModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointToastToggle, "change", () => {
      syncCheckpointToggleState(
        els.editCheckpointToastToggle as HTMLElement | null,
        () => ctx.getCheckpointAlertToastEnabled(),
        (task, enabled) => {
          task.checkpointToastEnabled = enabled;
        }
      );
    });
    ctx.on(els.editCheckpointToastModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointToastMode = els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPresetIntervalsToggle, "change", () => {
      const t = getCurrentEditTask();
      const nextEnabled =
        els.editPresetIntervalsToggle instanceof HTMLInputElement && els.editPresetIntervalsToggle.type === "checkbox"
          ? els.editPresetIntervalsToggle.checked
          : !t?.presetIntervalsEnabled;
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
        ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
        return;
      }
      ctx.maybeToggleEditPresetIntervals(!!nextEnabled);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPresetIntervalInput, "input", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      ctx.clearEditValidationState();
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPresetIntervalInput, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      ctx.clearEditValidationState();
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });

    ctx.on(els.msToggle, "change", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      t.milestonesEnabled =
        els.msToggle instanceof HTMLInputElement && els.msToggle.type === "checkbox" ? els.msToggle.checked : !t.milestonesEnabled;
      ctx.syncEditMilestoneSectionUi(t);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
      if (!t.milestonesEnabled) {
        t.presetIntervalsEnabled = false;
        ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, false);
        ctx.syncEditMilestoneSectionUi(t);
      }
    });
    ctx.on(els.addMsBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) {
        if (t) ctx.syncEditCheckpointAlertUi(t);
        return;
      }
      if (t.presetIntervalsEnabled) {
        if (!sharedTasks.hasValidPresetInterval(t)) {
          ctx.syncEditCheckpointAlertUi(t);
          return;
        }
        if (!sharedTasks.addMilestoneWithCurrentPreset(t, ctx.getEditTaskTimeGoalMinutes())) {
          ctx.showEditValidationError(t, "Checkpoint times must be less than the time goal.");
          ctx.syncEditCheckpointAlertUi(t);
          ctx.syncEditSaveAvailability(t);
          return;
        }
      } else {
        t.milestones = t.milestones || [];
        sharedTasks.ensureMilestoneIdentity(t);
        const nextSeq = sharedTasks.getPresetIntervalNextSeqNum(t);
        t.milestones.push({ id: sharedTasks.createId(), createdSeq: nextSeq, hours: 0, description: "" });
        t.presetIntervalLastMilestoneId = t.milestones[t.milestones.length - 1]?.id || null;
        t.presetIntervalNextSeq = nextSeq + 1;
      }
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
    maybeToggleEditPresetIntervals,
    isEditMilestoneUnitDay,
    registerEditTaskEvents,
  };
}
