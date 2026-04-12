"use client";

import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsAppearancePane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsDisplayTypographyPane"
      title="Appearance"
      subtitle="Choose your theme and visual display options."
    >
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
            <select id="menuButtonStyleSelect" defaultValue="square" aria-label="Button shape">
              <option value="parallelogram">Parallelogram</option>
              <option value="square">Square</option>
            </select>
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
