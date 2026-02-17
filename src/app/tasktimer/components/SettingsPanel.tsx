import React from "react";

export default function SettingsPanel() {
  return (
    <div className="menu settingsMenu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Task Timer Settings
        </div>
        <button className="menuIcon settingsCloseIcon" id="closeMenuBtn" type="button" aria-label="Close menu">
          X
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
          Category Manager
        </button>
        <div className="menuDivider" role="separator" aria-hidden="true" />

        <div className="settingsSectionLabel">Data</div>
        <button className="menuItem" data-menu="historyManager" id="historyManagerBtn" type="button">
          History Manager
        </button>

        <button className="menuItem" id="exportBtn" type="button">
          Export Backup
        </button>

        <button className="menuItem" id="importBtn" type="button">
          Import Backup
        </button>

        <div className="settingsSectionLabel">System</div>
        <button className="menuItem" data-menu="appearance" type="button">
          Appearance
        </button>

        <button className="menuItem settingsBottomLock" id="resetAllBtn" type="button">
          Reset All
        </button>

        <div className="settingsSectionLabel">Support</div>
        <button className="menuItem" data-menu="about" type="button">
          About
        </button>

        <button className="menuItem" data-menu="howto" type="button">
          User-Guide
        </button>

        <button className="menuItem" data-menu="contact" type="button">
          Contact
        </button>

        <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
      </div>

    </div>
  );
}

