"use client";

import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { MenuIconLabel, SettingsDetailPane } from "./SettingsShared";

export function SettingsHelpPane({ active }: { active: boolean }) {
  return (
    <SettingsDetailPane active={active} paneClassName="settingsHelpPane" title="Support" subtitle="Open the Timebase user guide and walkthrough content.">
      <div className="settingsInlineStack settingsDataListStack">
        <section className="settingsInlineSection">
          <div className="settingsDataList">
            <button className="menuItem settingsDataListItem" data-menu="howto" type="button">
              <MenuIconLabel icon="/About.svg" label="User Guide" />
            </button>
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
