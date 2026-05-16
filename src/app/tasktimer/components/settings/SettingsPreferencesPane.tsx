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
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Auto switch to Focus Mode on launch</span>
              <span className="settingsPreferenceControlHelp">Open Tasks directly in Focus Mode when TaskLaunch starts, so the timer is ready for focused work.</span>
            </div>
            <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
          </div>
          <div className="unitRow" id="taskStartupModuleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Load Module on App Startup</span>
              <span className="settingsPreferenceControlHelp">Choose which main area opens first after sign-in or app launch.</span>
            </div>
            <SettingsDownwardSelect id="taskStartupModuleSelect" aria-label="Load module on app startup">
              <option value="dashboard">Dashboard</option>
              <option value="tasks">Tasks</option>
              <option value="friends">Friends</option>
              <option value="leaderboard">Leaderboards</option>
            </SettingsDownwardSelect>
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
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/alarm.png" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Productivity Optimisation</div>
          </div>
          <div className="unitRow optimalProductivityDaysRow" id="optimalProductivityDaysRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Optimal Productivity Days</span>
              <span className="settingsPreferenceControlHelp">Choose which days count toward productivity streaks, rewards, and dashboard insights.</span>
            </div>
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
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Optimal Productivity Period</span>
              <span className="settingsPreferenceControlHelp">Set the time window TaskLaunch treats as your best focus period when planning and scoring work.</span>
            </div>
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
