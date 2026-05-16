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
              id="commandCenterFeedbackBtn"
              href={resolveTaskTimerRouteHref("/feedback")}
              aria-label="Feedback"
            >
              <MenuIconLabel icon="/icons/icons_default/message.svg" label="Feedback" helper="Share product feedback and suggestions." />
            </a>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
