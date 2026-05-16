"use client";

import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { SettingsDetailPane } from "./SettingsShared";

export function SettingsAboutPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsAboutPane"
      title="About"
      subtitle="Open the public About page for TaskLaunch's mission, philosophy, features, and neurodivergent-friendly productivity approach."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionTitle">About TaskLaunch</div>
          <div className="settingsDetailNote">
            TaskLaunch now keeps its full About page in one public place, using the same ungated route pattern as the
            Privacy Policy. You can open it without being signed in and share the page directly.
          </div>
          <div className="settingsAboutQuickLinks">
            <a className="btn btn-accent" href={resolveTaskTimerRouteHref("/about")}>
              Open About
            </a>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
