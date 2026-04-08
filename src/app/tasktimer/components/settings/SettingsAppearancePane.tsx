"use client";

import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsAppearancePane({ active }: { active: boolean }) {
  return (
    <SettingsDetailPane active={active} title="Appearance" subtitle="Choose your theme and visual display options.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Theme</div>
          </div>
          <div className="unitRow" id="themeToggleRow">
            <span>Color Theme</span>
            <select id="themeSelect" defaultValue="purple" aria-label="Color theme">
              <option value="purple">Purple</option>
              <option value="lime">Lime</option>
              <option value="cyan">Cyan</option>
            </select>
          </div>
          <div className="unitRow" id="menuButtonStyleRow">
            <span>Button Shape</span>
            <div className="unitButtons" role="group" aria-label="Menu button style">
              <button className="btn btn-ghost small unitBtn" id="menuButtonStyleParallelogramBtn" type="button">
                Parallelogram
              </button>
              <button className="btn btn-ghost small unitBtn" id="menuButtonStyleSquareBtn" type="button">
                Square
              </button>
            </div>
          </div>
          <div className="toggleRow" id="taskDynamicColorsToggleRow">
            <span>Dynamic Colors</span>
            <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
          </div>
          <div className="settingsInlineFooter">
            <button className="btn btn-ghost" id="appearanceLoadDefaultsBtn" type="button">
              Load Defaults
            </button>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
