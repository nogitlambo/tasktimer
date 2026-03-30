import {
  ADD_TASK_PRESET_NAMES,
  filterTaskNameOptions,
  parseRecentCustomTaskNames,
  rememberRecentCustomTaskName,
} from "../lib/addTaskNames";
import { formatAddTaskDurationReadout, getAddTaskDurationMaxForPeriod } from "../lib/taskConfig";
import type { Task } from "../lib/types";
import type { TaskTimerAddTaskContext } from "./context";

export function createTaskTimerAddTask(ctx: TaskTimerAddTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;

  function canUseAdvancedTaskConfig() {
    return ctx.hasEntitlement("advancedTaskConfig");
  }

  function toggleSwitchElement(el: HTMLElement | null, on: boolean) {
    if (!el) return;
    el.classList.toggle("on", !!on);
    el.setAttribute("aria-checked", on ? "true" : "false");
  }

  function setAddTaskError(msg: string) {
    if (!els.addTaskError) return;
    els.addTaskError.textContent = msg;
    els.addTaskError.classList.toggle("isOn", !!String(msg || "").trim());
  }

  function getAddTaskTimeGoalMinutesState() {
    const value = Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    if (!(value > 0) || ctx.getAddTaskNoTimeGoal()) return 0;
    if (ctx.getAddTaskDurationUnit() === "minute") {
      return ctx.getAddTaskDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getAddTaskDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
  }

  function syncAddTaskPlannedStartUi() {
    const taskName = String(els.addTaskName?.value || "").trim() || "this task";
    if (els.addTaskPlannedStartPrompt) {
      els.addTaskPlannedStartPrompt.textContent = `What time of the day do you plan to start ${taskName}?`;
    }
    if (els.addTaskPlannedStartInput) {
      els.addTaskPlannedStartInput.value = String(ctx.getAddTaskPlannedStartTime() || "09:00");
      els.addTaskPlannedStartInput.disabled = !!ctx.getAddTaskPlannedStartOpenEnded();
      els.addTaskPlannedStartInput.classList.toggle("isDisabled", !!ctx.getAddTaskPlannedStartOpenEnded());
    }
    if (els.addTaskPlannedStartOpenEnded) {
      els.addTaskPlannedStartOpenEnded.checked = !!ctx.getAddTaskPlannedStartOpenEnded();
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
        mode: ctx.getCurrentMode(),
        durationValue: String(ctx.getAddTaskDurationValue()),
        durationUnit: ctx.getAddTaskDurationUnit(),
        durationPeriod: ctx.getAddTaskDurationPeriod(),
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

  function setAddTaskMilestoneUnitUi(unit: "day" | "hour" | "minute") {
    els.addTaskMsUnitDay?.classList.toggle("isOn", unit === "day");
    els.addTaskMsUnitHour?.classList.toggle("isOn", unit === "hour");
    els.addTaskMsUnitMinute?.classList.toggle("isOn", unit === "minute");
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
        ctx.openElapsedPadForMilestone(tempTask, m as { hours: number; description: string }, ms, renderAddTaskMilestoneEditor);
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

    toggleSwitchElement(els.addTaskPresetIntervalsToggle as HTMLElement | null, presetEnabled);
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

    toggleSwitchElement(
      els.addTaskCheckpointSoundToggle as HTMLElement | null,
      checkpointsEnabled && !!ctx.getAddTaskCheckpointSoundEnabled()
    );
    toggleSwitchElement(
      els.addTaskCheckpointToastToggle as HTMLElement | null,
      checkpointsEnabled && !!ctx.getAddTaskCheckpointToastEnabled()
    );
    if (els.addTaskCheckpointSoundModeSelect) {
      els.addTaskCheckpointSoundModeSelect.value = ctx.getAddTaskCheckpointSoundMode() === "repeat" ? "repeat" : "once";
    }
    if (els.addTaskCheckpointToastModeSelect) {
      els.addTaskCheckpointToastModeSelect.value = ctx.getAddTaskCheckpointToastMode() === "manual" ? "manual" : "auto5s";
    }
    if (els.addTaskFinalCheckpointActionSelect) {
      els.addTaskFinalCheckpointActionSelect.value =
        ctx.getAddTaskTimeGoalAction() === "resetLog" ||
        ctx.getAddTaskTimeGoalAction() === "resetNoLog" ||
        ctx.getAddTaskTimeGoalAction() === "confirmModal"
          ? ctx.getAddTaskTimeGoalAction()
          : "confirmModal";
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
    if (ctx.getAddTaskDurationUnit() === "minute") {
      return ctx.getAddTaskDurationPeriod() === "day" ? value : value * 7;
    }
    return ctx.getAddTaskDurationPeriod() === "day" ? value * 60 : value * 60 * 7;
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
    const advancedLocked = !canUseAdvancedTaskConfig();
    els.addTaskMsToggle?.classList.toggle("on", ctx.getAddTaskMilestonesEnabled());
    els.addTaskMsToggle?.setAttribute("aria-checked", String(ctx.getAddTaskMilestonesEnabled()));
    if (els.addTaskMsToggle) {
      (els.addTaskMsToggle as HTMLButtonElement).disabled = advancedLocked;
      els.addTaskMsToggle.setAttribute("aria-disabled", String(advancedLocked));
    }
    els.addTaskMsArea?.classList.toggle("on", ctx.getAddTaskMilestonesEnabled());
    els.addTaskMsArea?.classList.toggle("isDisabled", advancedLocked);
    setAddTaskMilestoneUnitUi(ctx.getAddTaskMilestoneTimeUnit());
    syncAddTaskCheckpointAlertUi();
  }

  function syncAddTaskDurationUi() {
    const advancedLocked = !canUseAdvancedTaskConfig();
    if (advancedLocked) {
      ctx.setAddTaskNoTimeGoalState(true);
      if (els.addTaskNoGoalCheckbox) {
        els.addTaskNoGoalCheckbox.checked = true;
        els.addTaskNoGoalCheckbox.disabled = true;
      }
    } else if (els.addTaskNoGoalCheckbox) {
      els.addTaskNoGoalCheckbox.disabled = false;
    }
    const noTimeGoal = !!els.addTaskNoGoalCheckbox?.checked;
    ctx.setAddTaskNoTimeGoalState(noTimeGoal);
    if (els.addTaskStep2NextBtn) {
      els.addTaskStep2NextBtn.textContent = noTimeGoal ? "Done" : "Next";
    }
    els.addTaskDurationRow?.classList.toggle("isDisabled", noTimeGoal);
    els.addTaskDurationReadout?.classList.toggle("isDisabled", noTimeGoal);
    if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.disabled = noTimeGoal;
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
        Number(ctx.getAddTaskDurationValue()) > getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "day")
      );
      syncPill(els.addTaskDurationPeriodWeek, ctx.getAddTaskDurationPeriod() === "week");
      syncAddTaskDurationReadout();
      return;
    }

    const parsedValue = Math.max(0, Math.floor(parseFloat(els.addTaskDurationValueInput?.value || "0") || 0));
    ctx.setAddTaskDurationValueState(parsedValue);
    const maxDay = getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "day");
    const canUseDay = Number(parsedValue) <= maxDay;
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
    els.addTaskStep1?.classList.toggle("isActive", step === 1);
    els.addTaskStep2?.classList.toggle("isActive", step === 2);
    els.addTaskStep3?.classList.toggle("isActive", step === 3);
    els.addTaskStep4?.classList.toggle("isActive", step === 4);
    if (els.addTaskWizardProgress) {
      els.addTaskWizardProgress.textContent = `Step ${step} of 4`;
    }
    els.addTaskStep1NextBtn?.classList.toggle("isHidden", step !== 1);
    els.addTaskStep2BackBtn?.classList.toggle("isHidden", step !== 2);
    els.addTaskStep2NextBtn?.classList.toggle("isHidden", step !== 2);
    els.addTaskStep3BackBtn?.classList.toggle("isHidden", step !== 3);
    els.addTaskStep3NextBtn?.classList.toggle("isHidden", step !== 3);
    els.addTaskStep4BackBtn?.classList.toggle("isHidden", step !== 4);
    els.addTaskConfirmBtn?.classList.toggle("isHidden", step !== 4);
    if (step !== 1) setAddTaskNameMenuOpen(false);
    syncAddTaskPlannedStartUi();
    syncAddTaskDurationUi();
  }

  function setAddTaskWizardStep(step: 1 | 2 | 3 | 4) {
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
    const maxWeek = getAddTaskDurationMaxForPeriod(ctx.getAddTaskDurationUnit(), "week");
    if (Number(ctx.getAddTaskDurationValue()) > maxWeek) {
      const unitLabel = ctx.getAddTaskDurationUnit() === "minute" ? "minutes" : "hours";
      showAddTaskValidationError(`Enter ${maxWeek} ${unitLabel} or less per week`, { duration: true });
      return false;
    }
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
    newTask.timeGoalAction =
      ctx.getAddTaskTimeGoalAction() === "resetLog" ||
      ctx.getAddTaskTimeGoalAction() === "resetNoLog" ||
      ctx.getAddTaskTimeGoalAction() === "confirmModal"
        ? ctx.getAddTaskTimeGoalAction()
        : "confirmModal";
    newTask.timeGoalEnabled = !ctx.getAddTaskNoTimeGoal();
    newTask.timeGoalValue = ctx.getAddTaskNoTimeGoal() ? 0 : Math.max(0, Number(ctx.getAddTaskDurationValue()) || 0);
    newTask.timeGoalUnit = ctx.getAddTaskNoTimeGoal() ? "hour" : ctx.getAddTaskDurationUnit();
    newTask.timeGoalPeriod = ctx.getAddTaskNoTimeGoal() ? "week" : ctx.getAddTaskDurationPeriod();
    newTask.timeGoalMinutes = getAddTaskTimeGoalMinutes();
    newTask.plannedStartTime = String(ctx.getAddTaskPlannedStartTime() || "").trim() || null;
    newTask.plannedStartOpenEnded = !!ctx.getAddTaskPlannedStartOpenEnded();
    ctx.setTasks([...tasks, newTask]);
    closeAddTaskModal();
    ctx.save();
    ctx.render();
    ctx.jumpToTaskAndHighlight(String(newTask.id || ""));
  }

  function resetAddTaskWizardState() {
    ctx.setAddTaskWizardStepState(1);
    ctx.setAddTaskPlannedStartTimeState("09:00");
    ctx.setAddTaskPlannedStartOpenEndedState(false);
    ctx.setAddTaskDurationValueState(5);
    ctx.setAddTaskDurationUnitState("hour");
    ctx.setAddTaskDurationPeriodState("week");
    ctx.setAddTaskNoTimeGoalState(false);
    if (els.addTaskDurationValueInput) els.addTaskDurationValueInput.value = String(5);
    if (els.addTaskNoGoalCheckbox) els.addTaskNoGoalCheckbox.checked = false;
    if (els.addTaskPlannedStartInput) els.addTaskPlannedStartInput.value = "09:00";
    if (els.addTaskPlannedStartOpenEnded) els.addTaskPlannedStartOpenEnded.checked = false;
    setAddTaskCheckpointInfoOpen(false);
    setAddTaskPresetIntervalsInfoOpen(false);
    syncAddTaskWizardUi();
  }

  function resetAddTaskMilestones() {
    ctx.setAddTaskMilestonesEnabledState(false);
    ctx.setAddTaskMilestoneTimeUnitState(ctx.getDefaultTaskTimerFormat());
    ctx.setAddTaskMilestonesState([]);
    ctx.setAddTaskCheckpointSoundEnabledState(false);
    ctx.setAddTaskCheckpointSoundModeState("once");
    ctx.setAddTaskCheckpointToastEnabledState(false);
    ctx.setAddTaskCheckpointToastModeState("auto5s");
    ctx.setAddTaskPresetIntervalsEnabledState(false);
    ctx.setAddTaskPresetIntervalValueState(0);
    ctx.setAddTaskTimeGoalActionState("confirmModal");
    if (els.addTaskMsList) els.addTaskMsList.innerHTML = "";
    const milestoneDetails = els.addTaskMsArea as HTMLDetailsElement | null;
    if (milestoneDetails) milestoneDetails.open = false;
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
        els.addTaskPlannedStartInput?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep2BackBtn, "click", () => {
      setAddTaskWizardStep(1);
      try {
        els.addTaskName?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep2NextBtn, "click", () => {
      setAddTaskWizardStep(3);
      try {
        els.addTaskDurationValueInput?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep3BackBtn, "click", () => {
      setAddTaskWizardStep(2);
      try {
        els.addTaskPlannedStartInput?.focus();
      } catch {
        // ignore
      }
    });
    ctx.on(els.addTaskStep3NextBtn, "click", () => {
      if (!validateAddTaskStep2()) return;
      if (ctx.getAddTaskNoTimeGoal()) {
        if (!validateAddTaskStep1()) return;
        submitAddTaskWizard();
        return;
      }
      setAddTaskWizardStep(4);
    });
    ctx.on(els.addTaskStep4BackBtn, "click", () => {
      setAddTaskWizardStep(3);
      try {
        els.addTaskDurationValueInput?.focus();
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
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationUnitHour, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationUnitState("hour");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationPeriodDay, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("day");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskDurationPeriodWeek, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      ctx.setAddTaskDurationPeriodState("week");
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskNoGoalCheckbox, "change", () => {
      if (!canUseAdvancedTaskConfig() && !els.addTaskNoGoalCheckbox?.checked) {
        if (els.addTaskNoGoalCheckbox) els.addTaskNoGoalCheckbox.checked = true;
        ctx.showUpgradePrompt("Time goal configuration", "pro");
        return;
      }
      clearAddTaskValidationState();
      syncAddTaskDurationUi();
    });
    ctx.on(els.addTaskCheckpointInfoBtn, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.addTaskCheckpointInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setAddTaskCheckpointInfoOpen(!isOpen);
    });
    ctx.on(els.addTaskPresetIntervalsInfoBtn, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      const isOpen = (els.addTaskPresetIntervalsInfoDialog as HTMLElement | null)?.classList.contains("isOpen") || false;
      setAddTaskPresetIntervalsInfoOpen(!isOpen);
    });
    ctx.on(document, "click", (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("#addTaskCheckpointInfoBtn")) return;
      if (target?.closest?.("#addTaskCheckpointInfoDialog")) return;
      if (target?.closest?.("#addTaskPresetIntervalsInfoBtn")) return;
      if (target?.closest?.("#addTaskPresetIntervalsInfoDialog")) return;
      if (!target?.closest?.("#addTaskNameCombo")) setAddTaskNameMenuOpen(false);
      setAddTaskCheckpointInfoOpen(false);
      setAddTaskPresetIntervalsInfoOpen(false);
    });
    ctx.on(els.addTaskMsToggle, "click", (e: Event) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      if (getAddTaskTimeGoalMinutes() <= 0) {
        syncAddTaskCheckpointAlertUi();
        return;
      }
      const nextEnabled = !ctx.getAddTaskMilestonesEnabled();
      ctx.setAddTaskMilestonesEnabledState(nextEnabled);
      const details = els.addTaskMsArea as HTMLDetailsElement | null;
      if (details) {
        const hasCheckpoints = Array.isArray(ctx.getAddTaskMilestones()) && ctx.getAddTaskMilestones().length > 0;
        details.open = !!nextEnabled && !hasCheckpoints;
      }
      if (!nextEnabled) {
        ctx.setAddTaskPresetIntervalsEnabledState(false);
      }
      syncAddTaskMilestonesUi();
    });
    ctx.on(els.addTaskMsUnitDay, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      ctx.setAddTaskMilestoneTimeUnitState("day");
      setAddTaskMilestoneUnitUi("day");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskMsUnitHour, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      ctx.setAddTaskMilestoneTimeUnitState("hour");
      setAddTaskMilestoneUnitUi("hour");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskMsUnitMinute, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      ctx.setAddTaskMilestoneTimeUnitState("minute");
      setAddTaskMilestoneUnitUi("minute");
      renderAddTaskMilestoneEditor();
      syncAddTaskCheckpointAlertUi();
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
    ctx.on(els.addTaskPlannedStartInput, "input", () => {
      ctx.setAddTaskPlannedStartTimeState(String(els.addTaskPlannedStartInput?.value || "09:00"));
    });
    ctx.on(els.addTaskPlannedStartOpenEnded, "change", () => {
      ctx.setAddTaskPlannedStartOpenEndedState(!!els.addTaskPlannedStartOpenEnded?.checked);
      syncAddTaskPlannedStartUi();
    });
    ctx.on(els.addTaskPresetIntervalsToggle, "click", (e: Event) => {
      e?.preventDefault?.();
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
        return;
      }
      if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0) return;
      ctx.setAddTaskPresetIntervalsEnabledState(!ctx.getAddTaskPresetIntervalsEnabled());
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskPresetIntervalsToggleRow, "click", (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
        return;
      }
      if (
        !ctx.getAddTaskMilestonesEnabled() ||
        getAddTaskTimeGoalMinutes() <= 0 ||
        target?.closest?.("#addTaskPresetIntervalsToggle") ||
        target?.closest?.("#addTaskPresetIntervalsInfoBtn") ||
        target?.closest?.("#addTaskPresetIntervalsInfoSlot") ||
        target?.closest?.("#addTaskPresetIntervalsInfoDialog")
      ) {
        return;
      }
      ctx.setAddTaskPresetIntervalsEnabledState(!ctx.getAddTaskPresetIntervalsEnabled());
      syncAddTaskCheckpointAlertUi();
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
    ctx.on(els.addTaskFinalCheckpointActionSelect, "change", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal completion actions", "pro");
        return;
      }
      ctx.setAddTaskTimeGoalActionState(
        els.addTaskFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.addTaskFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.addTaskFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue"
      );
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointSoundToggle, "click", (e: Event) => {
      e?.preventDefault?.();
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0 || !ctx.getCheckpointAlertSoundEnabled()) return;
      ctx.setAddTaskCheckpointSoundEnabledState(!ctx.getAddTaskCheckpointSoundEnabled());
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointSoundToggleRow, "click", (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (
        !ctx.getAddTaskMilestonesEnabled() ||
        getAddTaskTimeGoalMinutes() <= 0 ||
        !ctx.getCheckpointAlertSoundEnabled() ||
        target?.closest?.("#addTaskCheckpointSoundToggle")
      ) {
        return;
      }
      ctx.setAddTaskCheckpointSoundEnabledState(!ctx.getAddTaskCheckpointSoundEnabled());
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointSoundModeSelect, "change", () => {
      ctx.setAddTaskCheckpointSoundModeState(els.addTaskCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once");
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointToastToggle, "click", (e: Event) => {
      e?.preventDefault?.();
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getAddTaskMilestonesEnabled() || getAddTaskTimeGoalMinutes() <= 0 || !ctx.getCheckpointAlertToastEnabled()) return;
      ctx.setAddTaskCheckpointToastEnabledState(!ctx.getAddTaskCheckpointToastEnabled());
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointToastToggleRow, "click", (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (
        !ctx.getAddTaskMilestonesEnabled() ||
        getAddTaskTimeGoalMinutes() <= 0 ||
        !ctx.getCheckpointAlertToastEnabled() ||
        target?.closest?.("#addTaskCheckpointToastToggle")
      ) {
        return;
      }
      ctx.setAddTaskCheckpointToastEnabledState(!ctx.getAddTaskCheckpointToastEnabled());
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskCheckpointToastModeSelect, "change", () => {
      ctx.setAddTaskCheckpointToastModeState(els.addTaskCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s");
      syncAddTaskCheckpointAlertUi();
    });
    ctx.on(els.addTaskAddMsBtn, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
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
      if (ctx.getAddTaskWizardStep() !== 4) return;
      if (!validateAddTaskStep1()) return;
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
