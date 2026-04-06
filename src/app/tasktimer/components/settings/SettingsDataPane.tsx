"use client";

import { MenuIconLabel, SettingsDetailPane } from "./SettingsShared";

export function SettingsDataPane({ active }: { active: boolean }) {
  return (
    <SettingsDetailPane active={active} paneClassName="settingsDataPane" title="Data" subtitle="Manage history, export or import backups, and reset local data.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsDataList">
            <button className="menuItem settingsDataTile" data-menu="historyManager" id="historyManagerBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
            </button>
            <button className="menuItem settingsDataTile" id="exportBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="Export Backup" />
            </button>
            <button className="menuItem settingsDataTile" id="importBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="Import Backup" />
            </button>
            <button className="menuItem settingsDataTile settingsDataTileDanger" id="resetAllBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="Reset All" />
            </button>
          </div>
        </section>
      </div>
      <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
    </SettingsDetailPane>
  );
}
