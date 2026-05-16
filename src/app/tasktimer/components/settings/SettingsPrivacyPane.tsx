"use client";

import { SettingsDetailPane } from "./SettingsShared";

export function SettingsPrivacyPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsPrivacyPane"
      title="Privacy Policy"
      subtitle="Review Timebase's privacy policy, including data handling, local storage behavior, and account deletion information."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsDetailNote">Review how your account and local device data are handled, then return here when you are done.</div>
          <div className="settingsInlineFooter">
            <a className="btn btn-accent" href="/privacy">
              Open Privacy Policy
            </a>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
