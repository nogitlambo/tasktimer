"use client";

import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { MenuIconLabel, SettingsDetailPane } from "./SettingsShared";

export function SettingsHelpPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane active={active} exiting={exiting} paneClassName="settingsHelpPane" title="Support" subtitle="Open privacy and feedback resources.">
      <div className="settingsInlineStack settingsDataListStack">
        <section className="settingsInlineSection">
          <div className="settingsDataList">
            <a
              className="menuItem settingsDataListItem"
              href={resolveTaskTimerRouteHref("/privacy")}
              aria-label="Privacy Policy"
            >
              <MenuIconLabel icon="/About.svg" label="Privacy Policy" />
            </a>
            <a
              className="menuItem settingsDataListItem"
              id="commandCenterFeedbackBtn"
              href={resolveTaskTimerRouteHref("/feedback")}
              aria-label="Feedback"
            >
              <MenuIconLabel icon="/About.svg" label="Feedback" />
            </a>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
