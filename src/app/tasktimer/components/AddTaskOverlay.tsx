
export default function AddTaskOverlay() {
  return (
    <div className="overlay" id="addTaskOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
        <h2>Add Task</h2>
        <div className="addTaskValidationError" id="addTaskError" aria-live="polite" />
        <form id="addTaskForm" autoComplete="off" style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0 }}>
          <section className="addTaskWizardStep isActive" id="addTaskStep1">
            <div className="addTaskNameCombo" id="addTaskNameCombo">
              <input id="addTaskName" type="text" placeholder="Enter a name for this task or select from list" />
              <button className="btn btn-ghost small addTaskNameToggle" id="addTaskNameToggle" type="button" aria-label="Show task name options">
                &#9662;
              </button>
              <div className="addTaskNameMenu" id="addTaskNameMenu">
                <div className="addTaskNameCustomTitle" id="addTaskNameCustomTitle">
                  Your Custom Tasks
                </div>
                <div className="addTaskNameList" id="addTaskNameCustomList" />
                <div className="addTaskNameDivider" id="addTaskNameDivider" />
                <div className="addTaskNamePresetTitle" id="addTaskNamePresetTitle">
                  Presets
                </div>
                <div className="addTaskNameList" id="addTaskNamePresetList" />
              </div>
            </div>
          </section>

          <section className="addTaskWizardStep" id="addTaskStep2">
            <div className="addTaskStepPrompt">How much time to you want to spend on this task?</div>
            <div className="addTaskDurationRow" id="addTaskDurationRow">
              <input id="addTaskDurationValueInput" type="number" min={1} step={1} inputMode="numeric" defaultValue={5} />
              <div className="unitButtons addTaskDurationPills" id="addTaskDurationUnitPills" role="group" aria-label="Time goal unit">
                <button className="btn btn-ghost small unitBtn" id="addTaskDurationUnitMinute" type="button" aria-pressed="false">
                  Minutes
                </button>
                <button className="btn btn-ghost small unitBtn isOn" id="addTaskDurationUnitHour" type="button" aria-pressed="true">
                  Hours
                </button>
              </div>
              <span className="addTaskDurationPerLabel">per</span>
              <div className="unitButtons addTaskDurationPills" id="addTaskDurationPeriodPills" role="group" aria-label="Time goal period">
                <button className="btn btn-ghost small unitBtn" id="addTaskDurationPeriodDay" type="button" aria-pressed="false">
                  Day
                </button>
                <button className="btn btn-ghost small unitBtn isOn" id="addTaskDurationPeriodWeek" type="button" aria-pressed="true">
                  Week
                </button>
              </div>
            </div>
            <div className="addTaskDurationReadout" id="addTaskDurationReadout">
              5 hours per week
            </div>
            <label className="addTaskNoGoalRow" htmlFor="addTaskNoGoalCheckbox">
              <input id="addTaskNoGoalCheckbox" type="checkbox" />
              <span>Don&apos;t set a time goal</span>
            </label>
          </section>

          <section className="addTaskWizardStep" id="addTaskStep3">
            <div className="addTaskStepPrompt" id="addTaskPlannedStartPrompt">
              What time of the day do you plan to start this task?
            </div>
            <div className="addTaskPlannedStartSection">
              <div className="addTaskPlannedStartSelectorRow">
                <div className="addTaskPlannedStartTimeCluster">
                  <select id="addTaskPlannedStartHourSelect" aria-label="Start hour" defaultValue="09">
                    <option value="01">01</option>
                    <option value="02">02</option>
                    <option value="03">03</option>
                    <option value="04">04</option>
                    <option value="05">05</option>
                    <option value="06">06</option>
                    <option value="07">07</option>
                    <option value="08">08</option>
                    <option value="09">09</option>
                    <option value="10">10</option>
                    <option value="11">11</option>
                    <option value="12">12</option>
                  </select>
                  <span className="addTaskPlannedStartSeparator" aria-hidden="true">
                    :
                  </span>
                  <select id="addTaskPlannedStartMinuteSelect" aria-label="Start minute" defaultValue="00">
                    <option value="00">00</option>
                    <option value="05">05</option>
                    <option value="10">10</option>
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="25">25</option>
                    <option value="30">30</option>
                    <option value="35">35</option>
                    <option value="40">40</option>
                    <option value="45">45</option>
                    <option value="50">50</option>
                    <option value="55">55</option>
                  </select>
                  <select id="addTaskPlannedStartMeridiemSelect" aria-label="Start time meridiem" defaultValue="AM">
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <label className="addTaskPlannedStartCheckboxRow addTaskPlannedStartInlineCheckboxRow" id="addTaskPlannedStartOpenEndedRow" htmlFor="addTaskPlannedStartOpenEnded">
                  <input id="addTaskPlannedStartOpenEnded" type="checkbox" />
                  <span>Flexible</span>
                </label>
              </div>
              <input id="addTaskPlannedStartInput" type="hidden" defaultValue="09:00" />
            </div>
          </section>

          <section className="addTaskWizardStep" id="addTaskStep4">
            <div className="addTaskStepPrompt addTaskStepPromptWithInfo">
              <span>Set Time Checkpoints? (you can add these in later)</span>
              <button
                className="iconBtn addTaskCheckpointInfoBtn"
                id="addTaskCheckpointInfoBtn"
                type="button"
                aria-label="What are time checkpoints?"
                aria-expanded="false"
                aria-controls="addTaskCheckpointInfoDialog"
              >
                ?
              </button>
            </div>
            <div className="addTaskCheckpointInfoDialog" id="addTaskCheckpointInfoDialog" role="note">
              Time checkpoints are optional milestone markers during a task timer run. Use them to track progress points and
              trigger checkpoint alerts while the task is active.
            </div>
            <div className="milestones" id="addTaskMsArea">
              <div className="milestonesSummary">
                <span className="milestonesSummaryPrimary">Time Checkpoints</span>
                <span className="milestonesSummaryControls">
                  <div className="switch" id="addTaskMsToggle" role="switch" aria-checked="false" />
                </span>
              </div>
              <div className="toggleRow" id="addTaskPresetIntervalsToggleRow">
                <span>Use Preset Intervals</span>
                <div className="switch" id="addTaskPresetIntervalsToggle" role="switch" aria-checked="false" />
                <span className="presetIntervalsInfoSlot" id="addTaskPresetIntervalsInfoSlot">
                  <button
                    className="iconBtn addTaskPresetIntervalsInfoBtn"
                    id="addTaskPresetIntervalsInfoBtn"
                    type="button"
                    aria-label="What are preset intervals?"
                    aria-expanded="false"
                    aria-controls="addTaskPresetIntervalsInfoDialog"
                  >
                    ?
                  </button>
                  <div className="addTaskCheckpointInfoDialog addTaskPresetIntervalsInfoDialog" id="addTaskPresetIntervalsInfoDialog" role="note">
                    Preset intervals auto-fill checkpoint times using a fixed increment each time you add a checkpoint.
                  </div>
                </span>
              </div>
              <div className="field checkpointAlertSoundModeField isHidden" id="addTaskPresetIntervalField">
                <label htmlFor="addTaskPresetIntervalInput">Preset interval</label>
                <input id="addTaskPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" />
              </div>
              <p className="checkpointAlertsNote" id="addTaskPresetIntervalNote" style={{ display: "none" }} />
              <div className="milestonesBody">
                <div id="addTaskMsList" />
                <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
                  + Add Timer Checkpoint
                </button>
              </div>
            </div>

            <div className="checkpointAlertsGroup" id="addTaskTimerSettingsGroup">
              <div className="checkpointAlertsTitle">Timer Settings</div>
            </div>

            <div className="checkpointAlertsGroup" id="addTaskCheckpointAlertsGroup">
              <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
              <div className="toggleRow" id="addTaskCheckpointSoundToggleRow">
                <span>Sound Alert</span>
                <div className="switch" id="addTaskCheckpointSoundToggle" role="switch" aria-checked="false" />
              </div>
              <div className="field checkpointAlertSoundModeField isHidden" id="addTaskCheckpointSoundModeField">
                <label htmlFor="addTaskCheckpointSoundModeSelect">Sound Alert Behaviour</label>
                <select id="addTaskCheckpointSoundModeSelect" defaultValue="once">
                  <option value="once">Sound alert once only (default)</option>
                  <option value="repeat">Wait for user to dismiss sound alert</option>
                </select>
              </div>
              <div className="toggleRow" id="addTaskCheckpointToastToggleRow">
                <span>Toast Alert</span>
                <div className="switch" id="addTaskCheckpointToastToggle" role="switch" aria-checked="false" />
              </div>
              <div className="field checkpointAlertSoundModeField isHidden" id="addTaskCheckpointToastModeField">
                <label htmlFor="addTaskCheckpointToastModeSelect">Toast Alert Behaviour</label>
                <select id="addTaskCheckpointToastModeSelect" defaultValue="auto5s">
                  <option value="auto5s">Dismiss toast alert after 5 seconds (default)</option>
                  <option value="manual">Wait for user to dismiss toast alert</option>
                </select>
              </div>
              <p className="checkpointAlertsNote" id="addTaskCheckpointAlertsNote" style={{ display: "none" }} />
            </div>
          </section>

          <div className="footerBtns addTaskWizardFooter" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" id="addTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-ghost addTaskWizardBackBtn isHidden" id="addTaskStep2BackBtn" type="button">
              Back
            </button>
            <button className="btn btn-ghost addTaskWizardBackBtn isHidden" id="addTaskStep3BackBtn" type="button">
              Back
            </button>
            <button className="btn btn-ghost addTaskWizardBackBtn isHidden" id="addTaskStep4BackBtn" type="button">
              Back
            </button>
            <button className="btn btn-accent addTaskWizardNextBtn" id="addTaskStep1NextBtn" type="button">
              Next
            </button>
            <button className="btn btn-accent addTaskWizardNextBtn isHidden" id="addTaskStep2NextBtn" type="button">
              Next
            </button>
            <button className="btn btn-accent addTaskWizardNextBtn isHidden" id="addTaskStep3NextBtn" type="button">
              Next
            </button>
            <button className="btn btn-accent isHidden" id="addTaskConfirmBtn" type="submit">
              Done
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
