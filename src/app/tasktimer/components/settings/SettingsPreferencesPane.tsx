"use client";

import AppImg from "@/components/AppImg";
import { SettingsDownwardSelect } from "./SettingsDownwardSelect";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsPreferencesPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane active={active} exiting={exiting} paneClassName="settingsDisplayTypographyPane" title="Preferences" subtitle="Configure task behavior and dashboard options.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Task Settings</div>
          </div>
          <div className="toggleRow" id="taskAutoFocusOnLaunchToggleRow">
            <span>Auto switch to Focus Mode on launch</span>
            <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
          </div>
          <div className="unitRow" id="taskStartupModuleRow">
            <span>Load Module on App Startup</span>
            <SettingsDownwardSelect id="taskStartupModuleSelect" aria-label="Load module on app startup">
              <option value="dashboard">Dashboard</option>
              <option value="tasks">Tasks</option>
              <option value="friends">Friends</option>
              <option value="leaderboard">Leaderboards</option>
            </SettingsDownwardSelect>
          </div>
          <div className="unitRow" id="taskWeekStartingRow">
            <span>Week Starts On</span>
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
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/alarm.png" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Productivity Optimisation</div>
          </div>
          <div className="unitRow optimalProductivityDaysRow" id="optimalProductivityDaysRow">
            <span>Optimal Productivity Days</span>
            <div className="optimalProductivityDaysField">
              <div className="optimalProductivityDaysMenu" id="optimalProductivityDaysMenu" role="group" aria-label="Optimal productivity days">
                <label className="chkRow" htmlFor="optimalProductivityDayMon">
                  <span>M</span>
                  <input id="optimalProductivityDayMon" type="checkbox" value="mon" data-optimal-productivity-day="mon" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayTue">
                  <span>T</span>
                  <input id="optimalProductivityDayTue" type="checkbox" value="tue" data-optimal-productivity-day="tue" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayWed">
                  <span>W</span>
                  <input id="optimalProductivityDayWed" type="checkbox" value="wed" data-optimal-productivity-day="wed" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayThu">
                  <span>T</span>
                  <input id="optimalProductivityDayThu" type="checkbox" value="thu" data-optimal-productivity-day="thu" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDayFri">
                  <span>F</span>
                  <input id="optimalProductivityDayFri" type="checkbox" value="fri" data-optimal-productivity-day="fri" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDaySat">
                  <span>Sa</span>
                  <input id="optimalProductivityDaySat" type="checkbox" value="sat" data-optimal-productivity-day="sat" />
                </label>
                <label className="chkRow" htmlFor="optimalProductivityDaySun">
                  <span>Su</span>
                  <input id="optimalProductivityDaySun" type="checkbox" value="sun" data-optimal-productivity-day="sun" />
                </label>
              </div>
            </div>
          </div>
          <div className="unitRow optimalProductivityPeriodRow" id="optimalProductivityPeriodRow">
            <span>Optimal Productivity Period</span>
            <div className="optimalProductivityPeriodInputs" aria-label="Optimal productivity period">
              <label>
                <span>Start</span>
                <input id="optimalProductivityStartTimeInput" type="time" defaultValue="00:00" aria-label="Optimal productivity start time" />
              </label>
              <label>
                <span>End</span>
                <input id="optimalProductivityEndTimeInput" type="time" defaultValue="23:59" aria-label="Optimal productivity end time" />
              </label>
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
