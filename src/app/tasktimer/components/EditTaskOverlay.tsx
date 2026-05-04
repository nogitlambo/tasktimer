
import type { CSSProperties } from "react";
import { TASK_COLOR_PALETTE } from "../lib/taskColors";

export default function EditTaskOverlay() {
  return (
    <div className="overlay" id="editOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit Task">
        <div className="editTaskModalFrame">
          <div className="editTaskModalHeader">
            <div className="editHead">
              <h2>Edit Task</h2>
            </div>
            <button
              className="editTaskColorTrigger editTaskColorSwatch editTaskColorSwatchNone"
              id="editTaskColorTrigger"
              type="button"
              title="Choose task color"
              aria-label="Choose task color"
              aria-haspopup="dialog"
              aria-expanded="false"
            />
            <div className="editValidationError" id="editValidationError" aria-live="polite" />
          </div>
          <div className="editTaskModalBody">
            <div className="field">
              <label htmlFor="editName">Task Name</label>
              <input type="text" id="editName" />
            </div>

            <div className="unitButtons timerTypePills editTaskTypePills" id="editTaskTypePills" role="group" aria-label="Task type">
              <button className="btn btn-ghost small unitBtn timerTypePill isOn" id="editTaskTypeRecurringBtn" type="button" aria-pressed="true">
                Recurring
              </button>
              <button className="btn btn-ghost small unitBtn timerTypePill" id="editTaskTypeOnceOffBtn" type="button" aria-pressed="false">
                Once-off
              </button>
            </div>

            <div className="field editTaskTimeGoalField">
              <div className="editTaskTimeGoalHeader toggleRow" id="editTaskTimeGoalToggleRow">
                <label className="editTaskTimeGoalToggleWrap" htmlFor="editTimeGoalToggle">
                  <input id="editTimeGoalToggle" type="checkbox" aria-label="Enable time goal" defaultChecked />
                  <span className="editTaskTimeGoalHeaderLabel">Time Goal</span>
                </label>
                <input id="editNoGoalCheckbox" type="checkbox" hidden />
              </div>
              <div className="addTaskDurationRow editTaskDurationRow" id="editTaskDurationRow">
                <input id="editTaskDurationValueInput" type="number" min={1} step={1} inputMode="numeric" defaultValue={5} />
                <div className="unitButtons addTaskDurationPills" id="editTaskDurationUnitPills" role="group" aria-label="Edit time goal unit">
                  <button className="btn btn-ghost small unitBtn" id="editTaskDurationUnitMinute" type="button" aria-pressed="false">
                    Min
                  </button>
                  <button className="btn btn-ghost small unitBtn isOn" id="editTaskDurationUnitHour" type="button" aria-pressed="true">
                    Hour
                  </button>
                </div>
                <span className="addTaskDurationPerLabel">per</span>
                <div className="unitButtons addTaskDurationPills" id="editTaskDurationPeriodPills" role="group" aria-label="Edit time goal period">
                  <button className="btn btn-ghost small unitBtn" id="editTaskDurationPeriodDay" type="button" aria-pressed="false">
                    Day
                  </button>
                  <button className="btn btn-ghost small unitBtn isOn" id="editTaskDurationPeriodWeek" type="button" aria-pressed="true">
                    Week
                  </button>
                </div>
              </div>
              <div className="checkpointAlertsGroup" id="editTimerSettingsGroup" style={{ width: "100%", maxWidth: "none" }}>
              </div>
            </div>

            <div className="field editPlannedStartField">
              <label>Planned Start Time</label>
              <div className="addTaskPlannedStartSection editPlannedStartSection">
                <div className="field editTaskOnceOffDayField isHidden" id="editTaskOnceOffDayField">
                  <label htmlFor="editTaskOnceOffDaySelect">Day</label>
                  <select id="editTaskOnceOffDaySelect" defaultValue="mon">
                    <option value="mon">Monday</option>
                    <option value="tue">Tuesday</option>
                    <option value="wed">Wednesday</option>
                    <option value="thu">Thursday</option>
                    <option value="fri">Friday</option>
                    <option value="sat">Saturday</option>
                    <option value="sun">Sunday</option>
                  </select>
                </div>
                <div className="addTaskPlannedStartSelectorRow">
                  <div className="addTaskPlannedStartTimeCluster">
                    <select id="editPlannedStartHourSelect" aria-label="Edit start hour" defaultValue="09">
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
                    <select id="editPlannedStartMinuteSelect" aria-label="Edit start minute" defaultValue="00">
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
                    <select id="editPlannedStartMeridiemSelect" aria-label="Edit start time meridiem" defaultValue="AM">
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
                <div className="editPlannedStartCheckboxRow">
                  <label className="addTaskPlannedStartCheckboxRow addTaskPlannedStartInlineCheckboxRow" id="editPlannedStartOpenEndedRow" htmlFor="editPlannedStartOpenEnded">
                    <input id="editPlannedStartOpenEnded" type="checkbox" />
                    <span>Flexible</span>
                  </label>
                  <label
                    className="addTaskPlannedStartCheckboxRow addTaskPlannedStartInlineCheckboxRow"
                    id="editPlannedStartPushRemindersRow"
                    htmlFor="editPlannedStartPushReminders"
                  >
                    <input id="editPlannedStartPushReminders" type="checkbox" defaultChecked />
                    <span>Remind Me</span>
                  </label>
                </div>
                <input id="editPlannedStartInput" type="hidden" defaultValue="09:00" />
              </div>
            </div>

            <div className="milestones" id="msArea">
              <div className="milestonesSummary">
                <label className="editTaskCheckpointToggleWrap" htmlFor="msToggle">
                  <input id="msToggle" type="checkbox" aria-label="Enable time checkpoints" />
                  <span className="milestonesSummaryPrimary">Time Checkpoints</span>
                </label>
              </div>
              <div className="toggleRow" id="editPresetIntervalsToggleRow">
                <label className="editTaskInlineCheckboxLabel" htmlFor="editPresetIntervalsToggle">
                  <input id="editPresetIntervalsToggle" type="checkbox" aria-label="Use preset intervals" />
                  <span>Use Preset Intervals</span>
                </label>
              </div>
              <div className="field checkpointAlertSoundModeField isHidden" id="editPresetIntervalField">
                <label htmlFor="editPresetIntervalInput">Preset interval</label>
                <input id="editPresetIntervalInput" type="number" min={0} step="any" inputMode="decimal" />
              </div>
              <p className="checkpointAlertsNote" id="editPresetIntervalNote" style={{ display: "none" }} />
              <div className="milestonesBody">
                <div id="msList" />
                <button className="btn btn-ghost" id="addMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
                  + Add Checkpoint
                </button>
              </div>
            </div>

            <details className="editTaskAdvancedMenu checkpointAlertsGroup" id="editTaskAdvancedMenu">
              <summary className="editTaskAdvancedSummary">
                <span>Advanced</span>
              </summary>
              <div className="editTaskAdvancedBody">
                <div className="field checkpointAlertBehaviourField" id="editCheckpointAlertBehaviourField">
                  <label htmlFor="editCheckpointSoundModeSelect">Checkpoint alert behaviour</label>
                  <div className="editCheckpointAlertBehaviourGrid">
                    <div className="field checkpointAlertSoundModeField" id="editCheckpointSoundModeField">
                      <label htmlFor="editCheckpointSoundModeSelect">Sound</label>
                      <select id="editCheckpointSoundModeSelect" defaultValue="once">
                        <option value="once">Once</option>
                        <option value="repeat">Repeat until dismissed</option>
                      </select>
                    </div>
                    <div className="field checkpointAlertSoundModeField" id="editCheckpointToastModeField">
                      <label htmlFor="editCheckpointToastModeSelect">Toast</label>
                      <select id="editCheckpointToastModeSelect" defaultValue="auto5s">
                        <option value="auto5s">Auto dismiss after 5 seconds</option>
                        <option value="manual">Dismiss manually</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
          <div className="footerBtns">
            <button className="btn btn-ghost" id="cancelEditBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="saveEditBtn" type="button">
              Save
            </button>
          </div>
          <div className="editTaskColorPopover" id="editTaskColorPopover" role="dialog" aria-modal="false" aria-label="Choose task color" style={{ display: "none" }}>
            <div className="editTaskColorPopoverPanel">
              <div className="editTaskColorPalette" id="editTaskColorPalette" role="radiogroup" aria-label="Task color">
                <button
                  className="editTaskColorSwatch editTaskColorSwatchNone isSelected"
                  id="editTaskColorNone"
                  type="button"
                  data-task-color=""
                  role="radio"
                  aria-checked="true"
                  title="No task color"
                  aria-label="No task color"
                />
                {TASK_COLOR_PALETTE.map((color) => (
                  <button
                    className="editTaskColorSwatch"
                    key={color}
                    type="button"
                    data-task-color={color}
                    role="radio"
                    aria-checked="false"
                    title={`Use task color ${color}`}
                    aria-label={`Use task color ${color}`}
                    style={{ "--task-color": color } as CSSProperties}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
