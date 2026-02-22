import React from "react";

function MenuIconLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <>
      <img className="settingsMenuItemIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsMenuItemText">{label}</span>
    </>
  );
}

export default function SettingsPanel() {
  return (
    <div className="menu settingsMenu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Task Timer Settings
        </div>
        <button className="menuIcon settingsCloseIcon" id="closeMenuBtn" type="button" aria-label="Exit settings">
          Exit
        </button>
      </div>

      <div className="menuList">
        <div className="settingsSectionLabel">General</div>
        <button className="menuItem settingsAuthItem" id="signUpBtn" type="button">
          Sign Up
        </button>

        <button className="menuItem settingsAuthItem" id="signInEmailBtn" type="button">
          Sign in with email
        </button>

        <button className="menuItem settingsAuthItem" id="signInGoogleBtn" type="button">
          Sign in with Google
        </button>

        <div className="menuDivider" role="separator" aria-hidden="true" />

        <div className="settingsSectionLabel">Preferences</div>
        <button className="menuItem" id="categoryManagerBtn" data-menu="categoryManager" type="button">
          <MenuIconLabel icon="/Modes.svg" label="Configure Modes" />
        </button>
        <button className="menuItem" id="taskSettingsBtn" data-menu="taskSettings" type="button">
          <MenuIconLabel icon="/Task_Settings.svg" label="Task Settings" />
        </button>
        <button className="menuItem" id="dashboardSettingsBtn" type="button">
          <MenuIconLabel icon="/Dashboard.svg" label="Dashboard Settings" />
        </button>
        <button className="menuItem" data-menu="appearance" type="button">
          <MenuIconLabel icon="/Appearance.svg" label="Appearance" />
        </button>

        <div className="menuDivider" role="separator" aria-hidden="true" />

        <div className="settingsSectionLabel">Support</div>
        <button className="menuItem" data-menu="about" type="button">
          <MenuIconLabel icon="/About.svg" label="About" />
        </button>

        <button className="menuItem" data-menu="howto" type="button">
          <MenuIconLabel icon="/User_Guide.svg" label="User Guide" />
        </button>

        <button className="menuItem" data-menu="contact" type="button">
          <MenuIconLabel icon="/Contact.svg" label="Contact" />
        </button>
        <button className="menuItem" id="feedbackBtn" type="button">
          <MenuIconLabel icon="/Feedback.svg" label="Feedback" />
        </button>

        <div className="menuDivider" role="separator" aria-hidden="true" />

        <div className="settingsSectionLabel">Data</div>
        <button className="menuItem" data-menu="historyManager" id="historyManagerBtn" type="button">
          <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
        </button>

        <button className="menuItem" id="exportBtn" type="button">
          <MenuIconLabel icon="/Export.svg" label="Export Backup" />
        </button>

        <button className="menuItem" id="importBtn" type="button">
          <MenuIconLabel icon="/Import.svg" label="Import Backup" />
        </button>

        <button className="menuItem" id="resetAllBtn" type="button">
          <MenuIconLabel icon="/Reset.svg" label="Reset All" />
        </button>

        <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
      </div>

    </div>
  );
}

