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
      subtitle="Primary color and visual display options."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Theme</div>
          </div>
          <div className="unitRow" id="themeToggleRow">
            <span>Primary Color</span>
            <div className="unitButtons settingsThemePalette" role="group" aria-label="Color theme">
              <button
                className="unitBtn settingsThemeSwatch settingsThemeSwatchLime"
                id="themeLimeBtn"
                type="button"
                aria-label="Primary theme"
                aria-pressed="false"
              >
                <span className="settingsThemeSwatchChip" aria-hidden="true" />
                <span className="settingsThemeSwatchLabel">Primary</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
