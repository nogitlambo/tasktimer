import type { Task } from "../lib/types";
import {
  formatAddTaskDurationReadout,
  getAddTaskDurationMaxForPeriod,
  normalizeTaskConfigMilestones,
} from "../lib/taskConfig";
import type { TaskTimerEditTaskContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerEditTask(ctx: TaskTimerEditTaskContext) {
  const { els } = ctx;
  const { sharedTasks } = ctx;

  function canUseAdvancedTaskConfig() {
    return ctx.hasEntitlement("advancedTaskConfig");
  }

  function getCurrentEditTask() {
    return ctx.getEditTaskDraft();
  }

  function isEditElapsedOverrideEnabled() {
    return !!els.editOverrideElapsedToggle?.classList.contains("on");
  }

  function setEditElapsedOverrideEnabled(enabled: boolean) {
    els.editOverrideElapsedToggle?.classList.toggle("on", enabled);
    els.editOverrideElapsedToggle?.setAttribute("aria-checked", String(enabled));
    els.editOverrideElapsedFields?.classList.toggle("isDisabled", !enabled);
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
      mode: currentTask ? sharedTasks.taskModeOf(currentTask) : ctx.getCurrentMode(),
      durationValue,
      durationUnit,
      durationPeriod,
      noTimeGoal,
      milestonesEnabled: !!currentTask?.milestonesEnabled,
      milestoneTimeUnit:
        currentTask?.milestoneTimeUnit === "day"
          ? "day"
          : currentTask?.milestoneTimeUnit === "minute"
            ? "minute"
            : "hour",
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
      timeGoalAction:
        currentTask?.timeGoalAction === "resetLog" ||
        currentTask?.timeGoalAction === "resetNoLog" ||
        currentTask?.timeGoalAction === "confirmModal"
          ? currentTask.timeGoalAction
          : currentTask?.finalCheckpointAction === "resetLog" ||
              currentTask?.finalCheckpointAction === "resetNoLog" ||
              currentTask?.finalCheckpointAction === "confirmModal"
            ? currentTask.finalCheckpointAction
            : "confirmModal",
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
    return getEditTaskTimeGoalMinutesFor(value, ctx.getEditTaskDurationUnit(), ctx.getEditTaskDurationPeriod());
  }

  function editTaskHasActiveTimeGoal() {
    return getEditTaskTimeGoalMinutes() > 0;
  }

  function syncEditTaskTimeGoalUi(task?: Task | null) {
    const currentTask = task || getCurrentEditTask();
    const advancedLocked = !canUseAdvancedTaskConfig();
    if (advancedLocked) setEditTimeGoalEnabled(false);
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
      const canUseDay = Number(parsedValue) <= maxDay;
      if (String(parsedValue || "") !== String(els.editTaskDurationValueInput.value || "")) {
        els.editTaskDurationValueInput.value = String(parsedValue || 0);
      }
      ctx.setEditTaskDurationPeriod(canUseDay && ctx.getEditTaskDurationPeriod() === "day" ? "day" : "week");
    }
    const canUseDay = Number(els.editTaskDurationValueInput?.value || 0) <= getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), "day");
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
      (els.editTimeGoalToggle as HTMLButtonElement).disabled = advancedLocked;
      els.editTimeGoalToggle.setAttribute("aria-disabled", String(advancedLocked));
      els.editTimeGoalToggle.title = advancedLocked ? "Pro feature: Time goals and checkpoints" : "";
    }
    if (els.editNoGoalCheckbox) els.editNoGoalCheckbox.disabled = advancedLocked;
    els.editTaskDurationValueInput?.classList.remove("isInvalid");
    syncEditTaskDurationReadout(currentTask);
    const checkpointControlsDisabled = !hasActiveTimeGoal;
    els.msArea?.classList.toggle("isHidden", checkpointControlsDisabled);
    if (checkpointControlsDisabled && els.msArea && "open" in (els.msArea as HTMLDetailsElement)) {
      (els.msArea as HTMLDetailsElement).open = false;
    }
    els.msArea?.classList.toggle("isDisabled", checkpointControlsDisabled || !currentTask?.milestonesEnabled);
    if (els.msToggle) {
      els.msToggle.toggleAttribute("disabled", checkpointControlsDisabled);
      els.msToggle.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    }
    [els.msUnitDay, els.msUnitHour, els.msUnitMinute].forEach((btn) => {
      if (!btn) return;
      btn.toggleAttribute("disabled", checkpointControlsDisabled);
      btn.setAttribute("aria-disabled", checkpointControlsDisabled ? "true" : "false");
    });
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
    if (els.editFinalCheckpointActionSelect) {
      els.editFinalCheckpointActionSelect.disabled = checkpointControlsDisabled;
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
    const max = getAddTaskDurationMaxForPeriod(ctx.getEditTaskDurationUnit(), ctx.getEditTaskDurationPeriod());
    if (value > max) {
      els.editTaskDurationValueInput?.classList.add("isInvalid");
      return false;
    }
    return true;
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

  function setMilestoneUnitUi(unit: "day" | "hour" | "minute") {
    els.msUnitDay?.classList.toggle("isOn", unit === "day");
    els.msUnitHour?.classList.toggle("isOn", unit === "hour");
    els.msUnitMinute?.classList.toggle("isOn", unit === "minute");
  }

  function isEditMilestoneUnitDay(): boolean {
    return !!ctx.getEditTaskDraft() && ctx.getEditTaskDraft()?.milestoneTimeUnit === "day";
  }

  function cloneTaskForEdit(task: Task): Task {
    return {
      ...task,
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
    if (els.editFinalCheckpointActionSelect) {
      els.editFinalCheckpointActionSelect.value =
        t.timeGoalAction === "resetLog" || t.timeGoalAction === "resetNoLog" || t.timeGoalAction === "confirmModal"
          ? t.timeGoalAction
          : t.finalCheckpointAction === "resetLog" ||
              t.finalCheckpointAction === "resetNoLog" ||
              t.finalCheckpointAction === "confirmModal"
            ? t.finalCheckpointAction
            : "continue";
    }
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
    els.msToggle?.classList.toggle("on", enabled);
    els.msToggle?.setAttribute("aria-checked", String(enabled));
    els.msArea?.classList.toggle("on", enabled);
    els.msArea?.classList.toggle("isHidden", !timeGoalEnabled);
    els.msArea?.classList.toggle("isDisabled", !enabled);
    if (els.msArea && "open" in (els.msArea as HTMLDetailsElement)) {
      (els.msArea as HTMLDetailsElement).open = enabled;
    }
    const summary = els.msArea?.querySelector?.("summary") as HTMLElement | null;
    if (summary) {
      summary.classList.toggle("isDisabled", !enabled);
      summary.setAttribute("aria-disabled", !enabled ? "true" : "false");
      summary.tabIndex = enabled ? 0 : -1;
    }
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
    const elapsedDraft = isEditElapsedOverrideEnabled()
      ? {
          d: String(els.editD?.value || "0"),
          h: String(els.editH?.value || "0"),
          m: String(els.editM?.value || "0"),
          s: String(els.editS?.value || "0"),
        }
      : null;
    return JSON.stringify({
      name: String(els.editName?.value || task.name || "").trim(),
      mode: ctx.getEditMoveTargetMode() || sharedTasks.taskModeOf(task),
      timeGoalEnabled: isEditTimeGoalEnabled(),
      timeGoalValue: Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0),
      timeGoalUnit: ctx.getEditTaskDurationUnit(),
      timeGoalPeriod: ctx.getEditTaskDurationPeriod(),
      timeGoalMinutes: getEditTaskTimeGoalMinutes(),
      milestoneTimeUnit: task.milestoneTimeUnit === "day" ? "day" : task.milestoneTimeUnit === "minute" ? "minute" : "hour",
      milestonesEnabled: !!task.milestonesEnabled,
      milestones,
      overrideElapsedEnabled: !!elapsedDraft,
      elapsedDraft,
      checkpointSoundEnabled: !!ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null),
      checkpointSoundMode: els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once",
      checkpointToastEnabled: !!ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null),
      checkpointToastMode: els.editCheckpointToastModeSelect?.value === "manual" ? "manual" : "auto5s",
      timeGoalAction:
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue",
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
    const checkpointingActive = !!task.milestonesEnabled && editTaskHasActiveTimeGoal();
    const noCheckpoints = checkpointingActive && (!Array.isArray(task.milestones) || task.milestones.length === 0);
    const invalidCheckpointTimes =
      checkpointingActive &&
      (sharedTasks.hasNonPositiveCheckpoint(task.milestones) ||
        sharedTasks.hasCheckpointAtOrAboveTimeGoal(task.milestones, sharedTasks.milestoneUnitSec(task), getEditTaskTimeGoalMinutes()));
    const invalidPresetInterval = checkpointingActive && !!task.presetIntervalsEnabled && !sharedTasks.hasValidPresetInterval(task);
    const blocked = invalidTimeGoal || noCheckpoints || invalidCheckpointTimes || invalidPresetInterval;
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

  function confirmEnableElapsedOverride() {
    ctx.confirm("Manual Time Override", "Manual time override will disqualify this task from earning XP until the next reset. Proceed?", {
      okLabel: "Proceed",
      cancelLabel: "Cancel",
      onOk: () => {
        setEditElapsedOverrideEnabled(true);
        const currentTask = getCurrentEditTask();
        if (currentTask) ctx.syncEditSaveAvailability(currentTask);
        ctx.closeConfirm();
      },
      onCancel: () => ctx.closeConfirm(),
    });
  }

  function normalizeEditElapsedValue(input: HTMLInputElement | null) {
    if (!input) return;
    const raw = String(input.value || "").trim();
    if (!raw) {
      input.value = "0";
      return;
    }
    const parsed = Math.floor(Number(raw));
    if (!Number.isFinite(parsed) || isNaN(parsed)) {
      input.value = "0";
      return;
    }
    if (input === els.editM || input === els.editS) {
      input.value = String(Math.min(59, Math.max(0, parsed)));
      return;
    }
    if (input === els.editH && ctx.isEditMilestoneUnitDay()) {
      input.value = String(Math.min(23, Math.max(0, parsed)));
      return;
    }
    input.value = String(Math.max(0, parsed));
  }

  function maybeAutoClearEditElapsedField(input: HTMLInputElement | null) {
    if (!input || !isEditElapsedOverrideEnabled()) return;
    if (input.dataset.autoclearPending !== "1") return;
    input.value = "";
    input.dataset.autoclearPending = "0";
  }

  function elapsedPadRangeForInput(input: HTMLInputElement | null) {
    if (input === els.editD) return { min: 0, max: Number.POSITIVE_INFINITY };
    if (input === els.editH) {
      return ctx.isEditMilestoneUnitDay() ? { min: 0, max: 23 } : { min: 0, max: Number.POSITIVE_INFINITY };
    }
    if (input === els.editM || input === els.editS) return { min: 0, max: 59 };
    return { min: 0, max: 59 };
  }

  function elapsedPadErrorTextForInput(input: HTMLInputElement | null) {
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(range.max)) return `Enter a number greater than or equal to ${range.min}`;
    return `Enter a number within the range ${range.min}-${range.max}`;
  }

  function clearElapsedPadError() {
    if (els.elapsedPadError) els.elapsedPadError.textContent = "";
  }

  function setElapsedPadError(msg: string) {
    if (els.elapsedPadError) els.elapsedPadError.textContent = msg;
  }

  function elapsedPadValidatedValue(raw: string, input: HTMLInputElement | null) {
    const parsed = parseInt(raw || "", 10);
    const range = elapsedPadRangeForInput(input);
    if (!Number.isFinite(parsed) || isNaN(parsed)) return null;
    if (parsed < range.min || parsed > range.max) return null;
    return String(parsed);
  }

  function renderElapsedPadDisplay() {
    if (!els.elapsedPadDisplay) return;
    const text = (ctx.getElapsedPadDraft() || "0").replace(/^0+(?=\d)/, "") || "0";
    els.elapsedPadDisplay.textContent = text;
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
      const unit = task?.milestoneTimeUnit === "day" ? "days" : task?.milestoneTimeUnit === "minute" ? "minutes" : "hours";
      els.elapsedPadTitle.textContent = `Set Checkpoint <${unit}>`;
    }
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
          : elapsedPadValidatedValue(elapsedPadDraft, elapsedPadTarget);
      if (valid == null) {
        setElapsedPadError(
          elapsedPadMilestoneRef && !elapsedPadTarget ? "Enter a valid number" : elapsedPadErrorTextForInput(elapsedPadTarget)
        );
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

  function openEdit(i: number) {
    const sourceTask = ctx.getTasks()[i];
    if (!sourceTask) return;
    const t = ctx.cloneTaskForEdit(sourceTask);
    ctx.setEditIndex(i);
    ctx.setEditTaskDraft(t);
    if (els.editName) els.editName.value = t.name || "";
    ctx.setEditTimeGoalEnabled(!!t.timeGoalEnabled);
    if (els.editTaskDurationValueInput) els.editTaskDurationValueInput.value = String(Math.max(0, Number(t.timeGoalValue) || 0) || 0);
    ctx.setEditTaskDurationUnit(t.timeGoalUnit === "minute" ? "minute" : "hour");
    ctx.setEditTaskDurationPeriod(t.timeGoalPeriod === "day" ? "day" : "week");
    ctx.syncEditTaskTimeGoalUi(t);

    const elapsedMs = ctx.getElapsedMs(t);
    const totalSec = Math.floor(elapsedMs / 1000);
    const d = Math.floor(totalSec / 86400);
    const remAfterDays = totalSec % 86400;
    const h = Math.floor(remAfterDays / 3600);
    const m = Math.floor((remAfterDays % 3600) / 60);
    const s = remAfterDays % 60;
    if (els.editD) els.editD.value = String(d);
    if (els.editH) els.editH.value = String(h);
    if (els.editM) els.editM.value = String(m);
    if (els.editS) els.editS.value = String(s);
    [els.editD, els.editH, els.editM, els.editS].forEach((input) => {
      if (input) input.dataset.autoclearPending = "1";
    });
    setEditElapsedOverrideEnabled(!!t.xpDisqualifiedUntilReset);
    if (els.editAdvancedSection) els.editAdvancedSection.open = !!t.xpDisqualifiedUntilReset;
    ctx.syncEditCheckpointAlertUi(t);
    ctx.syncEditSaveAvailability(t);
    const current = sharedTasks.taskModeOf(t);
    ctx.setEditMoveTargetMode(current);
    if (els.editMoveCurrentLabel) els.editMoveCurrentLabel.textContent = ctx.getModeLabel(current);
    [els.editMoveMode1, els.editMoveMode2, els.editMoveMode3].forEach((btn) => {
      if (!btn) return;
      const moveMode = btn.getAttribute("data-move-mode") as any;
      const disabled = btn.getAttribute("data-move-mode") === current || !ctx.isModeEnabled(moveMode);
      btn.disabled = disabled;
      btn.classList.toggle("is-disabled", disabled);
    });
    if (els.editMoveMenu) els.editMoveMenu.open = false;
    if (els.msArea && "open" in (els.msArea as any)) (els.msArea as HTMLDetailsElement).open = false;
    ctx.syncEditMilestoneSectionUi(t);
    ctx.setMilestoneUnitUi(t.milestoneTimeUnit === "day" ? "day" : t.milestoneTimeUnit === "minute" ? "minute" : "hour");
    ctx.renderMilestoneEditor(t);
    sharedTasks.ensureMilestoneIdentity(t);
    if (els.editPresetIntervalInput) els.editPresetIntervalInput.value = String(Number(t.presetIntervalValue || 0) || 0);
    ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, !!t.presetIntervalsEnabled);
    ctx.syncEditCheckpointAlertUi(t);
    ctx.setEditDraftSnapshot(ctx.buildEditDraftSnapshot(t));
    ctx.clearEditValidationState();
    ctx.syncEditSaveAvailability(t);
    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "flex";
  }

  function closeEdit(saveChanges: boolean) {
    const editIndex = ctx.getEditIndex();
    const sourceTask = editIndex != null ? ctx.getTasks()[editIndex] : null;
    const t = getCurrentEditTask();
    if (saveChanges && t && sourceTask) {
      els.editTaskDurationValueInput?.classList.remove("isInvalid");
      if (!ctx.validateEditTimeGoal()) return void ctx.showEditValidationError(t, "Enter a valid time goal or turn Time Goal off.");
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
      const prevElapsedMs = ctx.getElapsedMs(sourceTask);
      t.name = (els.editName?.value || "").trim() || t.name;
      if (isEditElapsedOverrideEnabled()) {
        const dd = Math.max(0, parseInt(els.editD?.value || "0", 10) || 0);
        const rawH = Math.max(0, parseInt(els.editH?.value || "0", 10) || 0);
        const hh = ctx.isEditMilestoneUnitDay() ? Math.min(23, rawH) : rawH;
        const mm = Math.min(59, Math.max(0, parseInt(els.editM?.value || "0", 10) || 0));
        const ss = Math.min(59, Math.max(0, parseInt(els.editS?.value || "0", 10) || 0));
        const newMs = (dd * 86400 + hh * 3600 + mm * 60 + ss) * 1000;
        t.accumulatedMs = newMs;
        t.startMs = t.running ? Date.now() : null;
        if (newMs < prevElapsedMs) ctx.resetCheckpointAlertTracking(t.id);
        else ctx.clearCheckpointBaseline(t.id);
      }
      t.xpDisqualifiedUntilReset = isEditElapsedOverrideEnabled();
      const timeGoalEnabledForSave = ctx.isEditTimeGoalEnabled();
      const checkpointingEnabledForSave = timeGoalEnabledForSave && !!t.milestonesEnabled;
      t.checkpointSoundEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      t.checkpointToastEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
      t.presetIntervalsEnabled = checkpointingEnabledForSave && ctx.isSwitchOn(els.editPresetIntervalsToggle as HTMLElement | null);
      t.presetIntervalValue = Math.max(0, parseFloat(els.editPresetIntervalInput?.value || "0") || 0);
      t.timeGoalAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue";
      t.timeGoalEnabled = timeGoalEnabledForSave;
      if (!t.timeGoalEnabled) t.milestonesEnabled = false;
      t.timeGoalValue = Math.max(0, Number(els.editTaskDurationValueInput?.value || 0) || 0);
      t.timeGoalUnit = ctx.getEditTaskDurationUnit();
      t.timeGoalPeriod = ctx.getEditTaskDurationPeriod();
      t.timeGoalMinutes = ctx.getEditTaskTimeGoalMinutesFor(t.timeGoalValue, t.timeGoalUnit, t.timeGoalPeriod);
      sharedTasks.ensureMilestoneIdentity(t);
      t.milestones = ctx.sortMilestones(t.milestones);
      const moveMode = ctx.getEditMoveTargetMode() || sharedTasks.taskModeOf(t);
      if ((moveMode === "mode1" || moveMode === "mode2" || moveMode === "mode3") && ctx.isModeEnabled(moveMode)) {
        (t as any).mode = moveMode;
      }
      Object.assign(sourceTask, ctx.cloneTaskForEdit(t));
      ctx.save();
      void ctx.syncSharedTaskSummariesForTask(String(sourceTask.id || "")).catch(() => {});
      ctx.render();
    }
    if (els.editOverlay) (els.editOverlay as HTMLElement).style.display = "none";
    ctx.clearEditValidationState();
    closeElapsedPad(false);
    if (els.editAdvancedSection) els.editAdvancedSection.open = false;
    if (els.editMoveMenu) els.editMoveMenu.open = false;
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
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goals and checkpoints", "pro");
        return;
      }
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.setEditTimeGoalEnabled(nextEnabled);
      ctx.clearEditValidationState();
      if (!nextEnabled && els.msArea && "open" in (els.msArea as any)) {
        (els.msArea as HTMLDetailsElement).open = false;
      }
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditMilestoneSectionUi(t);
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
    ctx.on(els.editNoGoalCheckbox, "change", () => {
      syncEditTimeGoalToggle(ctx.isEditTimeGoalEnabled());
    });
    ctx.on(els.editTimeGoalToggle, "click", () => {
      syncEditTimeGoalToggle(!ctx.isEditTimeGoalEnabled());
    });
    ctx.on(els.editTimeGoalToggleRow, "click", (e: any) => {
      if (e.target?.closest?.("#editTimeGoalToggle")) return;
      syncEditTimeGoalToggle(!ctx.isEditTimeGoalEnabled());
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
    ctx.on(els.editOverrideElapsedToggle, "click", (e: any) => {
      e?.preventDefault?.();
      if (isEditElapsedOverrideEnabled()) {
        setEditElapsedOverrideEnabled(false);
        if (getCurrentEditTask()) ctx.syncEditSaveAvailability(getCurrentEditTask());
        return;
      }
      confirmEnableElapsedOverride();
    });
    ctx.on(els.editCheckpointSoundToggle, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getCheckpointAlertSoundEnabled() || !ctx.editTaskHasActiveTimeGoal()) return;
      ctx.toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null));
    });
    ctx.on(els.editCheckpointSoundToggleRow, "click", (e: any) => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getCheckpointAlertSoundEnabled() || !ctx.editTaskHasActiveTimeGoal() || e.target?.closest?.("#editCheckpointSoundToggle")) return;
      ctx.toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null));
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundEnabled = ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointSoundToggle, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundEnabled = ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointSoundModeSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointSoundMode = els.editCheckpointSoundModeSelect?.value === "repeat" ? "repeat" : "once";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointToastToggle, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getCheckpointAlertToastEnabled() || !ctx.editTaskHasActiveTimeGoal()) return;
      ctx.toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null));
    });
    ctx.on(els.editCheckpointToastToggleRow, "click", (e: any) => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Checkpoint alerts", "pro");
        return;
      }
      if (!ctx.getCheckpointAlertToastEnabled() || !ctx.editTaskHasActiveTimeGoal() || e.target?.closest?.("#editCheckpointToastToggle")) return;
      ctx.toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null));
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointToastEnabled = ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editCheckpointToastToggle, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      t.checkpointToastEnabled = ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null);
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
    ctx.on(els.editPresetIntervalsToggle, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
        return;
      }
      ctx.maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPresetIntervalsToggleRow, "click", (e: any) => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Preset checkpoint intervals", "pro");
        return;
      }
      if (
        e.target?.closest?.("#editPresetIntervalsToggle") ||
        e.target?.closest?.("#editPresetIntervalsInfoBtn") ||
        e.target?.closest?.("#editPresetIntervalsInfoSlot") ||
        e.target?.closest?.("#editPresetIntervalsInfoDialog")
      ) return;
      ctx.maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
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
    ctx.on(els.editFinalCheckpointActionSelect, "change", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time goal completion actions", "pro");
        return;
      }
      t.timeGoalAction =
        els.editFinalCheckpointActionSelect?.value === "resetLog"
          ? "resetLog"
          : els.editFinalCheckpointActionSelect?.value === "resetNoLog"
            ? "resetNoLog"
            : els.editFinalCheckpointActionSelect?.value === "confirmModal"
              ? "confirmModal"
              : "continue";
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
    });

    const onEditElapsedInputChanged = (input: HTMLInputElement | null, normalize: boolean) => {
      if (!isEditElapsedOverrideEnabled()) return;
      if (normalize) normalizeEditElapsedValue(input);
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.clearEditValidationState();
      ctx.syncEditSaveAvailability(t);
    };

    [els.editD, els.editH, els.editM, els.editS].forEach((input) => {
      ctx.on(input, "focus", () => maybeAutoClearEditElapsedField(input));
      ctx.on(input, "input", () => onEditElapsedInputChanged(input, false));
      ctx.on(input, "change", () => onEditElapsedInputChanged(input, true));
      ctx.on(input, "click", () => {
        if (!input) return;
        ctx.setElapsedPadTarget(input);
        ctx.setElapsedPadOriginal(String(input.value || "0"));
        ctx.setElapsedPadDraft(String(input.value || "0"));
        clearElapsedPadError();
        renderElapsedPadDisplay();
        if (els.elapsedPadTitle) els.elapsedPadTitle.textContent = "Set Elapsed Time";
        if (els.elapsedPadOverlay) (els.elapsedPadOverlay as HTMLElement).style.display = "flex";
      });
    });

    ctx.on(els.msArea?.querySelector?.("summary") as HTMLElement | null, "click", (e: any) => {
      const t = getCurrentEditTask();
      if (!els.msArea || !("open" in (els.msArea as any))) return;
      if (!t || !ctx.editTaskHasActiveTimeGoal() || !t.milestonesEnabled) {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        (els.msArea as HTMLDetailsElement).open = false;
        return;
      }
      e?.preventDefault?.();
      e?.stopPropagation?.();
      (els.msArea as HTMLDetailsElement).open = true;
    });
    ctx.on(els.msToggle, "click", (e: any) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      t.milestonesEnabled = !t.milestonesEnabled;
      if (els.msArea && "open" in (els.msArea as any)) {
        (els.msArea as HTMLDetailsElement).open = !!t.milestonesEnabled;
      }
      ctx.syncEditMilestoneSectionUi(t);
      ctx.syncEditCheckpointAlertUi(t);
      ctx.syncEditSaveAvailability(t);
      if (!t.milestonesEnabled) {
        t.presetIntervalsEnabled = false;
        ctx.toggleSwitchElement(els.editPresetIntervalsToggle as HTMLElement | null, false);
        ctx.syncEditMilestoneSectionUi(t);
      }
    });
    ctx.on(els.msUnitDay, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      t.milestoneTimeUnit = "day";
      ctx.setMilestoneUnitUi("day");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.msUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      t.milestoneTimeUnit = "hour";
      ctx.setMilestoneUnitUi("hour");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.msUnitMinute, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
      t.milestoneTimeUnit = "minute";
      ctx.setMilestoneUnitUi("minute");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.addMsBtn, "click", () => {
      if (!canUseAdvancedTaskConfig()) {
        ctx.showUpgradePrompt("Time checkpoints", "pro");
        return;
      }
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
