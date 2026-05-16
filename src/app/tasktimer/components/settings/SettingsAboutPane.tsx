"use client";

import AppImg from "@/components/AppImg";
import packageJson from "../../../../../package.json";
import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { MenuIconLabel, SettingsDetailPane } from "./SettingsShared";

const APP_VERSION = packageJson.version;

export function SettingsAboutPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsAboutPane"
      title="About"
      subtitle="TaskLaunch version and current build information"
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon settingsAboutBrandIcon" src="/logo/launch-icon-original-transparent.png" alt="" aria-hidden="true" />
            <div className="settingsInlineSectionTitle">TaskLaunch</div>
          </div>
          <div className="settingsDetailNote">Version: {APP_VERSION}</div>
          <div className="settingsDetailNote">Release Date: 17th May 2026</div>
          <ul className="settingsDataList settingsAboutLinkList">
            <li>
              <a
                className="menuItem settingsDataListItem"
                href={resolveTaskTimerRouteHref("/privacy")}
                aria-label="Privacy Policy"
              >
                <MenuIconLabel icon="/icons/icons_default/privacy-policy.svg" label="Privacy Policy" />
              </a>
            </li>
          </ul>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
