import {
  ADD_TASK_PRESET_NAMES,
  filterTaskNameOptions,
  parseRecentCustomTaskNames,
  rememberRecentCustomTaskName,
} from "../lib/addTaskNames";
import {
  formatAddTaskDurationReadout,
  formatAggregateTimeGoalValidationMessage,
  getAddTaskDurationMaxForPeriod,
  validateAggregateTimeGoalTotals,
} from "../lib/taskConfig";
import { getNextAutoTaskColor, getTaskColorFamilyForColor, normalizeTaskColor, resolveNewTaskColor, TASK_COLOR_FAMILIES } from "../lib/taskColors";
import {
  findFirstAvailableScheduleSlotFromProductivityWindow,
  findNextAvailableScheduleSlot,
  findScheduleOverlap,
  formatScheduleSlotSuggestion,
  normalizeScheduleStoredTime,
  resolveNextScheduleDayDate,
  type ScheduleDay,
} from "../lib/schedule-placement";
import type { Task } from "../lib/types";
import { eventTargetClosest } from "./control-helpers";
import type { TaskTimerAddTaskContext } from "./context";
import { readPlannedStartValueFromSelectors as readPlannedStartValue, syncPlannedStartSelectors } from "./planned-start";

export function createTaskTimerAddTask(ctx: TaskTimerAddTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  let selectedColor: string | null = null;
  let selectedColorTouched = false;
  let addTaskPlannedStartTouched = false;

  function canUseAdvancedTaskConfig() {
    return true;
  }

  function isOnceOffTaskType() {
    return ctx.getAddTaskType() === "once-off";
  }

  function hasSelectedTaskType() {
    return ctx.getAddTaskType() === "recurring" || ctx.getAddTaskType() === "once-off";
  }

  function setAddTaskError(msg: string) {
    if (!els.addTaskError) return;
    els.addTaskError.textContent = msg;
    els.addTaskError.classList.toggle("isOn", !!String(msg || "").trim());
  }

  function clearAddTaskValidationState() {
    els.addTaskError?.classList.remove("isOn");
    if (els.addTaskError) els.addTaskError.textContent = "";
    els.addTaskName?.classList.remove("isInvalid");
    els.addTaskDurationValueInput?.classList.remove("isInvalid");
    els.addTaskMsArea?.classList.remove("isInvalid");
    els.addTaskMsList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function applyAddTaskCheckpointValidationHighlights(opts?: {
    name?: boolean;
    duration?: boolean;
    checkpoints?: boolean;
    checkpointRows?: boolean;
  }) {
    const options = opts || {};
    els.addTaskName?.classList.toggle("isInvalid", !!options.name);
    els.addTaskDurationValueInput?.classList.toggle("isInvalid", !!options.duration);
    els.addTaskMsArea?.classList.toggle("isInvalid", !!options.checkpoints || !!options.checkpointRows);
    const rows = Array.from(els.addTaskMsList?.querySelectorAll?.(".msRow") || []);
    const addTaskTimeGoalMinutes = getAddTaskTimeGoalMinutes();
    const addTaskUnitSeconds =
      ctx.getAddTaskMilestoneTimeUnit() === "day" ? 86400 : ctx.getAddTaskMilestoneTimeUnit() === "minute" ? 60 : 3600;
    rows.forEach((row, idx) => {
      const m = ctx.getAddTaskMilestones()[idx];
      const invalidForValue = !!m && !(Number(+m.hours) > 0);
      const invalidForTimeGoal = !!m && sharedTasks.isCheckpointAtOrAboveTimeGoal(m.hours, addTaskUnitSeconds, addTaskTimeGoalMinutes);
      const invalid = !!options.checkpointRows && (invalidForValue || invalidForTimeGoal);
      row.classList.toggle("isInvalid", invalid);
    });
  }

  function showAddTaskValidationError(
    msg: string,
    opts?: { name?: boolean; duration?: boolean; checkpoints?: boolean; checkpointRows?: boolean }
  ) {
    clearAddTaskValidationState();
    applyAddTaskCheckpointValidationHighlights(opts);
    setAddTaskError(msg);
  }

  function getAddTaskTimeGoalMinutesState() {
    const value = Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    if (!(value > 0)) return 0;
    if (ctx.getAddTaskType() === "once-off") {
      return ctx.getAddTaskDurationUnit() === "minute" ? value : value * 60;
    }
    if (ctx.getAddTaskDurationUnit() === "minute") {
      return ctx.getAddTaskDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getAddTaskDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
  }

  function getAddTaskTimeGoalMinutes() {
    return getAddTaskTimeGoalMinutesState();
  }

  function syncPlannedStartValueFromSelectors(opts?: { markTouched?: boolean }) {
    const nextValue = readPlannedStartValue({
      hourSelect: els.addTaskPlannedStartHourSelect,
      minuteSelect: els.addTaskPlannedStartMinuteSelect,
      meridiemSelect: els.addTaskPlannedStartMeridiemSelect,
    });
    if (opts?.markTouched) addTaskPlannedStartTouched = true;
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = nextValue;
    }
    ctx.setAddTaskPlannedStartTimeState(nextValue);
  }

  function syncAddTaskPlannedStartUi() {
    syncPlannedStartSelectors(
      {
        hourSelect: els.addTaskPlannedStartHourSelect,
        minuteSelect: els.addTaskPlannedStartMinuteSelect,
        meridiemSelect: els.addTaskPlannedStartMeridiemSelect,
      },
      ctx.getAddTaskPlannedStartTime() || "09:00"
    );
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = String(ctx.getAddTaskPlannedStartTime() || "09:00");
    }
  }

  function setAddTaskPlannedStartTime(nextValue: string) {
    ctx.setAddTaskPlannedStartTimeState(nextValue);
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = nextValue;
    }
    syncAddTaskPlannedStartUi();
  }

  function buildAddTaskScheduleDraft(plannedStartTime: string): Task {
    const taskType = isOnceOffTaskType() ? "once-off" : "recurring";
    const onceOffDay = ctx.getAddTaskOnceOffDay() as ScheduleDay;
    const timeGoalPeriod = taskType === "once-off" ? "day" : ctx.getAddTaskDurationPeriod();
    const draftTask = {
      id: "__add-task-schedule-draft__",
      name: String(els.addTaskName?.value || "").trim() || "Draft task",
      taskType,
      onceOffDay: taskType === "once-off" ? onceOffDay : null,
      onceOffTargetDate: null,
      order: 0,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestoneTimeUnit: ctx.getAddTaskMilestoneTimeUnit(),
      milestones: [],
      hasStarted: false,
      timeGoalEnabled: true,
      timeGoalValue: Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0),
      timeGoalUnit: ctx.getAddTaskDurationUnit(),
      timeGoalPeriod,
      timeGoalMinutes: getAddTaskTimeGoalMinutes(),
      plannedStartOpenEnded: false,
      plannedStartDay: taskType === "once-off" ? onceOffDay : null,
      plannedStartTime,
      plannedStartByDay: taskType === "once-off" ? { [onceOffDay]: plannedStartTime } : null,
    } satisfies Task;
    return draftTask;
  }

  function maybeAutoFillAddTaskPlannedStart() {
    if (addTaskPlannedStartTouched) return;
    if (!hasSelectedTaskType()) return;
    if (!(getAddTaskTimeGoalMinutes() > 0)) return;

    const productivityStartTime = normalizeScheduleStoredTime(ctx.getOptimalProductivityStartTime()) || "09:00";
    const productivityEndTime = normalizeScheduleStoredTime(ctx.getOptimalProductivityEndTime()) || "23:59";
    if (!isOnceOffTaskType() && ctx.getAddTaskDurationPeriod() === "week") {
      setAddTaskPlannedStartTime(productivityStartTime);
      return;
    }

    const draftTask = buildAddTaskScheduleDraft(productivityStartTime);
    const slot = findFirstAvailableScheduleSlotFromProductivityWindow(ctx.getTasks(), draftTask, {
      optimalProductivityStartTime: productivityStartTime,
      optimalProductivityEndTime: productivityEndTime,
      allowOutsideProductivityWindow: true,
    });
    if (slot) setAddTaskPlannedStartTime(slot.time);
  }

  function saveAddTaskCustomNames() {
    const next = {
      customTaskNames: ctx.getAddTaskCustomNames().slice(0, 5),
    } as unknown;
    ctx.saveCloudTaskUi(next);
  }

  function loadAddTaskCustomNames() {
    const settings = (ctx.loadCachedTaskUi() || {}) as { customTaskNames?: unknown };
    const raw = Array.isArray(settings?.customTaskNames) ? JSON.stringify(settings.customTaskNames) : "";
    ctx.setAddTaskCustomNamesState(parseRecentCustomTaskNames(raw, 5));
  }

  function rememberCustomTaskName(name: string) {
    const nextNames = rememberRecentCustomTaskName(name, ctx.getAddTaskCustomNames(), ADD_TASK_PRESET_NAMES, 5);
    ctx.setAddTaskCustomNamesState(nextNames);
    saveAddTaskCustomNames();
  }

  function setAddTaskNameMenuOpen(open: boolean) {
    if (!els.addTaskNameMenu) return;
    (els.addTaskNameMenu as HTMLElement).style.display = open ? "block" : "none";
  }

  function renderAddTaskNameMenu(filterText = "") {
    const { custom, presets } = filterTaskNameOptions(ctx.getAddTaskCustomNames(), ADD_TASK_PRESET_NAMES, filterText);
    if (els.addTaskNameCustomList) {
      els.addTaskNameCustomList.innerHTML = custom
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${ctx.escapeHtmlUI(name)}">${ctx.escapeHtmlUI(name)}</button>`)
        .join("");
    }
    if (els.addTaskNamePresetList) {
      els.addTaskNamePresetList.innerHTML = presets
        .map((name) => `<button class="addTaskNameItem" type="button" data-add-task-name="${ctx.escapeHtmlUI(name)}">${ctx.escapeHtmlUI(name)}</button>`)
        .join("");
    }
    const hasCustom = custom.length > 0;
    if (els.addTaskNameCustomTitle) (els.addTaskNameCustomTitle as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNameDivider) (els.addTaskNameDivider as HTMLElement).style.display = hasCustom ? "block" : "none";
    if (els.addTaskNamePresetTitle) (els.addTaskNamePresetTitle as HTMLElement).style.display = presets.length ? "block" : "none";
  }

  function syncAddTaskTypeUi() {
    const addTaskType = ctx.getAddTaskType();
    const isOnceOff = addTaskType === "once-off";
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    };
    syncPill(els.addTaskTypeRecurringBtn, addTaskType === "recurring");
    syncPill(els.addTaskTypeOnceOffBtn, isOnceOff);
    els.addTaskOnceOffDayField?.classList.toggle("isHidden", !isOnceOff);
    if (els.addTaskOnceOffDaySelect) {
      els.addTaskOnceOffDaySelect.value = ctx.getAddTaskOnceOffDay();
    }
  }

  function syncAddTaskDurationReadout() {
    if (!els.addTaskDurationReadout) return;
    els.addTaskDurationReadout.textContent = formatAddTaskDurationReadout({
      name: "",
      durationValue: String(ctx.getAddTaskDurationValue()),
      durationUnit: ctx.getAddTaskDurationUnit(),
      durationPeriod: ctx.getAddTaskDurationPeriod(),
      taskType: ctx.getAddTaskType() || undefined,
      noTimeGoal: false,
      milestonesEnabled: !!ctx.getAddTaskMilestonesEnabled(),
      milestoneTimeUnit: ctx.getAddTaskMilestoneTimeUnit(),
      milestones: ctx.getAddTaskMilestones(),
      checkpointSoundEnabled: false,
      checkpointSoundMode: "once",
      checkpointToastEnabled: false,
      checkpointToastMode: "auto5s",
      presetIntervalsEnabled: false,
      presetIntervalValue: "0",
      timeGoalAction: "confirmModal",
    });
  }

  function syncAddTaskDurationUi() {
    const onceOff = isOnceOffTaskType();
    if (onceOff) {
      ctx.setAddTaskDurationPeriodState("day");
    }
    const parsedValue = Math.max(0, Math.floor(parseFloat(els.addTaskDurationValueInput?.value || "0") || 0));
    ctx.setAddTaskDurationValueState(parsedValue);
    const maxDay = getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "day");
    const canUseDay = !onceOff && Number(parsedValue) <= maxDay;
    if (!onceOff) {
      ctx.setAddTaskDurationPeriodState(canUseDay && ctx.getAddTaskDurationPeriod() === "day" ? "day" : "week");
    }
    if (els.addTaskDurationValueInput && String(parsedValue || "") !== String(els.addTaskDurationValueInput.value || "")) {
      els.addTaskDurationValueInput.value = String(parsedValue || 0);
    }
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.classList.toggle("isHidden", hidden);
      btn.disabled = hidden;
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
      btn.setAttribute("aria-hidden", hidden ? "true" : "false");
    };
    els.addTaskDurationRow?.classList.remove("isHidden", "isDisabled");
    els.addTaskDurationReadout?.classList.remove("isHidden", "isDisabled");
    if (els.addTaskDurationValueInput) {
      els.addTaskDurationValueInput.disabled = false;
    }
    els.addTaskDurationPerLabel?.classList.toggle("isHidden", onceOff);
    els.addTaskDurationPeriodPills?.classList.toggle("isHidden", onceOff);
    syncPill(els.addTaskDurationUnitMinute, ctx.getAddTaskDurationUnit() === "minute");
    syncPill(els.addTaskDurationUnitHour, ctx.getAddTaskDurationUnit() === "hour");
    syncPill(els.addTaskDurationPeriodDay, ctx.getAddTaskDurationPeriod() === "day", !canUseDay || onceOff);
    syncPill(els.addTaskDurationPeriodWeek, ctx.getAddTaskDurationPeriod() === "week", onceOff);
    syncAddTaskDurationReadout();
  }

  function syncAddTaskTimeGoalUi() {
    syncAddTaskDurationUi();
    syncAddTaskMilestonesUi();
  }

  function getCheckpointUnitLabels(unit: "hour" | "minute") {
    return unit === "minute"
      ? { major: "m", minor: "Min", minorStep: 5, minorRange: 60 }
      : { major: "Hr", minor: "m", minorStep: 5, minorRange: 60 };
  }

  function checkpointValueToParts(value: number, unit: "hour" | "minute") {
    if (unit === "minute") {
      const totalSeconds = Math.max(0, Math.round((Number(value) || 0) * 60));
      return {
        major: Math.floor(totalSeconds / 60),
        minor: Math.max(0, totalSeconds % 60),
      };
    }
    const totalMinutes = Math.max(0, Math.round((Number(value) || 0) * 60));
    return {
      major: Math.floor(totalMinutes / 60),
      minor: Math.max(0, totalMinutes % 60),
    };
  }

  function checkpointPartsToValue(major: number, minor: number, unit: "hour" | "minute") {
    if (unit === "minute") {
      return Math.max(0, major) + Math.max(0, minor) / 60;
    }
    return Math.max(0, major) + Math.max(0, minor) / 60;
  }

  function getCheckpointMaxParts(timeGoalMinutes: number, unit: "hour" | "minute") {
    if (unit === "minute") {
      const maxTotalSeconds = Math.max(0, Math.ceil(timeGoalMinutes * 60) - 1);
      return {
        majorMax: Math.floor(maxTotalSeconds / 60),
        minorMax: 59,
      };
    }
    const maxTotalMinutes = Math.max(0, Math.ceil(timeGoalMinutes) - 1);
    return {
      majorMax: Math.floor(maxTotalMinutes / 60),
      minorMax: 59,
    };
  }

  function clampCheckpointParts(major: number, minor: number, timeGoalMinutes: number, unit: "hour" | "minute") {
    const nextValue = checkpointPartsToValue(major, minor, unit);
    const unitSeconds = unit === "minute" ? 60 : 3600;
    if (!sharedTasks.isCheckpointAtOrAboveTimeGoal(nextValue, unitSeconds, timeGoalMinutes)) {
      return { major: Math.max(0, major), minor: Math.max(0, minor), value: nextValue };
    }
    if (unit === "minute") {
      const maxTotalSeconds = Math.max(0, Math.ceil(timeGoalMinutes * 60) - 1);
      return {
        major: Math.floor(maxTotalSeconds / 60),
        minor: Math.max(0, maxTotalSeconds % 60),
        value: maxTotalSeconds / 60,
      };
    }
    const maxTotalMinutes = Math.max(0, Math.ceil(timeGoalMinutes) - 1);
    return {
      major: Math.floor(maxTotalMinutes / 60),
      minor: Math.max(0, maxTotalMinutes % 60),
      value: maxTotalMinutes / 60,
    };
  }

  function renderAddTaskMilestoneEditor() {
    if (!els.addTaskMsList) return;
    els.addTaskMsList.innerHTML = "";
    const ms = (ctx.getAddTaskMilestones() || []).slice();
    const tempTask = {
      milestoneTimeUnit: ctx.getAddTaskMilestoneTimeUnit(),
      milestones: ms,
      timeGoalMinutes: getAddTaskTimeGoalMinutes(),
    } as Task;
    const unit = tempTask.milestoneTimeUnit === "minute" ? "minute" : "hour";
    const labels = getCheckpointUnitLabels(unit);
    const timeGoalMinutes = getAddTaskTimeGoalMinutes();
    const maxParts = getCheckpointMaxParts(timeGoalMinutes, unit);

    ms.forEach((m, idx) => {
      const currentParts = checkpointValueToParts(Number(m.hours) || 0, unit);
      const row = document.createElement("div");
      row.className = "msRow";
      (row as HTMLElement & { dataset: DOMStringMap }).dataset.msIndex = String(idx);
      const majorOptions = Array.from({ length: Math.max(1, maxParts.majorMax + 1) }, (_, optionIndex) => {
        const isSelected = optionIndex === currentParts.major ? ' selected="selected"' : "";
        return `<option value="${optionIndex}"${isSelected}>${optionIndex}</option>`;
      }).join("");
      const minorOptions = Array.from({ length: labels.minorRange / labels.minorStep }, (_, optionIndex) => {
        const value = optionIndex * labels.minorStep;
        const isSelected = value === currentParts.minor ? ' selected="selected"' : "";
        return `<option value="${value}"${isSelected}>${String(value).padStart(2, "0")}</option>`;
      }).join("");
      row.innerHTML = `
        <div class="msValueCluster" aria-label="Checkpoint time">
          <select class="msValueSelect" data-field="value-major" aria-label="Checkpoint ${labels.major}">
            ${majorOptions}
          </select>
          <span class="msValueUnit" aria-hidden="true">${labels.major}</span>
          <select class="msValueSelect" data-field="value-minor" aria-label="Checkpoint ${labels.minor}">
            ${minorOptions}
          </select>
          <span class="msValueUnit" aria-hidden="true">${labels.minor}</span>
        </div>
        <button type="button" title="Remove" data-action="rmMs">&times;</button>
      `;
      const majorSelect = row.querySelector('[data-field="value-major"]') as HTMLSelectElement | null;
      const minorSelect = row.querySelector('[data-field="value-minor"]') as HTMLSelectElement | null;
      const syncCheckpointValue = () => {
        const major = Math.max(0, Number(majorSelect?.value || 0) || 0);
        const minor = Math.max(0, Number(minorSelect?.value || 0) || 0);
        const next = clampCheckpointParts(major, minor, timeGoalMinutes, unit);
        if (majorSelect) majorSelect.value = String(next.major);
        if (minorSelect) minorSelect.value = String(next.minor);
        m.hours = next.value;
        ctx.setAddTaskMilestonesState(ms);
        clearAddTaskValidationState();
        syncAddTaskCheckpointAlertUi();
      };
      ctx.on(majorSelect, "change", syncCheckpointValue);
      ctx.on(minorSelect, "change", syncCheckpointValue);

      const rm = row.querySelector('[data-action="rmMs"]') as HTMLElement | null;
      ctx.on(rm, "click", () => {
        ms.splice(idx, 1);
        ctx.setAddTaskMilestonesState(ms);
        renderAddTaskMilestoneEditor();
        syncAddTaskCheckpointAlertUi();
      });

      els.addTaskMsList?.appendChild(row);
    });

    ctx.setAddTaskMilestonesState(ms);
  }

  function syncAddTaskCheckpointAlertUi() {
    const hasActiveTimeGoal = getAddTaskTimeGoalMinutes() > 0;
    const checkpointsEnabled = !!ctx.getAddTaskMilestonesEnabled() && hasActiveTimeGoal;
    const derivedAlertState = sharedTasks.deriveCheckpointAlertEnabledState({
      milestonesEnabled: checkpointsEnabled,
      milestones: ctx.getAddTaskMilestones(),
    } as Task);

    if (els.addTaskMsToggle) {
      els.addTaskMsToggle.checked = checkpointsEnabled;
    }
    els.addTaskMsArea?.classList.remove("isHidden");
    els.addTaskMsArea?.classList.toggle("on", checkpointsEnabled);
    els.addTaskMsArea?.classList.toggle("isDisabled", !checkpointsEnabled);
    if (els.addTaskCheckpointSoundModeSelect) {
      els.addTaskCheckpointSoundModeSelect.disabled = !checkpointsEnabled || !ctx.getCheckpointAlertSoundEnabled() || !derivedAlertState.soundEnabled;
    }
    if (els.addTaskCheckpointToastModeSelect) {
      els.addTaskCheckpointToastModeSelect.disabled = !checkpointsEnabled || !ctx.getCheckpointAlertToastEnabled() || !derivedAlertState.toastEnabled;
    }
    if (els.addTaskAddMsBtn) {
      const blocked = !hasActiveTimeGoal;
      els.addTaskAddMsBtn.disabled = blocked;
      els.addTaskAddMsBtn.title = !hasActiveTimeGoal ? "Set a time goal to add checkpoints" : "";
    }
  }

  function syncAddTaskMilestonesUi() {
    syncAddTaskCheckpointAlertUi();
  }

  function validateAddTaskAggregateTimeGoals() {
    if (ctx.getAddTaskType() === "once-off") return true;

    const proposedMinutes = getAddTaskTimeGoalMinutes();
    if (!(proposedMinutes > 0)) return true;

    const tasks = ctx.getTasks();
    const draftTask = {
      id: "__add-task-draft__",
      name: String(els.addTaskName?.value || "").trim() || "Draft task",
      order: (tasks.reduce((mx, task) => Math.max(mx, task.order || 0), 0) || 0) + 1,
      accumulatedMs: 0,
      running: false,
      startMs: null,
      collapsed: false,
      milestonesEnabled: false,
      milestones: [],
      hasStarted: false,
      timeGoalEnabled: true,
      timeGoalValue: Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0),
      timeGoalUnit: ctx.getAddTaskDurationUnit(),
      timeGoalPeriod: ctx.getAddTaskDurationPeriod(),
      timeGoalMinutes: proposedMinutes,
    } satisfies Task;
    const validation = validateAggregateTimeGoalTotals([...tasks, draftTask]);
    if (validation.isWithinLimit) return true;
    showAddTaskValidationError(formatAggregateTimeGoalValidationMessage(validation), { duration: true });
    return false;
  }

  function validateAddTaskName() {
    const name = (els.addTaskName?.value || "").trim();
    if (!name) {
      showAddTaskValidationError("Task name is required", { name: true });
      return false;
    }
    return true;
  }

  function validateAddTaskType() {
    if (hasSelectedTaskType()) return true;
    showAddTaskValidationError("Choose Recurring or Once-Off before creating this task.");
    return false;
  }

  function validateAddTaskTimeGoal() {
    syncAddTaskDurationUi();
    if (!(Number(ctx.getAddTaskDurationValue()) > 0)) {
      showAddTaskValidationError("Enter a time amount greater than 0", { duration: true });
      return false;
    }
    if (isOnceOffTaskType()) return true;
    const maxForPeriod = getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), ctx.getAddTaskDurationPeriod());
    if (Number(ctx.getAddTaskDurationValue()) > maxForPeriod) {
      const unitLabel = ctx.getAddTaskDurationUnit() === "minute" ? "minutes" : "hours";
      const periodLabel = ctx.getAddTaskDurationPeriod() === "day" ? "day" : "week";
      showAddTaskValidationError(`Enter ${maxForPeriod} ${unitLabel} or less per ${periodLabel}`, { duration: true });
      return false;
    }
    return validateAddTaskAggregateTimeGoals();
  }

  function validateAddTaskOnceOffDay() {
    if (!isOnceOffTaskType()) return true;
    const selectedDay = String(els.addTaskOnceOffDaySelect?.value || ctx.getAddTaskOnceOffDay()).trim().toLowerCase();
    if (!selectedDay) {
      showAddTaskValidationError("Choose a day for this once-off task.");
      return false;
    }
    ctx.setAddTaskOnceOffDayState(selectedDay as ScheduleDay);
    return true;
  }

  function validateAddTaskCheckpoints() {
    const milestonesEnabled = !!ctx.getAddTaskMilestonesEnabled();
    const milestones = ctx.getAddTaskMilestones();
    const timeGoalMinutes = getAddTaskTimeGoalMinutes();
    const unitSec =
      ctx.getAddTaskMilestoneTimeUnit() === "day" ? 86400 : ctx.getAddTaskMilestoneTimeUnit() === "minute" ? 60 : 3600;
    if (milestonesEnabled && timeGoalMinutes <= 0) {
      showAddTaskValidationError("Set a time goal before enabling Time Checkpoints", { checkpoints: true });
      return false;
    }
    if (milestonesEnabled && (!Array.isArray(milestones) || milestones.length === 0)) {
      showAddTaskValidationError("Add at least 1 checkpoint when Time Checkpoints is enabled", { checkpoints: true });
      return false;
    }
    if (milestonesEnabled && sharedTasks.hasNonPositiveCheckpoint(milestones)) {
      showAddTaskValidationError("Checkpoint times must be greater than 0", { checkpoints: true, checkpointRows: true });
      return false;
    }
    if (milestonesEnabled && sharedTasks.hasCheckpointAtOrAboveTimeGoal(milestones, unitSec, timeGoalMinutes)) {
      showAddTaskValidationError("Checkpoint times must be less than the time goal", {
        checkpoints: true,
        checkpointRows: true,
      });
      return false;
    }
    return true;
  }

  function formatPlannedStartOverlapMessage(tasks: Task[], candidate: Task) {
    const baseMessage = "This planned start overlaps another scheduled task.";
    const suggestion = findNextAvailableScheduleSlot(tasks, candidate);
    return suggestion ? `${baseMessage} ${formatScheduleSlotSuggestion(suggestion)}` : baseMessage;
  }

  function syncAddTaskColorPalette() {
    if (els.addTaskColorTrigger) {
      els.addTaskColorTrigger.classList.toggle("editTaskColorSwatchNone", !selectedColor);
      els.addTaskColorTrigger.style.setProperty("--task-color", selectedColor || "rgba(255,255,255,.18)");
    }
    const palette = els.addTaskColorPalette;
    const activeFamily =
      palette?.getAttribute("data-active-family") ||
      getTaskColorFamilyForColor(selectedColor)?.id ||
      TASK_COLOR_FAMILIES[0].id;
    if (palette) palette.setAttribute("data-active-family", activeFamily);
    if (palette && !palette.getAttribute("data-view")) palette.setAttribute("data-view", "main");
    palette?.querySelectorAll?.("[data-task-color]")?.forEach((node) => {
      const button = node as HTMLElement;
      const isSelected = String(button.dataset.taskColor || "") === String(selectedColor || "");
      button.classList.toggle("isSelected", isSelected);
      if (button.getAttribute("role") === "radio") {
        button.setAttribute("aria-checked", isSelected ? "true" : "false");
      }
    });
    palette?.querySelectorAll?.<HTMLElement>("[data-task-color-family]")?.forEach((button) => {
      const isActive = button.dataset.taskColorFamily === activeFamily;
      if (button.getAttribute("role") === "tab") {
        button.setAttribute("aria-selected", isActive ? "true" : "false");
      }
      button.classList.toggle("isActive", isActive);
    });
    palette?.querySelectorAll?.<HTMLElement>("[data-task-color-family-panel]")?.forEach((panel) => {
      panel.hidden = panel.dataset.taskColorFamilyPanel !== activeFamily;
    });
  }

  function setAddTaskColorFamily(familyId: string | null | undefined) {
    const nextFamily =
      TASK_COLOR_FAMILIES.find((family) => family.id === familyId)?.id ||
      getTaskColorFamilyForColor(selectedColor)?.id ||
      TASK_COLOR_FAMILIES[0].id;
    if (els.addTaskColorPalette) {
      els.addTaskColorPalette.setAttribute("data-active-family", nextFamily);
      els.addTaskColorPalette.setAttribute("data-view", "shades");
    }
    syncAddTaskColorPalette();
  }

  function setAddTaskColorPopoverOpen(open: boolean) {
    if (els.addTaskColorPopover instanceof HTMLElement) {
      els.addTaskColorPopover.style.display = open ? "flex" : "none";
    }
    els.addTaskColorTrigger?.setAttribute("aria-expanded", String(open));
  }

  function resetAddTaskState() {
    ctx.setAddTaskTypeState("recurring");
    ctx.setAddTaskOnceOffDayState("mon");
    ctx.setAddTaskPlannedStartTimeState("09:00");
    ctx.setAddTaskDurationValueState(0);
    ctx.setAddTaskDurationUnitState("hour");
    ctx.setAddTaskDurationPeriodState("day");
    ctx.setAddTaskNoTimeGoalState(false);
    ctx.setAddTaskMilestonesEnabledState(false);
    ctx.setAddTaskMilestoneTimeUnitState("hour");
    ctx.setAddTaskMilestonesState([]);
    ctx.setAddTaskCheckpointSoundEnabledState(false);
    ctx.setAddTaskCheckpointSoundModeState("once");
    ctx.setAddTaskCheckpointToastEnabledState(false);
    ctx.setAddTaskCheckpointToastModeState("auto5s");
    selectedColor = getNextAutoTaskColor(ctx.getTasks());
    selectedColorTouched = false;
    addTaskPlannedStartTouched = false;

    if (els.addTaskName) els.addTaskName.value = "";
    if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.value = "0";
    if (els.addTaskOnceOffDaySelect) els.addTaskOnceOffDaySelect.value = "mon";
    if (els.addTaskPlannedStartPushReminders) els.addTaskPlannedStartPushReminders.checked = false;
    if (els.addTaskPlannedStartInput) els.addTaskPlannedStartInput.value = "09:00";
    if (els.addTaskCheckpointSoundModeSelect) els.addTaskCheckpointSoundModeSelect.value = "once";
    if (els.addTaskCheckpointToastModeSelect) els.addTaskCheckpointToastModeSelect.value = "auto5s";
    if (els.addTaskMsToggle) els.addTaskMsToggle.checked = false;
    if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
    if (els.addTaskAdvancedMenu) els.addTaskAdvancedMenu.open = false;
    setAddTaskColorPopoverOpen(false);
    if (els.addTaskColorPalette) {
      els.addTaskColorPalette.setAttribute("data-view", "main");
    }
    clearAddTaskValidationState();
    syncAddTaskTypeUi();
    syncAddTaskPlannedStartUi();
    syncAddTaskColorPalette();
    syncAddTaskTimeGoalUi();
  }

  function openAddTaskModal() {
    resetAddTaskState();
    renderAddTaskNameMenu("");
    setAddTaskNameMenuOpen(false);
    ctx.setSuppressAddTaskNameFocusOpenState(true);
    ctx.openOverlay(els.addTaskOverlay as HTMLElement | null);
    els.addTaskOverlay?.classList.remove("isClosing");
    els.addTaskOverlay?.classList.add("isOpen");
    setTimeout(() => {
      try {
        els.addTaskName?.focus();
      } catch {}
      ctx.setSuppressAddTaskNameFocusOpenState(false);
    }, 60);
  }

  function closeAddTaskModal() {
    els.addTaskOverlay?.classList.remove("isOpen", "isClosing");
    ctx.closeOverlay(els.addTaskOverlay as HTMLElement | null);
    resetAddTaskState();
    setAddTaskNameMenuOpen(false);
  }

  function createTask() {
    syncPlannedStartValueFromSelectors();
    clearAddTaskValidationState();
    if (!validateAddTaskName()) return;
    if (!validateAddTaskType()) return;
    if (!validateAddTaskOnceOffDay()) return;
    if (!validateAddTaskTimeGoal()) return;
    if (!validateAddTaskCheckpoints()) return;

    const name = (els.addTaskName?.value || "").trim();
    rememberCustomTaskName(name);
    const tasks = ctx.getTasks();
    const nextOrder = (tasks.reduce((mx, task) => Math.max(mx, task.order || 0), 0) || 0) + 1;
    const newTask = sharedTasks.makeTask(name, nextOrder);
    const checkpointingEnabled = !!ctx.getAddTaskMilestonesEnabled() && getAddTaskTimeGoalMinutes() > 0;
    const derivedAlertState = sharedTasks.deriveCheckpointAlertEnabledState({
      milestonesEnabled: checkpointingEnabled,
      milestones: ctx.getAddTaskMilestones(),
    } as Task);

    newTask.color = resolveNewTaskColor({
      tasks,
      selectedColor,
      selectedColorTouched,
    });
    newTask.taskType = ctx.getAddTaskType() === "once-off" ? "once-off" : "recurring";
    newTask.timeGoalEnabled = true;
    newTask.timeGoalValue = Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    newTask.timeGoalUnit = ctx.getAddTaskDurationUnit();
    newTask.timeGoalPeriod = isOnceOffTaskType() ? "day" : ctx.getAddTaskDurationPeriod();
    newTask.timeGoalMinutes = getAddTaskTimeGoalMinutes();
    newTask.milestonesEnabled = checkpointingEnabled;
    newTask.milestoneTimeUnit = ctx.getAddTaskMilestoneTimeUnit();
    newTask.milestones = ctx.sortMilestones(ctx.getAddTaskMilestones().slice()).map((milestone) => ({
      ...milestone,
      description: "",
    }));
    newTask.checkpointSoundEnabled = checkpointingEnabled && derivedAlertState.soundEnabled;
    newTask.checkpointSoundMode = els.addTaskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
    newTask.checkpointToastEnabled = checkpointingEnabled && derivedAlertState.toastEnabled;
    newTask.checkpointToastMode = els.addTaskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s";
    newTask.presetIntervalsEnabled = false;
    newTask.presetIntervalValue = 0;
    newTask.timeGoalAction = "confirmModal";
    newTask.plannedStartPushRemindersEnabled = !!els.addTaskPlannedStartPushReminders?.checked;

    if (isOnceOffTaskType()) {
      const onceOffDay = ctx.getAddTaskOnceOffDay() as ScheduleDay;
      const plannedTime = String(ctx.getAddTaskPlannedStartTime() || "").trim() || "09:00";
      newTask.onceOffDay = onceOffDay;
      newTask.onceOffTargetDate = resolveNextScheduleDayDate(onceOffDay);
      newTask.plannedStartOpenEnded = false;
      newTask.plannedStartDay = onceOffDay;
      newTask.plannedStartTime = plannedTime;
      newTask.plannedStartByDay = { [onceOffDay]: plannedTime };
    } else {
      newTask.onceOffDay = null;
      newTask.onceOffTargetDate = null;
      newTask.plannedStartOpenEnded = false;
      newTask.plannedStartTime = String(ctx.getAddTaskPlannedStartTime() || "").trim() || null;
    }

    if (findScheduleOverlap(tasks, newTask)) {
      showAddTaskValidationError(formatPlannedStartOverlapMessage(tasks, newTask));
      return;
    }

    ctx.setTasks([...tasks, newTask]);
    closeAddTaskModal();
    ctx.save();
    ctx.render();
    ctx.jumpToTaskAndHighlight(String(newTask.id || ""));
  }

  function registerAddTaskEvents() {
    ctx.on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    ctx.on(els.addTaskForm, "submit", (e: Event) => {
      e.preventDefault();
      createTask();
    });
    ctx.on(els.addTaskTypeRecurringBtn, "click", () => {
      if (ctx.getAddTaskType() === "recurring") return;
      ctx.setAddTaskTypeState("recurring");
      clearAddTaskValidationState();
      syncAddTaskTypeUi();
      syncAddTaskDurationUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskTypeOnceOffBtn, "click", () => {
      if (ctx.getAddTaskType() === "once-off") return;
      ctx.setAddTaskTypeState("once-off");
      clearAddTaskValidationState();
      syncAddTaskTypeUi();
      syncAddTaskDurationUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskOnceOffDaySelect, "change", () => {
      ctx.setAddTaskOnceOffDayState((els.addTaskOnceOffDaySelect?.value || "mon") as ScheduleDay);
      clearAddTaskValidationState();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskName, "input", () => {
      if ((els.addTaskName?.value || "").trim()) clearAddTaskValidationState();
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    ctx.on(els.addTaskName, "focus", () => {
      if (ctx.getSuppressAddTaskNameFocusOpen()) return;
    });
    ctx.on(els.addTaskName, "dblclick", () => {
      const isOpen = (els.addTaskNameMenu as HTMLElement | null)?.style.display === "block";
      if (!isOpen) renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
      els.addTaskName?.focus();
    });
    ctx.on(els.addTaskNameMenu, "click", (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      const item = target?.closest?.("[data-add-task-name]");
      if (!item) return;
      const name = item.getAttribute("data-add-task-name") || "";
      if (els.addTaskName) {
        els.addTaskName.value = name;
        els.addTaskName.focus();
      }
      setAddTaskError("");
      setAddTaskNameMenuOpen(false);
    });
    ctx.on(els.addTaskDurationValueInput, "input", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
      syncAddTaskCheckpointAlertUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskDurationValueInput, "change", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
      syncAddTaskCheckpointAlertUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskDurationUnitMinute, "click", () => {
      if (!canUseAdvancedTaskConfig()) return;
      clearAddTaskValidationState();
      ctx.setAddTaskDurationUnitState("minute");
      ctx.setAddTaskMilestoneTimeUnitState("minute");
      syncAddTaskDurationUi();
      syncAddTaskCheckpointAlertUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskDurationUnitHour, "click", () => {
      if (!canUseAdvancedTaskConfig()) return;
      clearAddTaskValidationState();
      ctx.setAddTaskDurationUnitState("hour");
      ctx.setAddTaskMilestoneTimeUnitState("hour");
      syncAddTaskDurationUi();
      syncAddTaskCheckpointAlertUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskDurationPeriodDay, "click", () => {
      if (isOnceOffTaskType()) return;
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("day");
      syncAddTaskDurationUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskDurationPeriodWeek, "click", () => {
      if (isOnceOffTaskType()) return;
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("week");
      syncAddTaskDurationUi();
      maybeAutoFillAddTaskPlannedStart();
    });
    ctx.on(els.addTaskPlannedStartHourSelect, "change", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskPlannedStartHourSelect, "input", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskPlannedStartMinuteSelect, "change", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskPlannedStartMinuteSelect, "input", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskPlannedStartMeridiemSelect, "change", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskPlannedStartMeridiemSelect, "input", () => syncPlannedStartValueFromSelectors({ markTouched: true }));
    ctx.on(els.addTaskColorTrigger, "click", (event: Event) => {
      event.preventDefault?.();
      const isOpen = els.addTaskColorPopover instanceof HTMLElement && els.addTaskColorPopover.style.display === "flex";
      if (!isOpen && els.addTaskColorPalette) {
        const nextFamily =
          getTaskColorFamilyForColor(selectedColor)?.id ||
          els.addTaskColorPalette.getAttribute("data-active-family") ||
          TASK_COLOR_FAMILIES[0].id;
        els.addTaskColorPalette.setAttribute("data-active-family", nextFamily);
        els.addTaskColorPalette.setAttribute("data-view", "main");
        syncAddTaskColorPalette();
      }
      setAddTaskColorPopoverOpen(!isOpen);
    });
    ctx.on(els.addTaskColorPopover, "click", (event: Event) => {
      if (event.target === els.addTaskColorPopover) setAddTaskColorPopoverOpen(false);
    });
    ctx.on(els.addTaskColorPalette, "click", (event: Event) => {
      const familyButton = (event.target as HTMLElement | null)?.closest?.('[data-task-color-family][role="tab"]') as HTMLElement | null;
      if (familyButton && els.addTaskColorPalette?.contains(familyButton)) {
        setAddTaskColorFamily(familyButton.dataset.taskColorFamily);
        return;
      }
      const backButton = (event.target as HTMLElement | null)?.closest?.("[data-task-color-back='true']") as HTMLElement | null;
      if (backButton && els.addTaskColorPalette?.contains(backButton)) {
        els.addTaskColorPalette.setAttribute("data-view", "main");
        syncAddTaskColorPalette();
        return;
      }
      const button = (event.target as HTMLElement | null)?.closest?.("[data-task-color]") as HTMLElement | null;
      if (!button || !els.addTaskColorPalette?.contains(button)) return;
      selectedColorTouched = true;
      selectedColor = normalizeTaskColor(button.dataset.taskColor);
      syncAddTaskColorPalette();
      setAddTaskColorPopoverOpen(false);
    });
    ctx.on(els.addTaskMsToggle, "change", () => {
      if (getAddTaskTimeGoalMinutes() <= 0) {
        if (els.addTaskMsToggle) els.addTaskMsToggle.checked = false;
        syncAddTaskCheckpointAlertUi();
        return;
      }
      ctx.setAddTaskMilestonesEnabledState(!!els.addTaskMsToggle?.checked);
      clearAddTaskValidationState();
      syncAddTaskMilestonesUi();
    });
    ctx.on(els.addTaskCheckpointSoundModeSelect, "change", clearAddTaskValidationState);
    ctx.on(els.addTaskCheckpointToastModeSelect, "change", clearAddTaskValidationState);
    ctx.on(els.addTaskAddMsBtn, "click", () => {
      if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      ctx.setAddTaskMilestonesState([...ctx.getAddTaskMilestones(), { hours: 0, description: "" }]);
      renderAddTaskMilestoneEditor();
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(document, "click", (event: Event) => {
      if (eventTargetClosest(event.target, "#openAddTaskBtn")) {
        event.preventDefault?.();
        openAddTaskModal();
        return;
      }
      if (eventTargetClosest(event.target, "#addTaskNameCombo")) return;
      if (eventTargetClosest(event.target, "#addTaskColorTrigger")) return;
      if (eventTargetClosest(event.target, "#addTaskColorPopoverPanel")) return;
      setAddTaskNameMenuOpen(false);
      setAddTaskColorPopoverOpen(false);
    });
  }

  return {
    openAddTaskModal,
    closeAddTaskModal,
    registerAddTaskEvents,
    loadAddTaskCustomNames,
    rememberCustomTaskName,
    getAddTaskTimeGoalMinutes,
    getAddTaskTimeGoalMinutesState,
    clearAddTaskValidationState,
    applyAddTaskCheckpointValidationHighlights,
    showAddTaskValidationError,
    syncAddTaskDurationReadout,
    renderAddTaskMilestoneEditor,
    syncAddTaskCheckpointAlertUi,
    setAddTaskMilestoneUnitUi: () => {},
  };
}
