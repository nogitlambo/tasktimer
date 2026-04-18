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
import { resolveNextScheduleDayDate, type ScheduleDay } from "../lib/schedule-placement";
import type { Task } from "../lib/types";
import { bindToggleRow, eventTargetClosest, setSwitchState } from "./control-helpers";
import type { TaskTimerAddTaskContext } from "./context";
import { readPlannedStartValueFromSelectors as readPlannedStartValue, syncPlannedStartSelectors } from "./planned-start";

export function createTaskTimerAddTask(ctx: TaskTimerAddTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;
  const ARCHIE_HELP_REQUEST_EVENT = "tasktimer:archieHelpRequest";

  function requestArchieHelp(message: string) {
    if (typeof window === "undefined") return;
    const nextMessage = String(message || "").trim();
    if (!nextMessage) return;
    window.dispatchEvent(new CustomEvent(ARCHIE_HELP_REQUEST_EVENT, { detail: { message: nextMessage } }));
  }

  function canUseAdvancedTaskConfig() {
    // Time Goals and Checkpoints are available on the free plan; keep this gate local so
    // unrelated advanced task configuration entitlements remain unchanged elsewhere.
    return true;
  }

  function setAddTaskError(msg: string) {
    if (!els.addTaskError) return;
    els.addTaskError.textContent = msg;
    els.addTaskError.classList.toggle("isOn", !!String(msg || "").trim());
  }

  function getAddTaskTimeGoalMinutesState() {
    const value = Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    if (!(value > 0) || ctx.getAddTaskNoTimeGoal()) return 0;
    if (ctx.getAddTaskType() === "once-off") {
      return ctx.getAddTaskDurationUnit() === "minute" ? value : value * 60;
    }
    if (ctx.getAddTaskDurationUnit() === "minute") {
      return ctx.getAddTaskDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getAddTaskDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
  }

  function getAddTaskTotalSteps() {
    return ctx.getAddTaskType() === "once-off" ? 5 : 4;
  }

  function getAddTaskVisibleStep(step: 1 | 2 | 3 | 4 | 5) {
    return step;
  }

  function getAddTaskFinalStep() {
    return ctx.getAddTaskType() === "once-off" ? 5 : 4;
  }

  function isOnceOffTaskType() {
    return ctx.getAddTaskType() === "once-off";
  }

  function syncAddTaskTypeUi() {
    const isOnceOff = isOnceOffTaskType();
    const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean) => {
      if (!btn) return;
      btn.classList.toggle("isOn", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    };
    syncPill(els.addTaskTypeRecurringBtn, !isOnceOff);
    syncPill(els.addTaskTypeOnceOffBtn, isOnceOff);
    if (els.addTaskOnceOffDaySelect) {
      els.addTaskOnceOffDaySelect.value = ctx.getAddTaskOnceOffDay();
    }
  }

  function readPlannedStartValueFromSelectors() {
    return readPlannedStartValue({
      hourSelect: els.addTaskPlannedStartHourSelect,
      minuteSelect: els.addTaskPlannedStartMinuteSelect,
      meridiemSelect: els.addTaskPlannedStartMeridiemSelect,
    });
  }

  function syncPlannedStartValueFromSelectors() {
    const nextValue = readPlannedStartValueFromSelectors();
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = nextValue;
    }
    ctx.setAddTaskPlannedStartTimeState(nextValue);
  }

  function syncAddTaskPlannedStartUi() {
    const openEnded = !!ctx.getAddTaskPlannedStartOpenEnded();
    const taskName = String(els.addTaskName?.value || "").trim() || "this task";
    if (els.addTaskPlannedStartPrompt) {
      els.addTaskPlannedStartPrompt.textContent = `What time of the day do you plan to start ${taskName}?`;
    }
    syncPlannedStartSelectors(
      {
        hourSelect: els.addTaskPlannedStartHourSelect,
        minuteSelect: els.addTaskPlannedStartMinuteSelect,
        meridiemSelect: els.addTaskPlannedStartMeridiemSelect,
      },
      ctx.getAddTaskPlannedStartTime() || "09:00",
      { disabled: openEnded }
    );
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = String(ctx.getAddTaskPlannedStartTime() || "09:00");
    }
    if (els.addTaskPlannedStartOpenEnded) {
      els.addTaskPlannedStartOpenEnded.checked = openEnded;
    }
  }

  function clearAddTaskValidationState() {
    els.addTaskError?.classList.remove("isOn");
    if (els.addTaskError) els.addTaskError.textContent = "";
    els.addTaskName?.classList.remove("isInvalid");
    els.addTaskDurationValueInput?.classList.remove("isInvalid");
    els.addTaskMsArea?.classList.remove("isInvalid");
    els.addTaskPresetIntervalField?.classList.remove("isInvalid");
    els.addTaskMsList?.querySelectorAll?.(".msRow.isInvalid")?.forEach((el) => el.classList.remove("isInvalid"));
  }

  function applyAddTaskCheckpointValidationHighlights(opts?: {
    name?: boolean;
    duration?: boolean;
    checkpoints?: boolean;
    checkpointRows?: boolean;
    presetInterval?: boolean;
  }) {
    const options = opts || {};
    els.addTaskName?.classList.toggle("isInvalid", !!options.name);
    els.addTaskDurationValueInput?.classList.toggle("isInvalid", !!options.duration);
    els.addTaskMsArea?.classList.toggle("isInvalid", !!options.checkpoints || !!options.checkpointRows);
    els.addTaskPresetIntervalField?.classList.toggle("isInvalid", !!options.presetInterval);
    const rows = Array.from(els.addTaskMsList?.querySelectorAll?.(".msRow") || []);
    const addTaskTimeGoalMinutes = getAddTaskTimeGoalMinutesState();
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
    opts?: { name?: boolean; duration?: boolean; checkpoints?: boolean; checkpointRows?: boolean; presetInterval?: boolean }
  ) {
    clearAddTaskValidationState();
    applyAddTaskCheckpointValidationHighlights(opts);
    if (els.addTaskError) {
      els.addTaskError.textContent = msg;
      els.addTaskError.classList.add("isOn");
    }
  }

  function syncAddTaskDurationReadout() {
    if (els.addTaskDurationReadout) {
      els.addTaskDurationReadout.textContent = formatAddTaskDurationReadout({
        name: "",
        durationValue: String(ctx.getAddTaskDurationValue()),
        durationUnit: ctx.getAddTaskDurationUnit(),
        durationPeriod: ctx.getAddTaskDurationPeriod(),
        taskType: ctx.getAddTaskType(),
        noTimeGoal: ctx.getAddTaskNoTimeGoal(),
        milestonesEnabled: false,
        milestoneTimeUnit: ctx.getAddTaskMilestoneTimeUnit(),
        milestones: [],
        checkpointSoundEnabled: false,
        checkpointSoundMode: "once",
        checkpointToastEnabled: false,
        checkpointToastMode: "auto5s",
        presetIntervalsEnabled: false,
        presetIntervalValue: "0",
        timeGoalAction: "confirmModal",
      });
    }
  }

  function setAddTaskMilestoneUnitUi() {
    // Checkpoint unit selection is handled in the Set Checkpoint modal.
  }

  function renderAddTaskMilestoneEditor() {
    if (!els.addTaskMsList) return;
    els.addTaskMsList.innerHTML = "";

    const ms = (ctx.getAddTaskMilestones() || []).slice();
    const tempTask = { milestoneTimeUnit: ctx.getAddTaskMilestoneTimeUnit(), milestones: ms } as Task;

    ms.forEach((m, idx) => {
      const row = document.createElement("div");
      row.className = "msRow";
      (row as HTMLElement & { dataset: DOMStringMap }).dataset.msIndex = String(idx);

      row.innerHTML = `
        <div class="pill msSkewField">${ctx.escapeHtmlUI(String(+m.hours || 0))}${sharedTasks.milestoneUnitSuffix(tempTask)}</div>
        <input class="msSkewInput" type="text" value="${ctx.escapeHtmlUI(m.description || "")}" data-field="desc" placeholder="Description">
        <button type="button" title="Remove" data-action="rmMs">&times;</button>
      `;

      const pill = row.querySelector(".pill") as HTMLElement | null;
      ctx.on(pill, "click", () => {
        ctx.openElapsedPadForMilestone(tempTask, m as { hours: number; description: string }, ms, () => {
          ctx.setAddTaskMilestoneTimeUnitState(tempTask.milestoneTimeUnit === "minute" ? "minute" : "hour");
          renderAddTaskMilestoneEditor();
        });
      });

      const desc = row.querySelector('[data-field="desc"]') as HTMLInputElement | null;
      ctx.on(desc, "input", (e: Event) => {
        m.description = (e.target as HTMLInputElement | null)?.value || "";
        ctx.setAddTaskMilestonesState(ms);
      });

      const rm = row.querySelector('[data-action="rmMs"]') as HTMLElement | null;
      ctx.on(rm, "click", () => {
        ms.splice(idx, 1);
        ctx.setAddTaskMilestonesState(ms);
        renderAddTaskMilestoneEditor();
      });

      els.addTaskMsList?.appendChild(row);
    });

    ctx.setAddTaskMilestonesState(ms);
  }

  function syncAddTaskCheckpointAlertUi() {
    const hasActiveTimeGoal = getAddTaskTimeGoalMinutesState() > 0;
    const checkpointsEnabled = !!ctx.getAddTaskMilestonesEnabled() && hasActiveTimeGoal;
    const presetEnabled = checkpointsEnabled && !!ctx.getAddTaskPresetIntervalsEnabled();
    const validPreset = (Number(ctx.getAddTaskPresetIntervalValue()) || 0) > 0;

    els.addTaskTimerSettingsGroup?.classList.toggle("isHidden", !checkpointsEnabled);
    els.addTaskCheckpointAlertsGroup?.classList.toggle("isHidden", !checkpointsEnabled);

    setSwitchState(els.addTaskPresetIntervalsToggle as HTMLElement | null, presetEnabled);
    if (els.addTaskPresetIntervalInput) {
      els.addTaskPresetIntervalInput.value = String(Number(ctx.getAddTaskPresetIntervalValue() || 0) || 0);
    }
    els.addTaskPresetIntervalField?.classList.toggle("isHidden", !presetEnabled);
    if (els.addTaskPresetIntervalNote) {
      const showPresetNote = presetEnabled && !validPreset;
      (els.addTaskPresetIntervalNote as HTMLElement).style.display = showPresetNote ? "block" : "none";
      (els.addTaskPresetIntervalNote as HTMLElement).textContent = showPresetNote
        ? "Enter a preset interval greater than 0 to add checkpoints."
        : "";
    }

    setSwitchState(
      els.addTaskCheckpointSoundToggle as HTMLElement | null,
      checkpointsEnabled && !!ctx.getAddTaskCheckpointSoundEnabled()
    );
    setSwitchState(
      els.addTaskCheckpointToastToggle as HTMLElement | null,
      checkpointsEnabled && !!ctx.getAddTaskCheckpointToastEnabled()
    );
    if (els.addTaskCheckpointSoundModeSelect) {
      els.addTaskCheckpointSoundModeSelect.value = ctx.getAddTaskCheckpointSoundMode() === "repeat" ? "repeat" : "once";
    }
    if (els.addTaskCheckpointToastModeSelect) {
      els.addTaskCheckpointToastModeSelect.value = ctx.getAddTaskCheckpointToastMode() === "manual" ? "manual" : "auto5s";
    }

    const soundAvailable = ctx.getCheckpointAlertSoundEnabled();
    const toastAvailable = ctx.getCheckpointAlertToastEnabled();
    els.addTaskCheckpointSoundToggleRow?.classList.toggle("isDisabled", !checkpointsEnabled || !soundAvailable);
    els.addTaskCheckpointToastToggleRow?.classList.toggle("isDisabled", !checkpointsEnabled || !toastAvailable);
    els.addTaskCheckpointSoundModeField?.classList.toggle(
      "isHidden",
      !checkpointsEnabled || !soundAvailable || !ctx.getAddTaskCheckpointSoundEnabled()
    );
    els.addTaskCheckpointToastModeField?.classList.toggle(
      "isHidden",
      !checkpointsEnabled || !toastAvailable || !ctx.getAddTaskCheckpointToastEnabled()
    );
    if (els.addTaskCheckpointAlertsNote) {
      const notes: string[] = [];
      if (!soundAvailable) notes.push("sound alerts are disabled globally");
      if (!toastAvailable) notes.push("toast alerts are disabled globally");
      if (!hasActiveTimeGoal && ctx.getAddTaskMilestonesEnabled()) notes.unshift("set a time goal first");
      (els.addTaskCheckpointAlertsNote as HTMLElement).style.display = checkpointsEnabled && notes.length ? "block" : "none";
      (els.addTaskCheckpointAlertsNote as HTMLElement).textContent = notes.length
        ? `Checkpoint alerts are currently unavailable because ${notes.join(" and ")}.`
        : "";
    }

    if (els.addTaskAddMsBtn) {
      const blocked = !hasActiveTimeGoal || (checkpointsEnabled && presetEnabled && !validPreset);
      els.addTaskAddMsBtn.disabled = blocked;
      els.addTaskAddMsBtn.title = !hasActiveTimeGoal ? "Set a time goal to add checkpoints" : blocked ? "Enter a preset interval greater than 0" : "";
    }
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

  function getAddTaskTimeGoalMinutes() {
    const value = Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    if (!(value > 0) || ctx.getAddTaskNoTimeGoal()) return 0;
    if (ctx.getAddTaskType() === "once-off") {
      return ctx.getAddTaskDurationUnit() === "minute" ? value : value * 60;
    }
    if (ctx.getAddTaskDurationUnit() === "minute") {
      return ctx.getAddTaskDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getAddTaskDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
  }

  function validateAddTaskAggregateTimeGoals() {
    if (ctx.getAddTaskType() === "once-off") return true;
    if (ctx.getAddTaskNoTimeGoal()) return true;

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

  function setAddTaskCheckpointInfoOpen(open: boolean) {
    const dialog = els.addTaskCheckpointInfoDialog as HTMLElement | null;
    dialog?.classList.toggle("isOpen", open);
    if (els.addTaskCheckpointInfoBtn) {
      els.addTaskCheckpointInfoBtn.setAttribute("aria-expanded", String(open));
    }
  }

  function setAddTaskPresetIntervalsInfoOpen(open: boolean) {
    const dialog = els.addTaskPresetIntervalsInfoDialog as HTMLElement | null;
    dialog?.classList.toggle("isOpen", open);
    if (els.addTaskPresetIntervalsInfoBtn) {
      els.addTaskPresetIntervalsInfoBtn.setAttribute("aria-expanded", String(open));
    }
  }

  function syncAddTaskMilestonesUi() {
    els.addTaskMsToggle?.classList.toggle("on", ctx.getAddTaskMilestonesEnabled());
    els.addTaskMsToggle?.setAttribute("aria-checked", String(ctx.getAddTaskMilestonesEnabled()));
    els.addTaskMsArea?.classList.toggle("on", ctx.getAddTaskMilestonesEnabled());
    syncAddTaskCheckpointAlertUi();
  }

  function syncAddTaskDurationUi() {
    const onceOff = isOnceOffTaskType();
    const noTimeGoal = !!els.addTaskNoGoalCheckbox?.checked;
    ctx.setAddTaskNoTimeGoalState(noTimeGoal);
    if (els.addTaskStep3NextBtn) {
      els.addTaskStep3NextBtn.textContent = noTimeGoal ? "Done" : "Next";
    }
    els.addTaskDurationPerLabel?.classList.toggle("isHidden", onceOff);
    els.addTaskDurationPeriodPills?.classList.toggle("isHidden", onceOff);
    els.addTaskDurationRow?.classList.toggle("isDisabled", noTimeGoal);
    els.addTaskDurationReadout?.classList.toggle("isDisabled", noTimeGoal);
    if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.disabled = noTimeGoal;
    if (onceOff) {
      ctx.setAddTaskDurationPeriodState("week");
    }
    if (noTimeGoal) {
      const syncPill = (btn: HTMLButtonElement | null | undefined, isOn: boolean, hidden = false) => {
        if (!btn) return;
        btn.classList.toggle("isOn", isOn);
        btn.classList.toggle("isHidden", hidden);
        btn.disabled = true;
        btn.setAttribute("aria-pressed", isOn ? "true" : "false");
        btn.setAttribute("aria-hidden", hidden ? "true" : "false");
      };
      syncPill(els.addTaskDurationUnitMinute, ctx.getAddTaskDurationUnit() === "minute");
      syncPill(els.addTaskDurationUnitHour, ctx.getAddTaskDurationUnit() === "hour");
      syncPill(
        els.addTaskDurationPeriodDay,
        ctx.getAddTaskDurationPeriod() === "day",
        onceOff || Number(ctx.getAddTaskDurationValue()) > getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "day")
      );
      syncPill(els.addTaskDurationPeriodWeek, ctx.getAddTaskDurationPeriod() === "week");
      syncAddTaskDurationReadout();
      return;
    }

    const parsedValue = Math.max(0, Math.floor(parseFloat(els.addTaskDurationValueInput?.value || "0") || 0));
    ctx.setAddTaskDurationValueState(parsedValue);
    const maxDay = getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "day");
    const canUseDay = !onceOff && Number(parsedValue) <= maxDay;
    ctx.setAddTaskDurationPeriodState(canUseDay && ctx.getAddTaskDurationPeriod() === "day" ? "day" : "week");
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
    syncPill(els.addTaskDurationUnitMinute, ctx.getAddTaskDurationUnit() === "minute");
    syncPill(els.addTaskDurationUnitHour, ctx.getAddTaskDurationUnit() === "hour");
    syncPill(els.addTaskDurationPeriodDay, ctx.getAddTaskDurationPeriod() === "day", !canUseDay);
    syncPill(els.addTaskDurationPeriodWeek, ctx.getAddTaskDurationPeriod() === "week");
    syncAddTaskDurationReadout();
  }

  function syncAddTaskWizardUi() {
    const step = ctx.getAddTaskWizardStep();
    const onceOff = isOnceOffTaskType();
    const visibleStep = getAddTaskVisibleStep(step);
    els.addTaskStep1?.classList.toggle("isActive", step === 1);
    els.addTaskStepOnceOffDay?.classList.toggle("isActive", onceOff && step === 2);
    els.addTaskStep2?.classList.toggle("isActive", onceOff ? step === 3 : step === 2);
    els.addTaskStep3?.classList.toggle("isActive", onceOff ? step === 4 : step === 3);
    els.addTaskStep4?.classList.toggle("isActive", onceOff ? step === 5 : step === 4);
    if (els.addTaskWizardProgress) {
      els.addTaskWizardProgress.textContent = `Step ${visibleStep} of ${getAddTaskTotalSteps()}`;
    }
    els.addTaskStep1NextBtn?.classList.toggle("isHidden", step !== 1);
    els.addTaskStepOnceOffBackBtn?.classList.toggle("isHidden", !(onceOff && step === 2));
    els.addTaskStepOnceOffNextBtn?.classList.toggle("isHidden", !(onceOff && step === 2));
    els.addTaskStep2BackBtn?.classList.toggle("isHidden", onceOff ? step !== 3 : step !== 2);
    els.addTaskStep2NextBtn?.classList.toggle("isHidden", onceOff ? step !== 3 : step !== 2);
    els.addTaskStep3BackBtn?.classList.toggle("isHidden", onceOff ? step !== 4 : step !== 3);
    els.addTaskStep3NextBtn?.classList.toggle("isHidden", onceOff ? step !== 4 : step !== 3);
    els.addTaskStep4BackBtn?.classList.toggle("isHidden", step !== getAddTaskFinalStep());
    els.addTaskConfirmBtn?.classList.toggle("isHidden", step !== getAddTaskFinalStep());
    if (step !== 1) setAddTaskNameMenuOpen(false);
    syncAddTaskTypeUi();
    syncAddTaskPlannedStartUi();
    syncAddTaskDurationUi();
  }

  function setAddTaskWizardStep(step: 1 | 2 | 3 | 4 | 5) {
    ctx.setAddTaskWizardStepState(step);
    clearAddTaskValidationState();
    syncAddTaskWizardUi();
  }

  function validateAddTaskStep1() {
    const name = (els.addTaskName?.value || "").trim();
    if (!name) {
      showAddTaskValidationError("Task name is required", { name: true });
      return false;
    }
    return true;
  }

  function validateAddTaskStep2() {
    syncAddTaskDurationUi();
    if (ctx.getAddTaskNoTimeGoal()) return true;
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

  function validateAddTaskOnceOffDayStep() {
    const selectedDay = String(els.addTaskOnceOffDaySelect?.value || ctx.getAddTaskOnceOffDay()).trim().toLowerCase();
    if (!selectedDay) {
      showAddTaskValidationError("Choose a day for this once-off task.");
      return false;
    }
    ctx.setAddTaskOnceOffDayState(selectedDay as ScheduleDay);
    return true;
  }

  function validateAddTaskStep3() {
    const milestonesEnabled = ctx.getAddTaskMilestonesEnabled();
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
    if (milestonesEnabled && ctx.getAddTaskPresetIntervalsEnabled() && !(Number(ctx.getAddTaskPresetIntervalValue()) > 0)) {
      showAddTaskValidationError("Enter a preset interval greater than 0", { presetInterval: true });
      return false;
    }
    return true;
  }

  function submitAddTaskWizard() {
    const name = (els.addTaskName?.value || "").trim();
    const onceOff = isOnceOffTaskType();
    rememberCustomTaskName(name);
    setAddTaskError("");
    const tasks = ctx.getTasks();
    const nextOrder = (tasks.reduce((mx, task) => Math.max(mx, task.order || 0), 0) || 0) + 1;
    const newTask = sharedTasks.makeTask(name, nextOrder);
    const checkpointingEnabled = !!ctx.getAddTaskMilestonesEnabled() && getAddTaskTimeGoalMinutes() > 0;
    newTask.milestonesEnabled = checkpointingEnabled;
    newTask.milestoneTimeUnit = ctx.getAddTaskMilestoneTimeUnit();
    newTask.milestones = ctx.sortMilestones(ctx.getAddTaskMilestones().slice());
    newTask.checkpointSoundEnabled = checkpointingEnabled && !!ctx.getAddTaskCheckpointSoundEnabled();
    newTask.checkpointSoundMode = ctx.getAddTaskCheckpointSoundMode() === "repeat" ? "repeat" : "once";
    newTask.checkpointToastEnabled = checkpointingEnabled && !!ctx.getAddTaskCheckpointToastEnabled();
    newTask.checkpointToastMode = ctx.getAddTaskCheckpointToastMode() === "manual" ? "manual" : "auto5s";
    newTask.presetIntervalsEnabled = checkpointingEnabled && !!ctx.getAddTaskPresetIntervalsEnabled();
    newTask.presetIntervalValue = Math.max(0, Number(ctx.getAddTaskPresetIntervalValue()) || 0);
    newTask.timeGoalAction = "confirmModal";
    newTask.taskType = onceOff ? "once-off" : "recurring";
    newTask.onceOffDay = onceOff ? (ctx.getAddTaskOnceOffDay() as ScheduleDay) : null;
    newTask.onceOffTargetDate = onceOff ? resolveNextScheduleDayDate(ctx.getAddTaskOnceOffDay() as ScheduleDay) : null;
    newTask.timeGoalEnabled = !ctx.getAddTaskNoTimeGoal();
    newTask.timeGoalValue = ctx.getAddTaskNoTimeGoal() ? 0 : Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    newTask.timeGoalUnit = ctx.getAddTaskNoTimeGoal() ? "hour" : ctx.getAddTaskDurationUnit();
    newTask.timeGoalPeriod = ctx.getAddTaskNoTimeGoal() || onceOff ? "week" : ctx.getAddTaskDurationPeriod();
    newTask.timeGoalMinutes = getAddTaskTimeGoalMinutes();
    if (onceOff) {
      const onceOffDay = ctx.getAddTaskOnceOffDay() as ScheduleDay;
      const plannedTime = String(ctx.getAddTaskPlannedStartTime() || "").trim() || "09:00";
      newTask.plannedStartOpenEnded = !!ctx.getAddTaskPlannedStartOpenEnded();
      newTask.plannedStartDay = onceOffDay;
      newTask.plannedStartTime = plannedTime;
      newTask.plannedStartByDay = { [onceOffDay]: plannedTime };
    } else {
      newTask.plannedStartOpenEnded = !!ctx.getAddTaskPlannedStartOpenEnded();
      if (newTask.plannedStartOpenEnded) {
        newTask.plannedStartTime = null;
        newTask.plannedStartDay = null;
        newTask.plannedStartByDay = null;
      } else {
        newTask.plannedStartTime = String(ctx.getAddTaskPlannedStartTime() || "").trim() || null;
      }
    }
    ctx.setTasks([...tasks, newTask]);
    closeAddTaskModal();
    ctx.save();
    ctx.render();
    ctx.jumpToTaskAndHighlight(String(newTask.id || ""));
  }

  function resetAddTaskWizardState() {
    ctx.setAddTaskWizardStepState(1);
    ctx.setAddTaskTypeState("recurring");
    ctx.setAddTaskOnceOffDayState("mon");
    ctx.setAddTaskPlannedStartTimeState("09:00");
    ctx.setAddTaskPlannedStartOpenEndedState(false);
    ctx.setAddTaskDurationValueState(5);
    ctx.setAddTaskDurationUnitState("hour");
    ctx.setAddTaskMilestoneTimeUnitState("hour");
    ctx.setAddTaskDurationPeriodState("week");
    ctx.setAddTaskNoTimeGoalState(false);
    if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.value = String(5);
    if (els.addTaskNoGoalCheckbox) els.addTaskNoGoalCheckbox.checked = false;
    if (els.addTaskOnceOffDaySelect) els.addTaskOnceOffDaySelect.value = "mon";
    if (els.addTaskPlannedStartInput) els.addTaskPlannedStartInput.value = "09:00";
    if (els.addTaskPlannedStartOpenEnded) els.addTaskPlannedStartOpenEnded.checked = false;
    setAddTaskCheckpointInfoOpen(false);
    setAddTaskPresetIntervalsInfoOpen(false);
    syncAddTaskWizardUi();
  }

  function resetAddTaskMilestones() {
    ctx.setAddTaskMilestonesEnabledState(false);
    ctx.setAddTaskMilestoneTimeUnitState(ctx.getAddTaskDurationUnit());
    ctx.setAddTaskMilestonesState([]);
    ctx.setAddTaskCheckpointSoundEnabledState(false);
    ctx.setAddTaskCheckpointSoundModeState("once");
    ctx.setAddTaskCheckpointToastEnabledState(ctx.getCheckpointAlertToastEnabled());
    ctx.setAddTaskCheckpointToastModeState("auto5s");
    ctx.setAddTaskPresetIntervalsEnabledState(false);
    ctx.setAddTaskPresetIntervalValueState(0);
    if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
    clearAddTaskValidationState();
    syncAddTaskMilestonesUi();
  }

  function openAddTaskModal() {
    resetAddTaskMilestones();
    resetAddTaskWizardState();
    setAddTaskError("");
    renderAddTaskNameMenu("");
    setAddTaskNameMenuOpen(false);
    ctx.setSuppressAddTaskNameFocusOpenState(true);
    ctx.openOverlay(els.addTaskOverlay as HTMLElement | null);
    setTimeout(() => {
      try {
        els.addTaskName?.focus();
      } catch {
        // ignore
      }
      ctx.setSuppressAddTaskNameFocusOpenState(false);
    }, 60);
  }

  function closeAddTaskModal() {
    ctx.closeOverlay(els.addTaskOverlay as HTMLElement | null);
    if (els.addTaskName) els.addTaskName.value = "";
    setAddTaskNameMenuOpen(false);
    setAddTaskError("");
    resetAddTaskMilestones();
    resetAddTaskWizardState();
  }

  function registerAddTaskEvents() {
    ctx.on(els.openAddTaskBtn, "click", openAddTaskModal);
    ctx.on(els.addTaskCancelBtn, "click", closeAddTaskModal);
    ctx.on(els.addTaskStep1NextBtn, "click", () => {
      if (!validateAddTaskStep1()) return;
      setAddTaskWizardStep(2);
      try {
        if (isOnceOffTaskType()) {
          els.addTaskOnceOffDaySelect?.focus();
        } else {
          els.addTaskDurationValueInput?.focus();
        }
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskTypeRecurringBtn, "click", () => {
      if (ctx.getAddTaskType() === "recurring") return;
      const currentStep = ctx.getAddTaskWizardStep();
      ctx.setAddTaskTypeState("recurring");
      if (currentStep >= 2) {
        setAddTaskWizardStep(Math.max(2, currentStep - 1) as 1 | 2 | 3 | 4 | 5);
      } else {
        syncAddTaskWizardUi();
      }
    });
    ctx.on(els.addTaskTypeOnceOffBtn, "click", () => {
      if (ctx.getAddTaskType() === "once-off") return;
      const currentStep = ctx.getAddTaskWizardStep();
      ctx.setAddTaskTypeState("once-off");
      if (currentStep >= 2) {
        const nextStep = currentStep === 2 ? 2 : Math.min(5, currentStep + 1);
        setAddTaskWizardStep(nextStep as 1 | 2 | 3 | 4 | 5);
      } else {
        syncAddTaskWizardUi();
      }
    });
    ctx.on(els.addTaskOnceOffDaySelect, "change", () => {
      ctx.setAddTaskOnceOffDayState((els.addTaskOnceOffDaySelect?.value || "mon") as ScheduleDay);
      clearAddTaskValidationState();
    });
    ctx.on(els.addTaskStepOnceOffBackBtn, "click", () => {
      setAddTaskWizardStep(1);
      try {
        els.addTaskName?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStepOnceOffNextBtn, "click", () => {
      if (!validateAddTaskOnceOffDayStep()) return;
      setAddTaskWizardStep(3);
      try {
        els.addTaskDurationValueInput?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep2BackBtn, "click", () => {
      setAddTaskWizardStep(isOnceOffTaskType() ? 2 : 1);
      try {
        if (isOnceOffTaskType()) {
          els.addTaskOnceOffDaySelect?.focus();
        } else {
          els.addTaskName?.focus();
        }
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep2NextBtn, "click", () => {
      if (!validateAddTaskStep2()) return;
      setAddTaskWizardStep(isOnceOffTaskType() ? 4 : 3);
      try {
        els.addTaskPlannedStartHourSelect?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep3BackBtn, "click", () => {
      setAddTaskWizardStep(isOnceOffTaskType() ? 3 : 2);
      try {
        els.addTaskDurationValueInput?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep3NextBtn, "click", () => {
      if (ctx.getAddTaskNoTimeGoal()) {
        submitAddTaskWizard();
        return;
      }
      setAddTaskWizardStep(getAddTaskFinalStep());
    });
    ctx.on(els.addTaskStep4BackBtn, "click", () => {
      setAddTaskWizardStep(isOnceOffTaskType() ? 4 : 3);
      try {
        els.addTaskPlannedStartHourSelect?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskDurationValueInput, "input", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationValueInput, "change", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationUnitMinute, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationUnitState("minute");
      ctx.setAddTaskMilestoneTimeUnitState("minute");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationUnitHour, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationUnitState("hour");
      ctx.setAddTaskMilestoneTimeUnitState("hour");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationPeriodDay, "click", () => {
      if (isOnceOffTaskType()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("day");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationPeriodWeek, "click", () => {
      if (isOnceOffTaskType()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("week");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskNoGoalCheckbox, "change", () => {
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskCheckpointInfoBtn, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setAddTaskCheckpointInfoOpen(false);
      requestArchieHelp(
        "Time checkpoints are optional milestone markers during a task timer run. Use them to track progress points and trigger checkpoint alerts while the task is active."
      );
    });
    ctx.on(els.addTaskPresetIntervalsInfoBtn, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      setAddTaskPresetIntervalsInfoOpen(false);
      requestArchieHelp(
        "Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint."
      );
    });
    ctx.on(document, "click", (e: Event) => {
      if (eventTargetClosest(e.target, "#addTaskCheckpointInfoBtn")) return;
      if (eventTargetClosest(e.target, "#addTaskCheckpointInfoDialog")) return;
      if (eventTargetClosest(e.target, "#addTaskPresetIntervalsInfoBtn")) return;
      if (eventTargetClosest(e.target, "#addTaskPresetIntervalsInfoDialog")) return;
      if (!eventTargetClosest(e.target, "#addTaskNameCombo")) setAddTaskNameMenuOpen(false);
      setAddTaskCheckpointInfoOpen(false);
      setAddTaskPresetIntervalsInfoOpen(false);
    });
    ctx.on(els.addTaskMsToggle, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      const nextEnabled = !ctx.getAddTaskMilestonesEnabled();
      ctx.setAddTaskMilestonesEnabledState(nextEnabled);
      if (!nextEnabled) {
        ctx.setAddTaskPresetIntervalsEnabledState(false);
      }
      syncAddTaskMilestonesUi();
    });
    ctx.on(els.addTaskName, "input", () => {
      if ((els.addTaskName?.value || "").trim()) clearAddTaskValidationState();
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
      syncAddTaskPlannedStartUi();
    });
    ctx.on(els.addTaskName, "focus", () => {
      if (ctx.getSuppressAddTaskNameFocusOpen()) return;
      renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(true);
    });
    ctx.on(els.addTaskNameToggle, "click", (ev: Event) => {
      ev.preventDefault?.();
      const isOpen = (els.addTaskNameMenu as HTMLElement | null)?.style.display === "block";
      if (!isOpen) renderAddTaskNameMenu(els.addTaskName?.value || "");
      setAddTaskNameMenuOpen(!isOpen);
      if (!isOpen) els.addTaskName?.focus();
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
      syncAddTaskPlannedStartUi();
    });
    ctx.on(els.addTaskPlannedStartHourSelect, "change", syncPlannedStartValueFromSelectors);
    ctx.on(els.addTaskPlannedStartMinuteSelect, "change", syncPlannedStartValueFromSelectors);
    ctx.on(els.addTaskPlannedStartMeridiemSelect, "change", syncPlannedStartValueFromSelectors);
    ctx.on(els.addTaskPlannedStartOpenEnded, "change", () => {
      ctx.setAddTaskPlannedStartOpenEndedState(!!els.addTaskPlannedStartOpenEnded?.checked);
      syncAddTaskPlannedStartUi();
    });
    bindToggleRow({
      on: ctx.on,
      control: els.addTaskPresetIntervalsToggle,
      row: els.addTaskPresetIntervalsToggleRow,
      ignoreSelector:
        "#addTaskPresetIntervalsToggle, #addTaskPresetIntervalsInfoBtn, #addTaskPresetIntervalsInfoSlot, #addTaskPresetIntervalsInfoDialog",
      handleToggle: () => {
        if (!canUseAdvancedTaskConfig()) {
          ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
          return;
        }
        if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0) return;
        ctx.setAddTaskPresetIntervalsEnabledState(!ctx.getAddTaskPresetIntervalsEnabled());
        syncAddTaskCheckpointAlertUi();
      },
    });
    ctx.on(els.addTaskPresetIntervalInput, "input", () => {
      ctx.setAddTaskPresetIntervalValueState(Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0));
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskPresetIntervalInput, "change", () => {
      ctx.setAddTaskPresetIntervalValueState(Math.max(0, parseFloat(els.addTaskPresetIntervalInput?.value || "0") || 0));
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    bindToggleRow({
      on: ctx.on,
      control: els.addTaskCheckpointSoundToggle,
      row: els.addTaskCheckpointSoundToggleRow,
      ignoreSelector: "#addTaskCheckpointSoundToggle",
      handleToggle: () => {
        if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0 || !ctx.getCheckpointAlertSoundEnabled()) return;
        ctx.setAddTaskCheckpointSoundEnabledState(!ctx.getAddTaskCheckpointSoundEnabled());
        syncAddTaskCheckpointAlertUi();
      },
    });
    ctx.on(els.addTaskCheckpointSoundModeSelect, "change", () => {
      ctx.setAddTaskCheckpointSoundModeState(els.addTaskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once");
      syncAddTaskCheckpointAlertUi();
    });
    bindToggleRow({
      on: ctx.on,
      control: els.addTaskCheckpointToastToggle,
      row: els.addTaskCheckpointToastToggleRow,
      ignoreSelector: "#addTaskCheckpointToastToggle",
      handleToggle: () => {
        if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0 || !ctx.getCheckpointAlertToastEnabled()) return;
        ctx.setAddTaskCheckpointToastEnabledState(!ctx.getAddTaskCheckpointToastEnabled());
        syncAddTaskCheckpointAlertUi();
      },
    });
    ctx.on(els.addTaskCheckpointToastModeSelect, "change", () => {
      ctx.setAddTaskCheckpointToastModeState(els.addTaskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s");
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskAddMsBtn, "click", () => {
      if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      if (ctx.getAddTaskPresetIntervalsEnabled()) {
        const interval = Math.max(0, Number(ctx.getAddTaskPresetIntervalValue()) || 0);
        if (interval <= 0) {
          syncAddTaskCheckpointAlertUi();
          return;
        }
        const milestones = ctx.getAddTaskMilestones();
        const base = milestones.length ? Number(milestones[milestones.length - 1]?.hours || 0) : 0;
        const nextHours = base + interval;
        if (
          sharedTasks.isCheckpointAtOrAboveTimeGoal(
            nextHours,
            ctx.getAddTaskMilestoneTimeUnit() === "day" ? 86400 : ctx.getAddTaskMilestoneTimeUnit() === "minute" ? 60 : 3600,
            getAddTaskTimeGoalMinutes()
          )
        ) {
          showAddTaskValidationError("Checkpoint times must be less than the time goal", {
            checkpoints: true,
            checkpointRows: true,
          });
          syncAddTaskCheckpointAlertUi();
          return;
        }
        ctx.setAddTaskMilestonesState([...milestones, { hours: nextHours, description: "" }]);
      } else {
        ctx.setAddTaskMilestonesState([...ctx.getAddTaskMilestones(), { hours: 0, description: "" }]);
      }
      renderAddTaskMilestoneEditor();
      clearAddTaskValidationState();
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskForm, "submit", (e: Event) => {
      e.preventDefault();
      clearAddTaskValidationState();
      if (ctx.getAddTaskWizardStep() !== getAddTaskFinalStep()) return;
      if (!validateAddTaskStep1()) return;
      if (isOnceOffTaskType() && !validateAddTaskOnceOffDayStep()) return;
      if (!validateAddTaskStep2()) return;
      if (!validateAddTaskStep3()) return;
      submitAddTaskWizard();
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
    setAddTaskMilestoneUnitUi,
  };
}
