import React from "react";

export default function SettingsPanel() {
  return (
    <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menuHead">
        <div className="menuTitle" aria-label="Task Timer Settings">
          Task Timer Settings
        </div>
      </div>

      <div className="menuList">
        <button className="menuItem" id="signUpBtn" type="button">
          Sign Up
        </button>

        <div className="menuDivider" role="separator" aria-hidden="true" />

        <button className="menuItem" id="signInEmailBtn" type="button">
          Sign in with email
        </button>

        <button className="menuItem" id="signInGoogleBtn" type="button">
          Sign in with Google
        </button>

        <div className="menuDivider" role="separator" aria-hidden="true" />

        <button className="menuItem" data-menu="historyManager" id="historyManagerBtn" type="button">
          History Manager
        </button>

        <button className="menuItem" id="categoryManagerBtn" type="button">
          Category Manager
        </button>

        <button className="menuItem" data-menu="about" type="button">
          About
        </button>

        <button className="menuItem" data-menu="howto" type="button">
          User-Guide
        </button>

        <button className="menuItem" data-menu="appearance" type="button">
          Appearance
        </button>

        <button className="menuItem" data-menu="contact" type="button">
          Contact
        </button>

        <button className="menuItem" id="exportBtn" type="button">
          Export Backup
        </button>

        <button className="menuItem" id="importBtn" type="button">
          Import Backup
        </button>

        <button className="menuItem" id="resetAllBtn" type="button">
          Reset All
        </button>

        <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
      </div>

      <div className="footerBtns">
        <button className="btn btn-accent" id="closeMenuBtn" type="button" aria-label="Close menu">
          Close
        </button>
      </div>
    </div>
  );
}

