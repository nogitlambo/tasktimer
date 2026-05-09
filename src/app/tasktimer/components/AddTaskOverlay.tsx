import TaskColorPickerPopover from "./TaskColorPickerPopover";

export default function AddTaskOverlay() {
  return (
    <div className="overlay" id="addTaskOverlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add Task">
          <div className="editTaskModalFrame addTaskModalFrame">
            <div className="editTaskModalHeader addTaskModalHeader">
              <div className="editHead">
                <h2>Add Task</h2>
              </div>
            <div className="editValidationError addTaskValidationError" id="addTaskError" aria-live="polite" />
          </div>
          <form id="addTaskForm" autoComplete="off" className="editTaskModalBody addTaskModalBody">
            <div className="field">
              <label htmlFor="addTaskName">Task Name</label>
              <div className="addTaskNameCombo" id="addTaskNameCombo">
                <div className="taskNameRow">
                  <input id="addTaskName" type="text" placeholder="Enter a description for this task" />
                  <button
                    className="editTaskColorTrigger editTaskColorSwatch editTaskColorSwatchNone"
                    id="addTaskColorTrigger"
                    type="button"
                    title="Choose task color"
                    aria-label="Choose task color"
                    aria-haspopup="dialog"
                    aria-expanded="false"
                  />
                </div>
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
            </div>

            <div className="unitButtons timerTypePills editTaskTypePills" id="addTaskTypePills" role="group" aria-label="Task type">
              <button className="btn btn-ghost small unitBtn timerTypePill isOn" id="addTaskTypeRecurringBtn" type="button" aria-pressed="true">
                Recurring
              </button>
              <button className="btn btn-ghost small unitBtn timerTypePill" id="addTaskTypeOnceOffBtn" type="button" aria-pressed="false">
                Once-Off
              </button>
            </div>

            <div className="field editTaskTimeGoalField">
              <div className="editTaskTimeGoalHeader" id="addTaskTimeGoalToggleRow">
                <span className="editTaskTimeGoalHeaderLabel">Time Goal</span>
              </div>
              <div className="addTaskDurationRow editTaskDurationRow" id="addTaskDurationRow">
                <input id="addTaskDurationValueInput" type="number" min={1} step={1} inputMode="numeric" defaultValue={0} />
                <div className="unitButtons addTaskDurationPills" id="addTaskDurationUnitPills" role="group" aria-label="Time goal unit">
                  <button className="btn btn-ghost small unitBtn" id="addTaskDurationUnitMinute" type="button" aria-pressed="false">
                    Min
                  </button>
                  <button className="btn btn-ghost small unitBtn isOn" id="addTaskDurationUnitHour" type="button" aria-pressed="true">
                    Hour
                  </button>
                </div>
                <span className="addTaskDurationPerLabel" id="addTaskDurationPerLabel">per</span>
                <div className="unitButtons addTaskDurationPills" id="addTaskDurationPeriodPills" role="group" aria-label="Time goal period">
                  <button className="btn btn-ghost small unitBtn isOn" id="addTaskDurationPeriodDay" type="button" aria-pressed="true">
                    Day
                  </button>
                  <button className="btn btn-ghost small unitBtn" id="addTaskDurationPeriodWeek" type="button" aria-pressed="false">
                    Week
                  </button>
                </div>
              </div>
              <div className="addTaskDurationReadout" id="addTaskDurationReadout" />
            </div>

            <div className="field editPlannedStartField">
              <label>Planned Start Time</label>
              <div className="addTaskPlannedStartSection editPlannedStartSection">
                <div className="addTaskPlannedStartSelectorRow">
                  <div className="field editTaskOnceOffDayField isHidden" id="addTaskOnceOffDayField">
                    <select id="addTaskOnceOffDaySelect" defaultValue="mon" aria-label="Once-off day">
                      <option value="mon">Monday</option>
                      <option value="tue">Tuesday</option>
                      <option value="wed">Wednesday</option>
                      <option value="thu">Thursday</option>
                      <option value="fri">Friday</option>
                      <option value="sat">Saturday</option>
                      <option value="sun">Sunday</option>
                    </select>
                  </div>
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
                </div>
                <div className="editPlannedStartCheckboxRow">
                  <label
                    className="addTaskPlannedStartCheckboxRow addTaskPlannedStartInlineCheckboxRow"
                    id="addTaskPlannedStartPushRemindersRow"
                    htmlFor="addTaskPlannedStartPushReminders"
                  >
                    <input id="addTaskPlannedStartPushReminders" type="checkbox" />
                    <span>Remind Me</span>
                  </label>
                </div>
                <input id="addTaskPlannedStartInput" type="hidden" defaultValue="09:00" />
              </div>
            </div>

            <div className="milestones isHidden" id="addTaskMsArea">
              <div className="milestonesSummary">
                <label className="editTaskCheckpointToggleWrap" htmlFor="addTaskMsToggle">
                  <input id="addTaskMsToggle" type="checkbox" aria-label="Enable time checkpoints" />
                  <span className="milestonesSummaryPrimary">Time Checkpoints</span>
                </label>
              </div>
              <div className="milestonesBody">
                <div id="addTaskMsList" />
                <button className="btn btn-ghost" id="addTaskAddMsBtn" type="button" style={{ width: "100%", marginTop: 10 }}>
                  + Add Checkpoint
                </button>
              </div>
            </div>
          </form>
          <div className="footerBtns addTaskFooterBtns">
            <button className="btn btn-ghost" id="addTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="addTaskConfirmBtn" type="submit" form="addTaskForm">
              Create
            </button>
          </div>
          <div className="editTaskColorPopover" id="addTaskColorPopover" role="dialog" aria-modal="false" aria-label="Choose task color" style={{ display: "none" }}>
            <div className="editTaskColorPopoverPanel" id="addTaskColorPopoverPanel">
              <TaskColorPickerPopover paletteId="addTaskColorPalette" noneId="addTaskColorNone" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
