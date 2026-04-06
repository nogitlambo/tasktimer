"use client";

import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsPreferencesPane({ active }: { active: boolean }) {
  return (
    <SettingsDetailPane active={active} paneClassName="settingsDisplayTypographyPane" title="Preferences" subtitle="Configure task behavior and dashboard options.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Task Settings</div>
          </div>
          <div className="unitRow">
            <span>Default Task Timer Format</span>
            <div className="unitButtons">
              <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatDay" type="button">
                D
              </button>
              <button className="btn btn-ghost small unitBtn isOn" id="taskDefaultFormatHour" type="button">
                H
              </button>
              <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatMinute" type="button">
                M
              </button>
            </div>
          </div>
          <div className="toggleRow" id="taskAutoFocusOnLaunchToggleRow">
            <span>Auto switch to Focus Mode on launch</span>
            <button className="switch" id="taskAutoFocusOnLaunchToggle" type="button" role="switch" aria-checked="false" />
          </div>
          <div className="unitRow" id="taskViewRow">
            <span>Task View</span>
            <div className="unitButtons" role="group" aria-label="Task view">
              <button className="btn btn-ghost small unitBtn" id="taskViewList" type="button" aria-pressed="false">
                List
              </button>
              <button className="btn btn-ghost small unitBtn isOn" id="taskViewTile" type="button" aria-pressed="true">
                Tile
              </button>
            </div>
          </div>
          <div className="unitRow" id="taskWeekStartingRow">
            <span>Week Starts On</span>
            <select id="taskWeekStartingSelect" aria-label="Week start">
              <option value="sun">Sunday</option>
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
            </select>
          </div>
          <div className="settingsInlineFooter">
            <button className="btn btn-ghost" id="preferencesLoadDefaultsBtn" type="button">
              Load Defaults
            </button>
            <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button" tabIndex={-1}>
              Save
            </button>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
