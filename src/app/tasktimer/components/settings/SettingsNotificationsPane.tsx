"use client";

import AppImg from "@/components/AppImg";
import { SettingsDownwardSelect } from "./SettingsDownwardSelect";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsNotificationsPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsDisplayTypographyPane settingsNotificationsPane"
      title="Sounds & Alerts"
      subtitle="Manage push notifications, in-app sounds and toast alerts."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/Settings.svg" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">Push Notifications</div>
          </div>
          <div className="checkpointAlertsGroup" id="taskCheckpointAlertsGroup">
            <div className="toggleRow" id="taskMobilePushAlertsToggleRow">
              <div className="settingsPreferenceControlCopy">
                <span className="settingsPreferenceControlLabel">Enable Mobile Push Notifications</span>
                <span className="settingsPreferenceControlHelp">Send scheduled task reminders and completed task alerts through your device notification system when the mobile app is available.</span>
              </div>
              <button className="switch" id="taskMobilePushAlertsToggle" type="button" role="switch" aria-checked="false" />
            </div>
            <div className="toggleRow" id="taskWebPushAlertsToggleRow">
              <div className="settingsPreferenceControlCopy">
                <span className="settingsPreferenceControlLabel">Enable Web Push Notifications</span>
                <span className="settingsPreferenceControlHelp">Send scheduled task reminders and completed task alerts through your browser when TaskLaunch is open.</span>
              </div>
              <button className="switch" id="taskWebPushAlertsToggle" type="button" role="switch" aria-checked="false" />
            </div>
            <div className="settingsInlineSectionHead">
              <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/sounds.png" alt="" aria-hidden="true" />
              <div className="settingsInlineSectionTitle">In-app Sounds</div>
            </div>
            <div className="toggleRow" id="taskInteractionClickSoundToggleRow">
              <div className="settingsPreferenceControlCopy">
                <span className="settingsPreferenceControlLabel">Navigation/interaction clicks</span>
                <span className="settingsPreferenceControlHelp">Play short click sounds for navigation, buttons, switches, and checkbox interactions.</span>
              </div>
              <button className="switch on" id="taskInteractionClickSoundToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="toggleRow" id="taskCheckpointSoundToggleRow">
              <div className="settingsPreferenceControlCopy">
                <span className="settingsPreferenceControlLabel">Checkpoint Sound</span>
                <span className="settingsPreferenceControlHelp">Play an audible alert when an active task reaches a checkpoint.</span>
              </div>
              <button className="switch on" id="taskCheckpointSoundToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="field checkpointAlertSoundModeField" id="taskCheckpointSoundModeField">
              <label className="settingsPreferenceControlCopy" htmlFor="taskCheckpointSoundModeSelect">
                <span className="settingsPreferenceControlLabel">Sound Behaviour</span>
                <span className="settingsPreferenceControlHelp">Choose whether the sound plays once or repeats until you dismiss the alert.</span>
              </label>
              <SettingsDownwardSelect id="taskCheckpointSoundModeSelect" defaultValue="once">
                <option value="once">Once</option>
                <option value="repeat">Repeat until dismissed</option>
              </SettingsDownwardSelect>
            </div>
            <div className="toggleRow" id="taskCheckpointToastToggleRow">
              <div className="settingsPreferenceControlCopy">
                <span className="settingsPreferenceControlLabel">Checkpoint Toast</span>
                <span className="settingsPreferenceControlHelp">Show an in-app checkpoint message while you are using TaskLaunch.</span>
              </div>
              <button className="switch on" id="taskCheckpointToastToggle" type="button" role="switch" aria-checked="true" />
            </div>
            <div className="field checkpointAlertSoundModeField" id="taskCheckpointToastModeField">
              <label className="settingsPreferenceControlCopy" htmlFor="taskCheckpointToastModeSelect">
                <span className="settingsPreferenceControlLabel">Toast Behaviour</span>
                <span className="settingsPreferenceControlHelp">Choose whether checkpoint messages disappear automatically or wait for manual dismissal.</span>
              </label>
              <SettingsDownwardSelect id="taskCheckpointToastModeSelect" defaultValue="auto5s">
                <option value="auto5s">Auto dismiss after 5 seconds</option>
                <option value="manual">Dismiss manually</option>
              </SettingsDownwardSelect>
            </div>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
