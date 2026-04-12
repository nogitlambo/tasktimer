"use client";

import { SettingsDetailPane } from "./SettingsShared";

export function SettingsAboutPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane active={active} exiting={exiting} title="About" subtitle="App summary, version information, and feature overview.">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsDetailNote">
            TaskLaunch combines task timing, dashboard insights, account syncing, and history management across the app routes.
          </div>
          <div className="settingsDetailNote">
            Use the User Guide for walkthroughs, the Dashboard for summaries, and Data tools for export, import, and reset workflows.
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
