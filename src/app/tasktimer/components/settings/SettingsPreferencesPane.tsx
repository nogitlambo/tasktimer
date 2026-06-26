"use client";

import AppImg from "@/components/AppImg";
import type { ChangeEvent, MouseEvent } from "react";
import { SettingsDownwardSelect } from "./SettingsDownwardSelect";
import { SettingsDetailPane } from "./SettingsShared";

const TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_DAYS_CHANGE_EVENT = "tasktimer:settings-optimal-productivity-days-change";
const TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_PERIOD_CHANGE_EVENT = "tasktimer:settings-optimal-productivity-period-change";
const TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_TIME_PICKER_OPEN_EVENT = "tasktimer:settings-optimal-productivity-time-picker-open";
const OPTIMAL_PRODUCTIVITY_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

type TimePickerInput = HTMLInputElement & { showPicker?: () => void };
type OptimalProductivityPeriodField = "start" | "end";

function getSelectedOptimalProductivityDays(menu: Element | null) {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLInputElement>("input[data-optimal-productivity-day]"))
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function dispatchOptimalProductivityDaysChange(days: string[], inputId?: string) {
  window.dispatchEvent(
    new CustomEvent(TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_DAYS_CHANGE_EVENT, {
      detail: { days, inputId },
    })
  );
}

function dispatchOptimalProductivityPeriodChange(field: OptimalProductivityPeriodField, value: string, inputId: string) {
  window.dispatchEvent(
    new CustomEvent(TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_PERIOD_CHANGE_EVENT, {
      detail: { field, value, inputId },
    })
  );
}

function openNativeTimePicker(input: HTMLInputElement | null) {
  if (!input) return;
  input.classList.add("isFallbackVisible");
  input.focus();
  const pickerInput = input as TimePickerInput;
  if (typeof pickerInput.showPicker === "function") {
    try {
      pickerInput.showPicker();
    } catch {
      // The visible native field remains available when picker access is blocked.
    }
  }
  window.setTimeout(() => input.focus(), 0);
}

function getProductivityTimeInputId(field: OptimalProductivityPeriodField) {
  return field === "end" ? "optimalProductivityEndTimeInput" : "optimalProductivityStartTimeInput";
}

export function SettingsPreferencesPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  function handleOptimalProductivityDayChange(event: ChangeEvent<HTMLInputElement>) {
    event.stopPropagation();
    const input = event.currentTarget;
    dispatchOptimalProductivityDaysChange(getSelectedOptimalProductivityDays(input.closest("#optimalProductivityDaysMenu")), input.id);
  }

  function handleOptimalProductivityAllClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    dispatchOptimalProductivityDaysChange(OPTIMAL_PRODUCTIVITY_DAYS);
  }

  function handleOptimalProductivityTimeButtonClick(
    event: MouseEvent<HTMLButtonElement>,
    field: OptimalProductivityPeriodField
  ) {
    event.stopPropagation();
    openNativeTimePicker(document.getElementById(getProductivityTimeInputId(field)) as HTMLInputElement | null);
    window.dispatchEvent(
      new CustomEvent(TASKTIMER_SETTINGS_OPTIMAL_PRODUCTIVITY_TIME_PICKER_OPEN_EVENT, {
        detail: { field },
      })
    );
  }

  function handleOptimalProductivityTimeChange(event: ChangeEvent<HTMLInputElement>, field: OptimalProductivityPeriodField) {
    event.stopPropagation();
    const input = event.currentTarget;
    dispatchOptimalProductivityPeriodChange(field, input.value, input.id);
  }

  return (
    <SettingsDetailPane active={active} exiting={exiting} paneClassName="settingsDisplayTypographyPane" title="Preferences" subtitle="Configure task behavior and dashboard options.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Task Settings</div>
          </div>
          <div className="toggleRow" id="taskAutoFocusOnLaunchToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Auto switch to Focus Mode on launch</span>
              <span className="settingsPreferenceControlHelp">Opens Focus Mode automatically when a task is launched</span>
            </div>
            <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
          </div>
          <div className="unitRow" id="taskStartupModuleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Default Module on App Startup</span>
              <span className="settingsPreferenceControlHelp">Choose which main area opens first after sign-in or app launch.</span>
            </div>
            <SettingsDownwardSelect id="taskStartupModuleSelect" aria-label="Default module on app startup">
              <option value="dashboard">Dashboard</option>
              <option value="tasks">Tasks (default)</option>
              <option value="notes">Notes</option>
              <option value="friends">Friends</option>
              <option value="leaderboard">Leaderboards</option>
            </SettingsDownwardSelect>
          </div>
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/dashboard.webp" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Dashboard Settings</div>
          </div>
          <div className="toggleRow" id="dashboardPreviousWeekToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Show Previous Week</span>
              <span className="settingsPreferenceControlHelp">Shows previous-week comparison bars in the dashboard activity chart.</span>
            </div>
            <button className="switch on" id="dashboardPreviousWeekToggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/alarm.webp" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Productivity Optimisation</div>
          </div>
          <div className="unitRow" id="taskWeekStartingRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Week Starts On</span>
              <span className="settingsPreferenceControlHelp">Set the first day used for weekly dashboard totals, streaks, and history summaries.</span>
            </div>
            <SettingsDownwardSelect id="taskWeekStartingSelect" aria-label="Week start">
              <option value="sun">Sunday</option>
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
            </SettingsDownwardSelect>
          </div>
          <div className="unitRow optimalProductivityDaysRow" id="optimalProductivityDaysRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Optimal Productivity Days</span>
              <span className="settingsPreferenceControlHelp">Choose which days count toward productivity streaks, rewards, and dashboard insights.</span>
            </div>
            <div className="optimalProductivityDaysField">
              <div className="optimalProductivityDaysMenu" id="optimalProductivityDaysMenu" role="group" aria-label="Optimal productivity days">
                <label className="chkRow" htmlFor="optimalProductivityDayMon">
                  <span>MON</span>
                  <input id="optimalProductivityDayMon" type="checkbox" value="mon" data-optimal-productivity-day="mon" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayTue">
                  <span>TUE</span>
                  <input id="optimalProductivityDayTue" type="checkbox" value="tue" data-optimal-productivity-day="tue" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayWed">
                  <span>WED</span>
                  <input id="optimalProductivityDayWed" type="checkbox" value="wed" data-optimal-productivity-day="wed" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayThu">
                  <span>THU</span>
                  <input id="optimalProductivityDayThu" type="checkbox" value="thu" data-optimal-productivity-day="thu" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayFri">
                  <span>FRI</span>
                  <input id="optimalProductivityDayFri" type="checkbox" value="fri" data-optimal-productivity-day="fri" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDaySat">
                  <span>SAT</span>
                  <input id="optimalProductivityDaySat" type="checkbox" value="sat" data-optimal-productivity-day="sat" onChange={handleOptimalProductivityDayChange} />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDaySun">
                  <span>SUN</span>
                  <input id="optimalProductivityDaySun" type="checkbox" value="sun" data-optimal-productivity-day="sun" onChange={handleOptimalProductivityDayChange} />
                </label>
                <button
                  className="optimalProductivityDaysAllBtn"
                  id="optimalProductivityDaysAllBtn"
                  type="button"
                  aria-pressed="false"
                  aria-label="Select all optimal productivity days"
                  onClick={handleOptimalProductivityAllClick}
                >
                  ALL
                </button>
              </div>
            </div>
          </div>
          <div className="unitRow optimalProductivityPeriodRow" id="optimalProductivityPeriodRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Optimal Productivity Period</span>
              <span className="settingsPreferenceControlHelp">Time block you are at your most productive on a given day.</span>
            </div>
            <div className="optimalProductivityPeriodInputs" aria-label="Optimal productivity period">
              <label>
                <span>Start</span>
                <button
                  className="optimalProductivityClockButton"
                  id="optimalProductivityStartTimeButton"
                  type="button"
                  aria-label="Choose optimal productivity start time"
                  onClick={(event) => handleOptimalProductivityTimeButtonClick(event, "start")}
                >
                  <span className="optimalProductivityClockValue" id="optimalProductivityStartTimeValue">12:00 AM</span>
                </button>
                <input
                  id="optimalProductivityStartTimeInput"
                  className="optimalProductivityClockNativeInput"
                  type="time"
                  defaultValue="00:00"
                  aria-label="Optimal productivity start time"
                  onChange={(event) => handleOptimalProductivityTimeChange(event, "start")}
                />
              </label>
              <label>
                <span>End</span>
                <button
                  className="optimalProductivityClockButton"
                  id="optimalProductivityEndTimeButton"
                  type="button"
                  aria-label="Choose optimal productivity end time"
                  onClick={(event) => handleOptimalProductivityTimeButtonClick(event, "end")}
                >
                  <span className="optimalProductivityClockValue" id="optimalProductivityEndTimeValue">11:59 PM</span>
                </button>
                <input
                  id="optimalProductivityEndTimeInput"
                  className="optimalProductivityClockNativeInput"
                  type="time"
                  defaultValue="23:59"
                  aria-label="Optimal productivity end time"
                  onChange={(event) => handleOptimalProductivityTimeChange(event, "end")}
                />
              </label>
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
