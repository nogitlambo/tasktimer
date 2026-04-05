"use client";

import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsNotificationsPane({ active }: { active: boolean }) {
  return (
    <SettingsDetailPane active={active} title="Notifications" subtitle="Manage checkpoint sound and toast alerts.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Checkpoint Alerts</div>
          </div>
          <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
            <div className="toggleRow" id="taskCheckpointSoundToggleRow">
              <span>Checkpoint sound</span>
              <button className="switch on" id="taskCheckpointSoundToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="toggleRow" id="taskCheckpointToastToggleRow">
              <span>Checkpoint toast</span>
              <button className="switch on" id="taskCheckpointToastToggle" type="button" role="switch" aria-checked="true" />
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
