"use client";

import { useEffect, useState } from "react";
import { readTaskTimerPlanFromStorage, TASKTIMER_PLAN_CHANGED_EVENT, type TaskTimerPlan } from "@/app/tasktimer/lib/entitlements";
import { MenuIconLabel, SettingsDetailPane } from "./SettingsShared";

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
    <SettingsDetailPane active={active} exiting={exiting} paneClassName="settingsDataPane" title="Data" subtitle="Manage history, export or import backups, and reset local data.">
      <div className="settingsInlineStack settingsDataListStack">
        <section className="settingsInlineSection">
          <div className="settingsDataList">
            <button className="menuItem settingsDataListItem" data-menu="historyManager" id="historyManagerBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="History Manager" />
            </button>
            <button
              className={`menuItem settingsDataListItem${showBackupLock ? " settingsDataListItemLocked" : ""}`}
              id="exportBtn"
              type="button"
              title={showBackupLock ? "Pro feature: Export Backup" : "Export Backup"}
              aria-label={showBackupLock ? "Export Backup, Pro feature" : "Export Backup"}
            >
              <MenuIconLabel icon="/History_Manager.svg" label="Export Backup" />
              {showBackupLock ? <span className="settingsPlanLockIcon" aria-hidden="true">&#128274;</span> : null}
            </button>
            <button
              className={`menuItem settingsDataListItem${showBackupLock ? " settingsDataListItemLocked" : ""}`}
              id="importBtn"
              type="button"
              title={showBackupLock ? "Pro feature: Import Backup" : "Import Backup"}
              aria-label={showBackupLock ? "Import Backup, Pro feature" : "Import Backup"}
            >
              <MenuIconLabel icon="/History_Manager.svg" label="Import Backup" />
              {showBackupLock ? <span className="settingsPlanLockIcon" aria-hidden="true">&#128274;</span> : null}
            </button>
            <button className="menuItem settingsDataListItem settingsDataListItemDanger" id="resetAllBtn" type="button">
              <MenuIconLabel icon="/History_Manager.svg" label="Reset All" />
            </button>
          </div>
        </section>
      </div>
      <input id="importFile" type="file" accept="application/json" style={{ display: "none" }} />
    </SettingsDetailPane>
  );
}
