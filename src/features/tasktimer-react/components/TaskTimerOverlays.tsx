"use client";

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ADD_TASK_PRESET_NAMES, filterTaskNameOptions } from "@/app/tasktimer/lib/addTaskNames";
import { formatAddTaskDurationReadout, getAddTaskDurationMaxForPeriod } from "../model/taskConfig";
import { useTaskTimerActions, useTaskTimerState } from "../hooks/useTaskTimer";
import { formatHistoryElapsed, getModeLabel, getSelectedHistoryEntries } from "../model/selectors";
import type { MainMode, TaskConfigMilestoneDraft, TaskConfigValidation } from "../model/types";

const EDIT_MODES: MainMode[] = ["mode1", "mode2", "mode3"];

function SwitchControl({
  id,
  checked,
  disabled = false,
  onToggle,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggle();
  };
  return (
    <div
      className={`switch${checked ? " on" : ""}`}
      id={id}
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={(event) => {
        event.preventDefault();
        if (!disabled) onToggle();
      }}
      onKeyDown={onKeyDown}
    />
  );
}

function MilestoneRows({
  milestones,
  validation,
  unitSuffix,
  onValueChange,
  onDescriptionChange,
  onRemove,
}: {
  milestones: TaskConfigMilestoneDraft[];
  validation: TaskConfigValidation;
  unitSuffix: string;
  onValueChange: (milestoneId: string, value: string) => void;
  onDescriptionChange: (milestoneId: string, description: string) => void;
  onRemove: (milestoneId: string) => void;
}) {
  return (
    <>
      {milestones.map((milestone) => {
        const invalid = !!validation?.fields?.checkpointRows && !(Number(milestone.value || 0) > 0);
        return (
          <div key={milestone.id} className={`msRow${invalid ? " isInvalid" : ""}`} data-ms-id={milestone.id}>
            <label className="field" style={{ margin: 0 }}>
              <span className="sr-only">Checkpoint time</span>
              <input
                className="text"
                type="number"
                min={0}
                step="any"
                value={milestone.value}
                onChange={(event) => onValueChange(milestone.id, event.target.value)}
                aria-label={`Checkpoint time in ${unitSuffix}`}
              />
            </label>
            <input
              className="msSkewInput"
              type="text"
              value={milestone.description}
              data-field="desc"
              placeholder="Description"
              onChange={(event) => onDescriptionChange(milestone.id, event.target.value)}
            />
            <button type="button" title="Remove" data-action="rmMs" onClick={() => onRemove(milestone.id)}>
              &times;
            </button>
          </div>
        );
      })}
    </>
  );
}

function milestoneUnitLabel(unit: "day" | "hour" | "minute") {
  if (unit === "day") return "days";
  if (unit === "minute") return "minutes";
  return "hours";
}

export default function TaskTimerOverlays() {
  const state = useTaskTimerState();
  const actions = useTaskTimerActions();
  const [addTaskNameMenuOpen, setAddTaskNameMenuOpen] = useState(false);
  const [addTaskCheckpointInfoOpen, setAddTaskCheckpointInfoOpen] = useState(false);
  const [addTaskPresetInfoOpen, setAddTaskPresetInfoOpen] = useState(false);
  const [editPresetInfoOpen, setEditPresetInfoOpen] = useState(false);
  const analysisTaskId = state.historyAnalysisTaskId;
  const analysisEntries = analysisTaskId ? getSelectedHistoryEntries(state, analysisTaskId) : [];
  const totalMs = analysisEntries.reduce((sum, entry) => sum + Number(entry.ms || 0), 0);
  const averageMs = analysisEntries.length ? Math.round(totalMs / analysisEntries.length) : 0;
  const confirmDialog = state.confirmDialog;
  const hasConfirmCheckbox = confirmDialog?.kind === "deleteTask" || confirmDialog?.kind === "resetTask";
  const confirmCheckboxLabel = hasConfirmCheckbox ? confirmDialog.checkboxLabel : "";
  const confirmCheckboxChecked = hasConfirmCheckbox ? confirmDialog.checkboxChecked : false;
  const confirmIsDelete = confirmDialog?.kind === "deleteTask" || confirmDialog?.kind === "deleteHistoryEntries";
  const confirmDialogTaskId = confirmDialog && "taskId" in confirmDialog ? confirmDialog.taskId : "none";

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest("#addTaskNameCombo")) setAddTaskNameMenuOpen(false);
      if (!target.closest("#addTaskCheckpointInfoBtn") && !target.closest("#addTaskCheckpointInfoDialog")) setAddTaskCheckpointInfoOpen(false);
      if (!target.closest("#addTaskPresetIntervalsInfoBtn") && !target.closest("#addTaskPresetIntervalsInfoDialog")) setAddTaskPresetInfoOpen(false);
      if (!target.closest("#editPresetIntervalsInfoBtn") && !target.closest("#editPresetIntervalsInfoDialog")) setEditPresetInfoOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  const addTaskOptions = useMemo(
    () => filterTaskNameOptions(state.recentCustomTaskNames, ADD_TASK_PRESET_NAMES, state.addTaskDraft.name),
    [state.addTaskDraft.name, state.recentCustomTaskNames]
  );

  const addTaskCanUseDay =
    Number(state.addTaskDraft.durationValue || "0") <= getAddTaskDurationMaxForPeriod(state.addTaskDraft.durationUnit, "day");
  const addTaskDurationReadout = formatAddTaskDurationReadout(state.addTaskDraft);
  const addTaskPresetEnabled = state.addTaskDraft.milestonesEnabled && state.addTaskDraft.presetIntervalsEnabled;
  const addTaskPresetValid = Number(state.addTaskDraft.presetIntervalValue || "0") > 0;
  const addTaskNameMenuVisible = state.addTaskDialogOpen && addTaskNameMenuOpen;
  const addTaskCheckpointInfoVisible = state.addTaskDialogOpen && addTaskCheckpointInfoOpen;
  const addTaskPresetInfoVisible = state.addTaskDialogOpen && addTaskPresetInfoOpen;
  const addTaskValidation = state.addTaskValidation;
  const addTaskCheckpointNotes: string[] = [];
  if (!state.checkpointAlertSoundEnabled) addTaskCheckpointNotes.push("sound alerts are disabled globally");
  if (!state.checkpointAlertToastEnabled) addTaskCheckpointNotes.push("toast alerts are disabled globally");

  const editValidation = state.editValidation;
  const editPresetEnabled = state.editTaskDraft.milestonesEnabled && state.editTaskDraft.presetIntervalsEnabled;
  const editPresetValid = Number(state.editTaskDraft.presetIntervalValue || "0") > 0;
  const editPresetInfoVisible = state.editTaskDialogOpen && editPresetInfoOpen;
  const editCheckpointNotes: string[] = [];
  if (!state.checkpointAlertSoundEnabled) editCheckpointNotes.push("sound alerts are disabled globally");
  if (!state.checkpointAlertToastEnabled) editCheckpointNotes.push("toast alerts are disabled globally");

  const enabledEditModes = EDIT_MODES.filter((mode) => mode === "mode1" || state.modeSettings[mode].enabled);

  return (
    <>
      <div className="overlay" id="addTaskOverlay" style={{ display: state.addTaskDialogOpen ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
          <h2>Add Task</h2>
          <div className="addTaskWizardProgress" id="addTaskWizardProgress" aria-live="polite">
            Step {state.addTaskWizardStep} of 3
          </div>
          <div className={`addTaskValidationError${addTaskValidation ? " isOn" : ""}`} id="addTaskError" aria-live="polite">
            {addTaskValidation?.message || ""}
          </div>
          <form
            id="addTaskForm"
            autoComplete="off"
            style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}
            onSubmit={(event) => {
              event.preventDefault();
              setAddTaskNameMenuOpen(false);
              setAddTaskCheckpointInfoOpen(false);
              setAddTaskPresetInfoOpen(false);
              actions.submitAddTask();
            }}
          >
            <section className={`addTaskWizardStep${state.addTaskWizardStep === 1 ? " isActive" : ""}`} id="addTaskStep1">
              <div className="addTaskStepPrompt">Enter a name for this task</div>
              <div className={`addTaskNameCombo${addTaskValidation?.fields?.name ? " isInvalid" : ""}`} id="addTaskNameCombo">
                <input
                  id="addTaskName"
                  type="text"
                  placeholder="Enter a task name or select from preset values"
                  value={state.addTaskDraft.name}
                  onChange={(event) => {
                    actions.patchAddTaskDraft({ name: event.target.value });
                    setAddTaskNameMenuOpen(true);
                  }}
                  onFocus={() => setAddTaskNameMenuOpen(true)}
                />
                <button
                  className="btn btn-ghost small addTaskNameToggle"
                  id="addTaskNameToggle"
                  type="button"
                  aria-label="Show task name options"
                  aria-expanded={addTaskNameMenuVisible}
                  onClick={() => setAddTaskNameMenuOpen((open) => !open)}
                >
                  &#9662;
                </button>
                <div className="addTaskNameMenu" id="addTaskNameMenu" style={{ display: addTaskNameMenuVisible ? "block" : "none" }}>
                  <div className="addTaskNameCustomTitle" id="addTaskNameCustomTitle" style={{ display: addTaskOptions.custom.length ? "block" : "none" }}>
                    Your Custom Tasks
                  </div>
                  <div className="addTaskNameList" id="addTaskNameCustomList">
                    {addTaskOptions.custom.map((name) => (
                      <button
                        key={`custom-${name}`}
                        className="addTaskNameItem"
                        type="button"
                        data-add-task-name={name}
                        onClick={() => {
                          actions.patchAddTaskDraft({ name });
                          setAddTaskNameMenuOpen(false);
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="addTaskNameDivider" id="addTaskNameDivider" style={{ display: addTaskOptions.custom.length ? "block" : "none" }} />
                  <div className="addTaskNamePresetTitle" id="addTaskNamePresetTitle" style={{ display: addTaskOptions.presets.length ? "block" : "none" }}>
                    Presets
                  </div>
                  <div className="addTaskNameList" id="addTaskNamePresetList">
                    {addTaskOptions.presets.map((name) => (
                      <button
                        key={`preset-${name}`}
                        className="addTaskNameItem"
                        type="button"
                        data-add-task-name={name}
                        onClick={() => {
                          actions.patchAddTaskDraft({ name });
                          setAddTaskNameMenuOpen(false);
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className={`addTaskWizardStep${state.addTaskWizardStep === 2 ? " isActive" : ""}`} id="addTaskStep2">
              <div className="addTaskStepPrompt">How much time do you want to spend on this task?</div>
              <div className={`addTaskDurationRow${state.addTaskDraft.noTimeGoal ? " isDisabled" : ""}${addTaskValidation?.fields?.duration ? " isInvalid" : ""}`} id="addTaskDurationRow">
                <input
                  id="addTaskDurationValueInput"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={state.addTaskDraft.durationValue}
                  disabled={state.addTaskDraft.noTimeGoal}
                  onChange={(event) => actions.patchAddTaskDraft({ durationValue: event.target.value })}
                />
                <div className="unitButtons addTaskDurationPills" id="addTaskDurationUnitPills" role="group" aria-label="Time goal unit">
                  <button
                    className={`btn btn-ghost small unitBtn${state.addTaskDraft.durationUnit === "minute" ? " isOn" : ""}`}
                    id="addTaskDurationUnitMinute"
                    type="button"
                    aria-pressed={state.addTaskDraft.durationUnit === "minute"}
                    disabled={state.addTaskDraft.noTimeGoal}
                    onClick={() => actions.patchAddTaskDraft({ durationUnit: "minute" })}
                  >
                    Minutes
                  </button>
                  <button
                    className={`btn btn-ghost small unitBtn${state.addTaskDraft.durationUnit === "hour" ? " isOn" : ""}`}
                    id="addTaskDurationUnitHour"
                    type="button"
                    aria-pressed={state.addTaskDraft.durationUnit === "hour"}
                    disabled={state.addTaskDraft.noTimeGoal}
                    onClick={() => actions.patchAddTaskDraft({ durationUnit: "hour" })}
                  >
                    Hours
                  </button>
                </div>
                <span className="addTaskDurationPerLabel">per</span>
                <div className="unitButtons addTaskDurationPills" id="addTaskDurationPeriodPills" role="group" aria-label="Time goal period">
                  {addTaskCanUseDay ? (
                    <button
                      className={`btn btn-ghost small unitBtn${state.addTaskDraft.durationPeriod === "day" ? " isOn" : ""}`}
                      id="addTaskDurationPeriodDay"
                      type="button"
                      aria-pressed={state.addTaskDraft.durationPeriod === "day"}
                      disabled={state.addTaskDraft.noTimeGoal}
                      onClick={() => actions.patchAddTaskDraft({ durationPeriod: "day" })}
                    >
                      Day
                    </button>
                  ) : null}
                  <button
                    className={`btn btn-ghost small unitBtn${state.addTaskDraft.durationPeriod === "week" ? " isOn" : ""}`}
                    id="addTaskDurationPeriodWeek"
                    type="button"
                    aria-pressed={state.addTaskDraft.durationPeriod === "week"}
                    disabled={state.addTaskDraft.noTimeGoal}
                    onClick={() => actions.patchAddTaskDraft({ durationPeriod: "week" })}
                  >
                    Week
                  </button>
                </div>
              </div>
              <div className={`addTaskDurationReadout${state.addTaskDraft.noTimeGoal ? " isDisabled" : ""}`} id="addTaskDurationReadout">
                {addTaskDurationReadout}
              </div>
              <label className="addTaskNoGoalRow" htmlFor="addTaskNoGoalCheckbox">
                <input
                  id="addTaskNoGoalCheckbox"
                  type="checkbox"
                  checked={state.addTaskDraft.noTimeGoal}
                  onChange={(event) => actions.patchAddTaskDraft({ noTimeGoal: event.target.checked })}
                />
                <span>Don&apos;t set a time goal</span>
              </label>
            </section>

            <section className={`addTaskWizardStep${state.addTaskWizardStep === 3 ? " isActive" : ""}`} id="addTaskStep3">
              <div className="addTaskStepPrompt addTaskStepPromptWithInfo">
                <span>Set Time Checkpoints? (you can add these in later)</span>
                <button
                  className="iconBtn addTaskCheckpointInfoBtn"
                  id="addTaskCheckpointInfoBtn"
                  type="button"
                  aria-label="What are time checkpoints?"
                  aria-expanded={addTaskCheckpointInfoVisible}
                  aria-controls="addTaskCheckpointInfoDialog"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setAddTaskCheckpointInfoOpen((open) => !open);
                  }}
                >
                  ?
                </button>
              </div>
              <div className={`addTaskCheckpointInfoDialog${addTaskCheckpointInfoVisible ? " isOpen" : ""}`} id="addTaskCheckpointInfoDialog" role="note">
                Time checkpoints are optional milestone markers during a task timer run. Use them to track progress points and
                trigger checkpoint alerts while the task is active.
              </div>
              <details className={`milestones${state.addTaskDraft.milestonesEnabled ? " on" : ""}${addTaskValidation?.fields?.checkpoints ? " isInvalid" : ""}`} id="addTaskMsArea" open={state.addTaskDraft.milestonesEnabled}>
                <summary className="milestonesSummary" role="button">
                  <span className="milestonesSummaryPrimary">Time Checkpoints</span>
                  <span className="milestonesSummaryControls">
                    <SwitchControl
                      id="addTaskMsToggle"
                      checked={state.addTaskDraft.milestonesEnabled}
                      onToggle={() => actions.patchAddTaskDraft({ milestonesEnabled: !state.addTaskDraft.milestonesEnabled, presetIntervalsEnabled: !state.addTaskDraft.milestonesEnabled ? state.addTaskDraft.presetIntervalsEnabled : false })}
                    />
                    <span className="milestonesSummaryCollapseLabel">Show/Hide Checkpoints</span>
                  </span>
                </summary>
                <div className="unitRow" id="addTaskMsUnitRow">
                  <span>Task Timer Format</span>
                  <div className="unitButtons">
                    <button className={`btn btn-ghost small unitBtn${state.addTaskDraft.milestoneTimeUnit === "day" ? " isOn" : ""}`} id="addTaskMsUnitDay" type="button" onClick={() => actions.patchAddTaskDraft({ milestoneTimeUnit: "day" })}>Day</button>
                    <button className={`btn btn-ghost small unitBtn${state.addTaskDraft.milestoneTimeUnit === "hour" ? " isOn" : ""}`} id="addTaskMsUnitHour" type="button" onClick={() => actions.patchAddTaskDraft({ milestoneTimeUnit: "hour" })}>Hour</button>
                    <button className={`btn btn-ghost small unitBtn${state.addTaskDraft.milestoneTimeUnit === "minute" ? " isOn" : ""}`} id="addTaskMsUnitMinute" type="button" onClick={() => actions.patchAddTaskDraft({ milestoneTimeUnit: "minute" })}>Minute</button>
                  </div>
                </div>
                <div className="milestonesBody">
                  <div id="addTaskMsList">
                    <MilestoneRows
                      milestones={state.addTaskDraft.milestones}
                      validation={addTaskValidation}
                      unitSuffix={milestoneUnitLabel(state.addTaskDraft.milestoneTimeUnit)}
                      onValueChange={(milestoneId, value) => actions.updateAddTaskMilestone(milestoneId, { value })}
                      onDescriptionChange={(milestoneId, description) => actions.updateAddTaskMilestone(milestoneId, { description })}
                      onRemove={(milestoneId) => actions.removeAddTaskMilestone(milestoneId)}
                    />
                  </div>
                  <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }} disabled={state.addTaskDraft.milestonesEnabled && addTaskPresetEnabled && !addTaskPresetValid} title={state.addTaskDraft.milestonesEnabled && addTaskPresetEnabled && !addTaskPresetValid ? "Enter a preset interval greater than 0" : ""} onClick={() => actions.addAddTaskMilestone()}>
                    + Add Timer Checkpoint
                  </button>
                </div>
              </details>

              <div className={`checkpointAlertsGroup${state.addTaskDraft.milestonesEnabled ? "" : " isHidden"}`} id="addTaskTimerSettingsGroup">
                <div className="checkpointAlertsTitle">Timer Settings</div>
                <div className="toggleRow" id="addTaskPresetIntervalsToggleRow">
                  <span>Use Preset Intervals</span>
                  <SwitchControl id="addTaskPresetIntervalsToggle" checked={addTaskPresetEnabled} disabled={!state.addTaskDraft.milestonesEnabled} onToggle={() => actions.patchAddTaskDraft({ presetIntervalsEnabled: !state.addTaskDraft.presetIntervalsEnabled })} />
                  <span className="presetIntervalsInfoSlot" id="addTaskPresetIntervalsInfoSlot">
                    <button className="iconBtn addTaskPresetIntervalsInfoBtn" id="addTaskPresetIntervalsInfoBtn" type="button" aria-label="What are preset intervals?" aria-expanded={addTaskPresetInfoVisible} aria-controls="addTaskPresetIntervalsInfoDialog" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setAddTaskPresetInfoOpen((open) => !open); }}>
                      ?
                    </button>
                  </span>
                </div>
                <div className={`addTaskCheckpointInfoDialog addTaskPresetIntervalsInfoDialog${addTaskPresetInfoVisible ? " isOpen" : ""}`} id="addTaskPresetIntervalsInfoDialog" role="note">
                  Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint.
                </div>
                <div className={`field checkpointAlertSoundModeField${addTaskPresetEnabled ? "" : " isHidden"}${addTaskValidation?.fields?.presetInterval ? " isInvalid" : ""}`} id="addTaskPresetIntervalField">
                  <label htmlFor="addTaskPresetIntervalInput">Preset interval</label>
                  <input id="addTaskPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" value={state.addTaskDraft.presetIntervalValue} onChange={(event) => actions.patchAddTaskDraft({ presetIntervalValue: event.target.value })} />
                </div>
                <p className="checkpointAlertsNote" id="addTaskPresetIntervalNote" style={{ display: addTaskPresetEnabled && !addTaskPresetValid ? "block" : "none" }}>
                  {addTaskPresetEnabled && !addTaskPresetValid ? "Enter a preset interval greater than 0 to add checkpoints." : ""}
                </p>
                <div className="field checkpointAlertSoundModeField" id="addTaskFinalCheckpointActionField">
                  <label htmlFor="addTaskFinalCheckpointActionSelect">When final checkpoint is reached</label>
                  <select id="addTaskFinalCheckpointActionSelect" value={state.addTaskDraft.timeGoalAction} onChange={(event) => actions.patchAddTaskDraft({ timeGoalAction: event.target.value as "continue" | "resetLog" | "resetNoLog" })}>
                    <option value="continue">Continue to run timer until stopped by user (default)</option>
                    <option value="resetLog">Stop/reset timer and save session to history</option>
                    <option value="resetNoLog">Stop/reset timer and do not save session to history</option>
                  </select>
                </div>
              </div>

              <div className={`checkpointAlertsGroup${state.addTaskDraft.milestonesEnabled ? "" : " isHidden"}`} id="addTaskCheckpointAlertsGroup">
                <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
                <div className={`toggleRow${!state.checkpointAlertSoundEnabled ? " isDisabled" : ""}`} id="addTaskCheckpointSoundToggleRow">
                  <span>Sound Alert</span>
                  <SwitchControl id="addTaskCheckpointSoundToggle" checked={state.addTaskDraft.milestonesEnabled && state.addTaskDraft.checkpointSoundEnabled} disabled={!state.addTaskDraft.milestonesEnabled || !state.checkpointAlertSoundEnabled} onToggle={() => actions.patchAddTaskDraft({ checkpointSoundEnabled: !state.addTaskDraft.checkpointSoundEnabled })} />
                </div>
                <div className={`field checkpointAlertSoundModeField${state.addTaskDraft.milestonesEnabled && state.checkpointAlertSoundEnabled && state.addTaskDraft.checkpointSoundEnabled ? "" : " isHidden"}`} id="addTaskCheckpointSoundModeField">
                  <label htmlFor="addTaskCheckpointSoundModeSelect">Sound Alert Behaviour</label>
                  <select id="addTaskCheckpointSoundModeSelect" value={state.addTaskDraft.checkpointSoundMode} onChange={(event) => actions.patchAddTaskDraft({ checkpointSoundMode: event.target.value as "once" | "repeat" })}>
                    <option value="once">Sound alert once only (default)</option>
                    <option value="repeat">Wait for user to dismiss sound alert</option>
                  </select>
                </div>
                <div className={`toggleRow${!state.checkpointAlertToastEnabled ? " isDisabled" : ""}`} id="addTaskCheckpointToastToggleRow">
                  <span>Toast Alert</span>
                  <SwitchControl id="addTaskCheckpointToastToggle" checked={state.addTaskDraft.milestonesEnabled && state.addTaskDraft.checkpointToastEnabled} disabled={!state.addTaskDraft.milestonesEnabled || !state.checkpointAlertToastEnabled} onToggle={() => actions.patchAddTaskDraft({ checkpointToastEnabled: !state.addTaskDraft.checkpointToastEnabled })} />
                </div>
                <div className={`field checkpointAlertSoundModeField${state.addTaskDraft.milestonesEnabled && state.checkpointAlertToastEnabled && state.addTaskDraft.checkpointToastEnabled ? "" : " isHidden"}`} id="addTaskCheckpointToastModeField">
                  <label htmlFor="addTaskCheckpointToastModeSelect">Toast Alert Behaviour</label>
                  <select id="addTaskCheckpointToastModeSelect" value={state.addTaskDraft.checkpointToastMode} onChange={(event) => actions.patchAddTaskDraft({ checkpointToastMode: event.target.value as "auto5s" | "manual" })}>
                    <option value="auto5s">Dismiss toast alert after 5 seconds (default)</option>
                    <option value="manual">Wait for user to dismiss toast alert</option>
                  </select>
                </div>
                <p className="checkpointAlertsNote" id="addTaskCheckpointAlertsNote" style={{ display: state.addTaskDraft.milestonesEnabled && addTaskCheckpointNotes.length ? "block" : "none" }}>
                  {addTaskCheckpointNotes.length ? `Checkpoint alerts are currently unavailable because ${addTaskCheckpointNotes.join(" and ")}.` : ""}
                </p>
              </div>
            </section>

            <div className="footerBtns addTaskWizardFooter" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" id="addTaskCancelBtn" type="button" onClick={() => { setAddTaskNameMenuOpen(false); setAddTaskCheckpointInfoOpen(false); setAddTaskPresetInfoOpen(false); actions.closeAddTask(); }}>Cancel</button>
              <button className={`btn btn-ghost addTaskWizardBackBtn${state.addTaskWizardStep === 2 ? "" : " isHidden"}`} id="addTaskStep2BackBtn" type="button" onClick={() => actions.retreatAddTaskWizard()}>Back</button>
              <button className={`btn btn-ghost addTaskWizardBackBtn${state.addTaskWizardStep === 3 ? "" : " isHidden"}`} id="addTaskStep3BackBtn" type="button" onClick={() => actions.retreatAddTaskWizard()}>Back</button>
              <button className={`btn btn-accent addTaskWizardNextBtn${state.addTaskWizardStep === 1 ? "" : " isHidden"}`} id="addTaskStep1NextBtn" type="button" onClick={() => actions.advanceAddTaskWizard()}>Next</button>
              <button className={`btn btn-accent addTaskWizardNextBtn${state.addTaskWizardStep === 2 ? "" : " isHidden"}`} id="addTaskStep2NextBtn" type="button" onClick={() => actions.advanceAddTaskWizard()}>Next</button>
              <button className={`btn btn-accent${state.addTaskWizardStep === 3 ? "" : " isHidden"}`} id="addTaskConfirmBtn" type="submit">Done</button>
            </div>
          </form>
        </div>
      </div>
      <div className="overlay" id="editOverlay" style={{ display: state.editTaskDialogOpen ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
          <div className="editHead">
            <h2>Edit Task</h2>
            <div className="editMoveWrap">
              <label htmlFor="editMoveMenuBtn">Category:</label>
              <details className="editMoveMenu" id="editMoveMenu">
                <summary className="taskMenuItem" id="editMoveMenuBtn" role="button">
                  <span id="editMoveCurrentLabel">{getModeLabel(state, state.editTaskDraft.mode)}</span>
                </summary>
                <div className="taskMenuList">
                  {enabledEditModes.map((mode) => (
                    <button key={mode} className="taskMenuItem editMoveItem" id={`editMove${mode[0].toUpperCase()}${mode.slice(1)}`} data-move-mode={mode} type="button" onClick={() => actions.patchEditTaskDraft({ mode })}>
                      {getModeLabel(state, mode)}
                    </button>
                  ))}
                </div>
              </details>
            </div>
          </div>

          <div className={`editValidationError${editValidation ? " isOn" : ""}`} id="editValidationError" aria-live="polite">
            {editValidation?.message || ""}
          </div>

          <div className={`field${editValidation?.fields?.name ? " isInvalid" : ""}`}>
            <label htmlFor="editName">Task Name</label>
            <input type="text" id="editName" value={state.editTaskDraft.name} onChange={(event) => actions.patchEditTaskDraft({ name: event.target.value })} />
          </div>

          <div className="field">
            <div className="toggleRow">
              <span>Override Elapsed Time</span>
              <SwitchControl
                id="editOverrideElapsedToggle"
                checked={state.editTaskDraft.overrideElapsedEnabled}
                onToggle={() => {
                  if (state.editTaskDraft.overrideElapsedEnabled) {
                    actions.patchEditTaskDraft({ overrideElapsedEnabled: false });
                    return;
                  }
                  actions.requestEnableEditElapsedOverride();
                }}
              />
            </div>
            <div className={`row3 overrideElapsedRow${state.editTaskDraft.overrideElapsedEnabled ? "" : " isDisabled"}`} id="editOverrideElapsedFields">
              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>Days</label>
                <input type="number" id="editD" min={0} step={1} disabled={!state.editTaskDraft.overrideElapsedEnabled} value={state.editTaskDraft.elapsedDays} onChange={(event) => actions.patchEditTaskDraft({ elapsedDays: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>Hours</label>
                <input type="number" id="editH" min={0} step={1} disabled={!state.editTaskDraft.overrideElapsedEnabled} value={state.editTaskDraft.elapsedHours} onChange={(event) => actions.patchEditTaskDraft({ elapsedHours: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>Minutes</label>
                <input type="number" id="editM" min={0} max={59} step={1} disabled={!state.editTaskDraft.overrideElapsedEnabled} value={state.editTaskDraft.elapsedMinutes} onChange={(event) => actions.patchEditTaskDraft({ elapsedMinutes: event.target.value })} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label style={{ textTransform: "none", letterSpacing: 0 }}>Seconds</label>
                <input type="number" id="editS" min={0} max={59} step={1} disabled={!state.editTaskDraft.overrideElapsedEnabled} value={state.editTaskDraft.elapsedSeconds} onChange={(event) => actions.patchEditTaskDraft({ elapsedSeconds: event.target.value })} />
              </div>
            </div>
          </div>

          <details className={`milestones${state.editTaskDraft.milestonesEnabled ? " on" : ""}${editValidation?.fields?.checkpoints ? " isInvalid" : ""}`} id="msArea" open={state.editTaskDraft.milestonesEnabled}>
            <summary className="milestonesSummary" role="button">
              <span className="milestonesSummaryPrimary">Time Checkpoints</span>
              <span className="milestonesSummaryControls">
                <SwitchControl id="msToggle" checked={state.editTaskDraft.milestonesEnabled} onToggle={() => actions.patchEditTaskDraft({ milestonesEnabled: !state.editTaskDraft.milestonesEnabled, presetIntervalsEnabled: !state.editTaskDraft.milestonesEnabled ? state.editTaskDraft.presetIntervalsEnabled : false })} />
                <span className="milestonesSummaryCollapseLabel">Show/Hide Checkpoints</span>
              </span>
            </summary>
            <div className="unitRow" id="msUnitRow">
              <span>Task Timer Format</span>
              <div className="unitButtons">
                <button className={`btn btn-ghost small unitBtn${state.editTaskDraft.milestoneTimeUnit === "day" ? " isOn" : ""}`} id="msUnitDay" type="button" onClick={() => actions.patchEditTaskDraft({ milestoneTimeUnit: "day" })}>Day</button>
                <button className={`btn btn-ghost small unitBtn${state.editTaskDraft.milestoneTimeUnit === "hour" ? " isOn" : ""}`} id="msUnitHour" type="button" onClick={() => actions.patchEditTaskDraft({ milestoneTimeUnit: "hour" })}>Hour</button>
                <button className={`btn btn-ghost small unitBtn${state.editTaskDraft.milestoneTimeUnit === "minute" ? " isOn" : ""}`} id="msUnitMinute" type="button" onClick={() => actions.patchEditTaskDraft({ milestoneTimeUnit: "minute" })}>Minute</button>
              </div>
            </div>
            <div className="milestonesBody">
              <div id="msList">
                <MilestoneRows
                  milestones={state.editTaskDraft.milestones}
                  validation={editValidation}
                  unitSuffix={milestoneUnitLabel(state.editTaskDraft.milestoneTimeUnit)}
                  onValueChange={(milestoneId, value) => actions.updateEditTaskMilestone(milestoneId, { value })}
                  onDescriptionChange={(milestoneId, description) => actions.updateEditTaskMilestone(milestoneId, { description })}
                  onRemove={(milestoneId) => actions.removeEditTaskMilestone(milestoneId)}
                />
              </div>
              <button className="btn btn-ghost" id="addMsBtn" type="button" style={{ width: "100%", marginTop: 10 }} onClick={() => actions.addEditTaskMilestone()}>
                + Add Timer Checkpoint
              </button>
            </div>
          </details>

          <div className={`checkpointAlertsGroup${state.editTaskDraft.milestonesEnabled ? "" : " isHidden"}`} id="editTimerSettingsGroup">
            <div className="checkpointAlertsTitle">Timer Settings</div>
            <div className={`toggleRow${!state.editTaskDraft.milestonesEnabled ? " isDisabled" : ""}`} id="editPresetIntervalsToggleRow">
              <span>Use Preset Intervals</span>
              <SwitchControl id="editPresetIntervalsToggle" checked={editPresetEnabled} disabled={!state.editTaskDraft.milestonesEnabled} onToggle={() => actions.patchEditTaskDraft({ presetIntervalsEnabled: !state.editTaskDraft.presetIntervalsEnabled })} />
              <span className="presetIntervalsInfoSlot" id="editPresetIntervalsInfoSlot">
                <button className="iconBtn editPresetIntervalsInfoBtn" id="editPresetIntervalsInfoBtn" type="button" aria-label="What are preset intervals?" aria-expanded={editPresetInfoVisible} aria-controls="editPresetIntervalsInfoDialog" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setEditPresetInfoOpen((open) => !open); }}>
                  ?
                </button>
              </span>
            </div>
            <div className={`addTaskCheckpointInfoDialog editPresetIntervalsInfoDialog${editPresetInfoVisible ? " isOpen" : ""}`} id="editPresetIntervalsInfoDialog" role="note">
              Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint.
            </div>
            <div className={`field checkpointAlertSoundModeField${editPresetEnabled ? "" : " isHidden"}${editValidation?.fields?.presetInterval ? " isInvalid" : ""}`} id="editPresetIntervalField">
              <label htmlFor="editPresetIntervalInput">Preset interval</label>
              <input id="editPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" value={state.editTaskDraft.presetIntervalValue} onChange={(event) => actions.patchEditTaskDraft({ presetIntervalValue: event.target.value })} />
            </div>
            <p className="checkpointAlertsNote" id="editPresetIntervalNote" style={{ display: editPresetEnabled && !editPresetValid ? "block" : "none" }}>
              {editPresetEnabled && !editPresetValid ? "Enter a preset interval greater than 0 to add checkpoints." : ""}
            </p>
            <div className="field checkpointAlertSoundModeField" id="editFinalCheckpointActionField">
              <label htmlFor="editFinalCheckpointActionSelect">When final checkpoint is reached</label>
              <select id="editFinalCheckpointActionSelect" value={state.editTaskDraft.timeGoalAction} onChange={(event) => actions.patchEditTaskDraft({ timeGoalAction: event.target.value as "continue" | "resetLog" | "resetNoLog" })}>
                <option value="continue">Continue to run timer until stopped by user (default)</option>
                <option value="resetLog">Stop/reset timer and save session to history</option>
                <option value="resetNoLog">Stop/reset timer and do not save session to history</option>
              </select>
            </div>
          </div>

          <div className={`checkpointAlertsGroup${state.editTaskDraft.milestonesEnabled ? "" : " isHidden"}`} id="editCheckpointAlertsGroup">
            <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
            <div className={`toggleRow${!state.checkpointAlertSoundEnabled ? " isDisabled" : ""}`} id="editCheckpointSoundToggleRow">
              <span>Sound Alert</span>
              <SwitchControl id="editCheckpointSoundToggle" checked={state.editTaskDraft.milestonesEnabled && state.editTaskDraft.checkpointSoundEnabled} disabled={!state.editTaskDraft.milestonesEnabled || !state.checkpointAlertSoundEnabled} onToggle={() => actions.patchEditTaskDraft({ checkpointSoundEnabled: !state.editTaskDraft.checkpointSoundEnabled })} />
            </div>
            <div className={`field checkpointAlertSoundModeField${state.editTaskDraft.milestonesEnabled && state.checkpointAlertSoundEnabled && state.editTaskDraft.checkpointSoundEnabled ? "" : " isHidden"}`} id="editCheckpointSoundModeField">
              <label htmlFor="editCheckpointSoundModeSelect">Sound Alert Behaviour</label>
              <select id="editCheckpointSoundModeSelect" value={state.editTaskDraft.checkpointSoundMode} onChange={(event) => actions.patchEditTaskDraft({ checkpointSoundMode: event.target.value as "once" | "repeat" })}>
                <option value="once">Sound alert once only (default)</option>
                <option value="repeat">Wait for user to dismiss sound alert</option>
              </select>
            </div>
            <div className={`toggleRow${!state.checkpointAlertToastEnabled ? " isDisabled" : ""}`} id="editCheckpointToastToggleRow">
              <span>Toast Alert</span>
              <SwitchControl id="editCheckpointToastToggle" checked={state.editTaskDraft.milestonesEnabled && state.editTaskDraft.checkpointToastEnabled} disabled={!state.editTaskDraft.milestonesEnabled || !state.checkpointAlertToastEnabled} onToggle={() => actions.patchEditTaskDraft({ checkpointToastEnabled: !state.editTaskDraft.checkpointToastEnabled })} />
            </div>
            <div className={`field checkpointAlertSoundModeField${state.editTaskDraft.milestonesEnabled && state.checkpointAlertToastEnabled && state.editTaskDraft.checkpointToastEnabled ? "" : " isHidden"}`} id="editCheckpointToastModeField">
              <label htmlFor="editCheckpointToastModeSelect">Toast Alert Behaviour</label>
              <select id="editCheckpointToastModeSelect" value={state.editTaskDraft.checkpointToastMode} onChange={(event) => actions.patchEditTaskDraft({ checkpointToastMode: event.target.value as "auto5s" | "manual" })}>
                <option value="auto5s">Dismiss toast alert after 5 seconds (default)</option>
                <option value="manual">Wait for user to dismiss toast alert</option>
              </select>
            </div>
            <p className="checkpointAlertsNote" id="editCheckpointAlertsNote" style={{ display: state.editTaskDraft.milestonesEnabled && editCheckpointNotes.length ? "block" : "none" }}>
              {editCheckpointNotes.length ? `Checkpoint ${editCheckpointNotes.join(" and ")}.` : ""}
            </p>
          </div>

          <div className="footerBtns">
            <button className="btn btn-ghost" id="cancelEditBtn" type="button" onClick={() => { setEditPresetInfoOpen(false); actions.closeEditTask(); }}>Cancel</button>
            <button className="btn btn-accent" id="saveEditBtn" type="button" onClick={() => { setEditPresetInfoOpen(false); actions.saveEditTask(); }}>Save</button>
          </div>
        </div>
      </div>

      <div className="overlay" id="confirmOverlay" style={{ display: confirmDialog ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Confirm">
          <h2 id="confirmTitle">{confirmDialog?.title || "Confirm"}</h2>
          <div className="confirmText" id="confirmText">
            {confirmDialog?.text || ""}
          </div>
          <div className="chkRow" id="confirmChkRow" style={{ display: hasConfirmCheckbox ? "flex" : "none" }}>
            <input key={`${confirmDialog?.kind || "none"}:${confirmDialogTaskId}`} type="checkbox" id="confirmDeleteAll" defaultChecked={confirmCheckboxChecked} />
            <label htmlFor="confirmDeleteAll" id="confirmChkLabel">
              {confirmCheckboxLabel}
            </label>
          </div>
          <div className="confirmBtns">
            <button className="btn btn-ghost" id="confirmCancelBtn" type="button" onClick={() => actions.closeConfirmDialog()}>Cancel</button>
            <button
              className={`btn ${confirmIsDelete ? "btn-warn" : "btn-accent"}`}
              id="confirmOkBtn"
              type="button"
              onClick={() => {
                const checkbox = document.getElementById("confirmDeleteAll") as HTMLInputElement | null;
                actions.confirmDialog(checkbox?.checked);
              }}
            >
              {confirmDialog?.okLabel || "OK"}
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="historyAnalysisOverlay" style={{ display: analysisTaskId ? "flex" : "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="History Analysis">
          <h2>History Analysis</h2>
          <p className="modalSubtext">
            React-powered inline analysis across {analysisEntries.length} selected session{analysisEntries.length === 1 ? "" : "s"}.
          </p>
          <div className="settingsDetailNote">
            Total elapsed: <strong>{formatHistoryElapsed(totalMs)}</strong>
          </div>
          <div className="settingsDetailNote">
            Average session: <strong>{formatHistoryElapsed(averageMs)}</strong>
          </div>
          <div className="settingsDetailNote">
            Longest session: <strong>{formatHistoryElapsed(Math.max(...analysisEntries.map((entry) => Number(entry.ms || 0)), 0))}</strong>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" type="button" onClick={() => actions.closeHistoryAnalysis()}>Close</button>
          </div>
        </div>
      </div>
    </>
  );
}
