"use client";

import React, { useMemo, useState } from "react";

type SettingsPaneKey =
  | "general"
  | "preferences"
  | "support"
  | "data";

function MenuIconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <img className="settingsMenuItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsMenuItemText">{label}</span>
    </>
  );
}

function SettingsNavTile({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`menuItem settingsNavTile${active ? " isActive" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="settingsNavRowText">{label}</span>
    </button>
  );
}

function SettingsDetailPane({
  active,
  title,
  subtitle,
  children,
}: {
  active: boolean;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`settingsDetailPane${active ? " isActive" : ""}`} aria-hidden={active ? "false" : "true"}>
      <div className="settingsDetailHead">
        <div className="settingsDetailKicker">Settings Module</div>
        <h2 className="settingsDetailTitle">{title}</h2>
        <p className="settingsDetailText">{subtitle}</p>
      </div>
      <div className="settingsDetailBody">{children}</div>
    </section>
  );
}

export default function SettingsPanel() {
  const [activePane, setActivePane] = useState<SettingsPaneKey>("preferences");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const navItems = useMemo(
    () => [
      { key: "general" as const, label: "General" },
      { key: "preferences" as const, label: "Preferences" },
      { key: "support" as const, label: "Support" },
      { key: "data" as const, label: "Data" },
    ],
    []
  );

  return (
    <div className="menu settingsMenu settingsDashboardShell dashboardShell" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Settings
        </div>
        <button className="menuIcon settingsCloseIcon" id="closeMenuBtn" type="button" aria-label="Exit settings">
          Exit
        </button>
      </div>

      <div className={`settingsSplitLayout${mobileDetailOpen ? " isMobileDetailOpen" : ""}`}>
        <aside className="settingsNavPanel dashboardCard" aria-label="Settings navigation">
          <div className="settingsSectionLabel settingsSideLabel">Modules</div>
          <div className="settingsNavGrid">
            {navItems.map((item) => (
              <SettingsNavTile
                key={item.key}
                label={item.label}
                active={activePane === item.key}
                onClick={() => {
                  setActivePane(item.key);
                  setMobileDetailOpen(true);
                }}
              />
            ))}
          </div>
        </aside>

        <div className={`settingsDetailPanel dashboardCard${mobileDetailOpen ? " isMobileOpen" : ""}`}>
          <div className="settingsMobileDetailHead">
            <button
              type="button"
              className="btn btn-ghost small settingsMobileBackBtn"
              onClick={() => setMobileDetailOpen(false)}
              aria-label="Back to settings sections"
            >
              Back
            </button>
            <div className="settingsMobileDetailHeadTitle">
              {navItems.find((n) => n.key === activePane)?.label || "Settings"}
            </div>
          </div>
          <SettingsDetailPane
            active={activePane === "general"}
            title="General"
            subtitle="Account and sign-in options for TaskTimer."
          >
            <div className="settingsActionGrid settingsActionGridStack">
              <button className="menuItem settingsAuthItem" id="signUpBtn" type="button">
                Sign Up
              </button>
              <button className="menuItem settingsAuthItem" id="signInEmailBtn" type="button">
                Sign in with email
              </button>
              <button className="menuItem settingsAuthItem" id="signInGoogleBtn" type="button">
                Sign in with Google
              </button>
            </div>
            <div className="settingsDetailNote">
              Account actions stay available here while keeping preferences and data tools separate.
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "preferences"}
            title="Preferences"
            subtitle="Configure task behavior, modes, dashboard options, and appearance."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Task_Settings.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Task Settings</div>
                </div>
                <div className="unitRow">
                  <span>Default Task Timer Format</span>
                  <div className="unitButtons">
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatDay" type="button">
                      Day
                    </button>
                    <button className="btn btn-ghost small unitBtn isOn" id="taskDefaultFormatHour" type="button">
                      Hour
                    </button>
                    <button className="btn btn-ghost small unitBtn" id="taskDefaultFormatMinute" type="button">
                      Minute
                    </button>
                  </div>
                </div>
                <div className="toggleRow" id="taskDynamicColorsToggleRow">
                  <span>Dynamic colors for progress and history</span>
                  <button className="switch on" id="taskDynamicColorsToggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
                  <div className="checkpointAlertsTitle">Checkpoint Alerts</div>
                  <div className="toggleRow" id="taskCheckpointSoundToggleRow">
                    <span>Enable sound alerts</span>
                    <button className="switch on" id="taskCheckpointSoundToggle" type="button" role="switch" aria-checked="true" />
                  </div>
                  <div className="toggleRow" id="taskCheckpointToastToggleRow">
                    <span>Enable toast alerts</span>
                    <button className="switch on" id="taskCheckpointToastToggle" type="button" role="switch" aria-checked="true" />
                  </div>
                </div>
                <div className="settingsInlineFooter">
                  <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button">
                    Save
                  </button>
                </div>
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Modes.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Configure Modes</div>
                </div>
                <div className="field categoryFieldRow">
                  <label htmlFor="categoryMode1Input">Default Mode</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode1Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode1Color" type="color" aria-label="Mode 1 color" />
                    <input className="categoryColorHex" id="categoryMode1ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 1 hex color" />
                  </div>
                </div>
                <div className="modeSwitchesLabel">Modes</div>
                <div className="toggleRow">
                  <span id="categoryMode2ToggleLabel">Disable Mode 2</span>
                  <button className="switch on" id="categoryMode2Toggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="field categoryFieldRow" id="categoryMode2Row">
                  <label htmlFor="categoryMode2Input">Mode 2</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode2Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode2Color" type="color" aria-label="Mode 2 color" />
                    <input className="categoryColorHex" id="categoryMode2ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 2 hex color" />
                    <button className="categoryTrashBtn" id="categoryMode2TrashBtn" type="button" aria-label="Delete Mode 2 category">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="toggleRow">
                  <span id="categoryMode3ToggleLabel">Disable Mode 3</span>
                  <button className="switch on" id="categoryMode3Toggle" type="button" role="switch" aria-checked="true" />
                </div>
                <div className="field categoryFieldRow" id="categoryMode3Row">
                  <label htmlFor="categoryMode3Input">Mode 3</label>
                  <div className="categoryFieldControl">
                    <input id="categoryMode3Input" type="text" maxLength={10} />
                    <input className="categoryColorInput" id="categoryMode3Color" type="color" aria-label="Mode 3 color" />
                    <input className="categoryColorHex" id="categoryMode3ColorHex" type="text" maxLength={7} placeholder="#00CFC8" aria-label="Mode 3 hex color" />
                    <button className="categoryTrashBtn" id="categoryMode3TrashBtn" type="button" aria-label="Delete Mode 3 category">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="settingsInlineFooter">
                  <button className="btn btn-ghost" id="categoryResetBtn" type="button">
                    Reset Defaults
                  </button>
                  <button className="btn btn-accent" id="categorySaveBtn" type="button">
                    Save
                  </button>
                </div>
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Appearance.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Appearance</div>
                </div>
                <div className="toggleRow" id="themeToggleRow">
                  <span>Toggle between light and dark mode</span>
                  <button className="switch on" id="themeToggle" type="button" role="switch" aria-checked="true" />
                </div>
              </section>

              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Dashboard.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Dashboard Settings</div>
                </div>
                <div className="settingsDetailNote">
                  Dashboard settings controls can be added here. The section is now part of Preferences and no longer opens a separate modal.
                </div>
                <button className="menuItem settingsActionRow" id="dashboardSettingsBtn" type="button">
                  <MenuIconLabel icon="/Dashboard.svg" label="Dashboard Settings" />
                </button>
              </section>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "support"}
            title="Support"
            subtitle="Documentation, app information, and contact options."
          >
            <div className="settingsActionGrid settingsActionGridStack settingsActionRows">
              <button className="menuItem settingsActionRow" data-menu="howto" type="button">
                <MenuIconLabel icon="/User_Guide.svg" label="User Guide" />
              </button>
              <button className="menuItem settingsActionRow" data-menu="about" type="button">
                <MenuIconLabel icon="/About.svg" label="About" />
              </button>
              <button className="menuItem settingsActionRow" data-menu="contact" type="button">
                <MenuIconLabel icon="/Contact.svg" label="Contact" />
              </button>
              <button className="menuItem settingsActionRow" id="feedbackBtn" type="button">
                <MenuIconLabel icon="/Feedback.svg" label="Feedback" />
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "data"}
            title="Data"
            subtitle="Manage history, export or import backups, and reset local data."
          >
            <div className="settingsActionGrid settingsActionGridStack settingsActionRows">
              <button className="menuItem settingsActionRow" data-menu="historyManager" id="historyManagerBtn" type="button">
                <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
              </button>
              <button className="menuItem settingsActionRow" id="exportBtn" type="button">
                <MenuIconLabel icon="/Export.svg" label="Export Backup" />
              </button>
              <button className="menuItem settingsActionRow" id="importBtn" type="button">
                <MenuIconLabel icon="/Import.svg" label="Import Backup" />
              </button>
              <button className="menuItem settingsActionRow" id="resetAllBtn" type="button">
                <MenuIconLabel icon="/Reset.svg" label="Reset All" />
              </button>
            </div>
          </SettingsDetailPane>

          <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
