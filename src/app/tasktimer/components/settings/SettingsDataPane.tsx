"use client";

import { useEffect, useState } from "react";
import { readTaskTimerPlanFromStorage, TASKTIMER_PLAN_CHANGED_EVENT, type TaskTimerPlan } from "@/app/tasktimer/lib/entitlements";
import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

function SettingsDataTileLabel({ icon, label, helper }: { icon: string; label: string; helper: string }) {
  return (
    <span className="settingsDataTileBody">
      <AppImg className="settingsDataTileIcon" src={icon} alt="" aria-hidden="true" />
      <span className="settingsDataTileText">
        <span className="settingsDataTileLabel">{label}</span>
        <span className="settingsDataTileHelper">{helper}</span>
      </span>
    </span>
  );
}

export function SettingsDataPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  const [currentPlan, setCurrentPlan] = useState<TaskTimerPlan>(() => readTaskTimerPlanFromStorage());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncPlan = () => setCurrentPlan(readTaskTimerPlanFromStorage());
    syncPlan();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan as EventListener);
    return () => window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan as EventListener);
  }, []);

  const showBackupLock = currentPlan === "free";

  return (
    <SettingsDetailPane active={active} exiting={exiting} paneClassName="settingsDataPane" title="Data" subtitle="Manage history entries, export or import backups, and reset your account data.">
      <div className="settingsInlineStack settingsDataListStack">
        <section className="settingsInlineSection">
          <div className="settingsDataList">
            <button className="menuItem settingsDataListItem" data-menu="historyManager" id="historyManagerBtn" type="button">
              <SettingsDataTileLabel icon="/icons/icons_default/history.webp" label="History Manager" helper="Review, sort, and bulk-manage saved history entries." />
            </button>
            <button
              className={`menuItem settingsDataListItem${showBackupLock ? " settingsDataListItemLocked" : ""}`}
              id="exportBtn"
              type="button"
              title={showBackupLock ? "Pro feature: Export Backup" : "Export Backup"}
              aria-label={showBackupLock ? "Export Backup, Pro feature" : "Export Backup"}
            >
              <SettingsDataTileLabel icon="/icons/icons_default/export.webp" label="Export Backup" helper="Save a backup file of your current task data." />
              {showBackupLock ? <span className="settingsPlanLockIcon" aria-hidden="true">&#128274;</span> : null}
            </button>
            <button
              className={`menuItem settingsDataListItem${showBackupLock ? " settingsDataListItemLocked" : ""}`}
              id="importBtn"
              type="button"
              title={showBackupLock ? "Pro feature: Import Backup" : "Import Backup"}
              aria-label={showBackupLock ? "Import Backup, Pro feature" : "Import Backup"}
            >
              <SettingsDataTileLabel icon="/icons/icons_default/import.webp" label="Import Backup" helper="Restore tasks from a saved backup file." />
              {showBackupLock ? <span className="settingsPlanLockIcon" aria-hidden="true">&#128274;</span> : null}
            </button>
            <button className="menuItem settingsDataListItem settingsDataListItemDanger" id="resetAllBtn" type="button">
              <SettingsDataTileLabel icon="/icons/icons_default/reset.webp" label="Reset All" helper="Permanently delete history entries and tasks." />
            </button>
          </div>
        </section>
      </div>
      <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
    </SettingsDetailPane>
  );
}
