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
            <div className="unitButtons settingsThemePalette" role="group" aria-label="Color theme">
              <button
                className="unitBtn settingsThemeSwatch settingsThemeSwatchPurple"
                id="themePurpleBtn"
                type="button"
                aria-label="Purple theme"
                aria-pressed="false"
              >
                <span className="settingsThemeSwatchChip" aria-hidden="true" />
                <span className="settingsThemeSwatchLabel">Purple</span>
              </button>
              <button
                className="unitBtn settingsThemeSwatch settingsThemeSwatchCyan"
                id="themeCyanBtn"
                type="button"
                aria-label="Cyan theme"
                aria-pressed="false"
              >
                <span className="settingsThemeSwatchChip" aria-hidden="true" />
                <span className="settingsThemeSwatchLabel">Cyan</span>
              </button>
              <button
                className="unitBtn settingsThemeSwatch settingsThemeSwatchLime"
                id="themeLimeBtn"
                type="button"
                aria-label="Lime theme"
                aria-pressed="false"
              >
                <span className="settingsThemeSwatchChip" aria-hidden="true" />
                <span className="settingsThemeSwatchLabel">Lime</span>
              </button>
            </div>
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
