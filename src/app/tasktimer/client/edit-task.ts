import type { Task } from "../lib/types";
import type { TaskTimerEditTaskContext } from "./context";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createTaskTimerEditTask(ctx: TaskTimerEditTaskContext) {
  const { els } = ctx;

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
        if (ctx.isCheckpointAtOrAboveTimeGoal(nextHours, ctx.milestoneUnitSec(elapsedPadMilestoneRef.task), timeGoalMinutes)) {
          const timeGoalText = ctx.formatCheckpointTimeGoalText(elapsedPadMilestoneRef.task, {
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
    const current = ctx.taskModeOf(t);
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
    ctx.ensureMilestoneIdentity(t);
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
      if (checkpointingActiveForSave && ctx.hasNonPositiveCheckpoint(t.milestones)) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be greater than 0.");
      }
      if (checkpointingActiveForSave && ctx.hasCheckpointAtOrAboveTimeGoal(t.milestones, ctx.milestoneUnitSec(t), ctx.getEditTaskTimeGoalMinutes())) {
        ctx.syncEditSaveAvailability(t);
        return void ctx.showEditValidationError(t, "Checkpoint times must be less than the time goal.");
      }
      if (checkpointingActiveForSave && t.presetIntervalsEnabled && !ctx.hasValidPresetInterval(t)) {
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
      ctx.ensureMilestoneIdentity(t);
      t.milestones = ctx.sortMilestones(t.milestones);
      const moveMode = ctx.getEditMoveTargetMode() || ctx.taskModeOf(t);
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
      ctx.setEditTaskDurationUnit("minute");
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskDurationUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.setEditTaskDurationUnit("hour");
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskDurationPeriodDay, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
      ctx.setEditTaskDurationPeriod("day");
      ctx.syncEditTaskTimeGoalUi(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editTaskDurationPeriodWeek, "click", () => {
      const t = getCurrentEditTask();
      if (!t) return;
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
      if (!ctx.getCheckpointAlertSoundEnabled() || !ctx.editTaskHasActiveTimeGoal()) return;
      ctx.toggleSwitchElement(els.editCheckpointSoundToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointSoundToggle as HTMLElement | null));
    });
    ctx.on(els.editCheckpointSoundToggleRow, "click", (e: any) => {
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
      if (!ctx.getCheckpointAlertToastEnabled() || !ctx.editTaskHasActiveTimeGoal()) return;
      ctx.toggleSwitchElement(els.editCheckpointToastToggle as HTMLElement | null, !ctx.isSwitchOn(els.editCheckpointToastToggle as HTMLElement | null));
    });
    ctx.on(els.editCheckpointToastToggleRow, "click", (e: any) => {
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
      ctx.maybeToggleEditPresetIntervals(!t.presetIntervalsEnabled);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.editPresetIntervalsToggleRow, "click", (e: any) => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
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
      t.milestoneTimeUnit = "day";
      ctx.setMilestoneUnitUi("day");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.msUnitHour, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      t.milestoneTimeUnit = "hour";
      ctx.setMilestoneUnitUi("hour");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.msUnitMinute, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) return;
      t.milestoneTimeUnit = "minute";
      ctx.setMilestoneUnitUi("minute");
      ctx.renderMilestoneEditor(t);
      ctx.syncEditSaveAvailability(t);
    });
    ctx.on(els.addMsBtn, "click", () => {
      const t = getCurrentEditTask();
      if (!t || !ctx.editTaskHasActiveTimeGoal()) {
        if (t) ctx.syncEditCheckpointAlertUi(t);
        return;
      }
      if (t.presetIntervalsEnabled) {
        if (!ctx.hasValidPresetInterval(t)) {
          ctx.syncEditCheckpointAlertUi(t);
          return;
        }
        if (!ctx.addMilestoneWithCurrentPreset(t, ctx.getEditTaskTimeGoalMinutes())) {
          ctx.showEditValidationError(t, "Checkpoint times must be less than the time goal.");
          ctx.syncEditCheckpointAlertUi(t);
          ctx.syncEditSaveAvailability(t);
          return;
        }
      } else {
        t.milestones = t.milestones || [];
        ctx.ensureMilestoneIdentity(t);
        const nextSeq = ctx.getPresetIntervalNextSeqNum(t);
        t.milestones.push({ id: ctx.createId(), createdSeq: nextSeq, hours: 0, description: "" });
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
    registerEditTaskEvents,
  };
}
