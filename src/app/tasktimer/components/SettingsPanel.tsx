"use client";

import React, { useMemo, useState } from "react";

type SettingsPaneKey =
  | "general"
  | "preferences"
  | "userGuide"
  | "about"
  | "feedback"
  | "data"
  | "reset";

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
  danger,
  onClick,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`menuItem settingsNavTile${active ? " isActive" : ""}${danger ? " isDanger" : ""}`}
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
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackDetails, setFeedbackDetails] = useState("");
  const navItems = useMemo(
    () => [
      { key: "general" as const, label: "Account" },
      { key: "preferences" as const, label: "Preferences" },
      { key: "userGuide" as const, label: "User Guide" },
      { key: "about" as const, label: "About" },
      { key: "feedback" as const, label: "Feedback" },
      { key: "data" as const, label: "Data" },
      { key: "reset" as const, label: "Reset All" },
    ],
    []
  );
  const isValidFeedbackEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedbackEmail.trim());
  const canSubmitFeedback = isValidFeedbackEmail && !!feedbackType && feedbackDetails.trim().length > 0;

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
                danger={item.key === "reset"}
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
            title="Account"
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
            <div className="settingsInlineFooter settingsPreferencesFooter">
              <button className="btn btn-ghost" id="categoryResetBtn" type="button">
                Reset Defaults
              </button>
              <button
                className="btn btn-accent"
                id="preferencesSaveBtn"
                type="button"
                onClick={() => {
                  (document.getElementById("taskSettingsSaveBtn") as HTMLButtonElement | null)?.click();
                  (document.getElementById("categorySaveBtn") as HTMLButtonElement | null)?.click();
                }}
              >
                Save Preferences
              </button>
            </div>
            <div style={{ display: "none" }} aria-hidden="true">
              <button className="btn btn-accent" id="taskSettingsSaveBtn" type="button" tabIndex={-1}>
                Save
              </button>
              <button className="btn btn-accent" id="categorySaveBtn" type="button" tabIndex={-1}>
                Save
              </button>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "userGuide"}
            title="User Guide"
            subtitle="Open the TaskTimer user guide and walkthrough content."
          >
            <div className="settingsActionGrid settingsActionGridStack settingsActionRows">
              <button className="menuItem settingsActionRow" data-menu="howto" type="button">
                <MenuIconLabel icon="/User_Guide.svg" label="Open User Guide" />
              </button>
            </div>
            <div className="settingsDetailNote">
              User Guide is available as its own module for quicker access from the Settings screen.
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "about"}
            title="About"
            subtitle="App summary, version information, and feature overview."
          >
            <div className="aboutHead">
              <img className="aboutLogo" alt="TaskTimer logo" src="/tasktimer-logo.png" />
              <div>
                <h2 style={{ margin: 0 }}>TaskTimer</h2>
                <div style={{ color: "rgba(255,255,255,.65)", fontWeight: 700 }}>
                  Focused task timing with progress and history
                </div>
              </div>
            </div>
            <div className="aboutText" style={{ marginTop: 10 }}>
              <p style={{ marginTop: 0 }}>
                TaskTimer is built for tracking focused work across multiple tasks and modes, with a fast workflow for
                start/stop timing, reviewing progress, and managing your history.
              </p>
              <p>Key features include:</p>
              <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                <li>Multiple task categories (Mode 1, Mode 2, Mode 3) with configurable labels and colors</li>
                <li>Per-task timers with start, stop, reset, duplication, and manual editing controls</li>
                <li>Checkpoint milestones and progress tracking on each task</li>
                <li>Inline history charts with entry/day views, selection tools, export, analysis, and manager access</li>
                <li>Focus Mode for a single-task timer view with dedicated controls and insights</li>
                <li>Backup export/import, including import merge/overwrite options</li>
                <li>Dashboard and guide pages for overview and onboarding</li>
              </ul>
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "feedback"}
            title="Feedback"
            subtitle="Share product feedback and suggestions."
          >
            <div className="settingsInlineStack">
              <section className="settingsInlineSection">
                <div className="settingsInlineSectionHead">
                  <img className="settingsInlineSectionIcon" src="/Feedback.svg" alt="" aria-hidden="true" />
                  <div className="settingsInlineSectionTitle">Feedback Form</div>
                </div>

                <div className="field">
                  <label htmlFor="feedbackEmailInput">Email Address</label>
                  <input
                    id="feedbackEmailInput"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    value={feedbackEmail}
                    onChange={(e) => setFeedbackEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="feedbackTypeSelect">Feedback Type</label>
                  <select
                    id="feedbackTypeSelect"
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value)}
                  >
                    <option value="" disabled>
                      --Please Select--
                    </option>
                    <option value="bug">Report a bug</option>
                    <option value="general">General feedback</option>
                    <option value="feature">Request a feature/enhancement</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="feedbackDetailsInput">Details</label>
                  <textarea
                    id="feedbackDetailsInput"
                    rows={6}
                    placeholder="Share details, steps to reproduce (if reporting a bug), or what you would like improved."
                    value={feedbackDetails}
                    onChange={(e) => setFeedbackDetails(e.target.value)}
                  />
                </div>

                <div className="settingsInlineFooter">
                  <button className="btn btn-accent" id="feedbackBtn" type="button" disabled={!canSubmitFeedback}>
                    Submit Feedback
                  </button>
                </div>
              </section>
            </div>
            <div className="settingsDetailNote">
              This is a mock feedback form layout. Submission handling can be wired to email, API, or issue tracking later.
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
            </div>
          </SettingsDetailPane>

          <SettingsDetailPane
            active={activePane === "reset"}
            title="Reset All"
            subtitle="Clear local app data and reset the app state on this device."
          >
            <div className="settingsActionGrid settingsActionGridStack settingsActionRows">
              <button className="menuItem settingsActionRow" id="resetAllBtn" type="button">
                <MenuIconLabel icon="/Reset.svg" label="Reset All Data" />
              </button>
            </div>
            <div className="settingsDetailNote">
              This action is destructive. Export a backup first if you want to preserve tasks, history, and settings.
            </div>
          </SettingsDetailPane>

          <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
        </div>
      </div>
    </div>
  );
}
