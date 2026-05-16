"use client";

import AppImg from "@/components/AppImg";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsNotificationsPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsDisplayTypographyPane settingsNotificationsPane"
      title="Notifications"
      subtitle="Manage mobile push, checkpoint sound, and toast alerts."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Push Notifications</div>
          </div>
          <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
            <div className="toggleRow" id="taskMobilePushAlertsToggleRow">
              <span>Enable Mobile Push Notifications</span>
              <button className="switch" id="taskMobilePushAlertsToggle" type="button" role="switch" aria-checked="false" />
            </div>
            <div className="toggleRow" id="taskWebPushAlertsToggleRow">
              <span>Enable Web Push Notifications</span>
              <button className="switch" id="taskWebPushAlertsToggle" type="button" role="switch" aria-checked="false" />
            </div>
            <div className="settingsInlineSectionHead">
              <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/sounds.png" alt="" aria-hidden="true" />
              <div className="settingsInlineSectionTitle">Sounds</div>
            </div>
            <div className="toggleRow" id="taskCheckpointSoundToggleRow">
              <span>Checkpoint Sound</span>
              <button className="switch on" id="taskCheckpointSoundToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="toggleRow" id="taskCheckpointToastToggleRow">
              <span>Checkpoint Toast</span>
              <button className="switch on" id="taskCheckpointToastToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="field checkpointAlertSoundModeField" id="taskCheckpointSoundModeField">
              <label htmlFor="taskCheckpointSoundModeSelect">Sound Behaviour</label>
              <select id="taskCheckpointSoundModeSelect" defaultValue="once">
                <option value="once">Once</option>
                <option value="repeat">Repeat until dismissed</option>
              </select>
            </div>
            <div className="field checkpointAlertSoundModeField" id="taskCheckpointToastModeField">
              <label htmlFor="taskCheckpointToastModeSelect">Toast Behaviour</label>
              <select id="taskCheckpointToastModeSelect" defaultValue="auto5s">
                <option value="auto5s">Auto dismiss after 5 seconds</option>
                <option value="manual">Dismiss manually</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
