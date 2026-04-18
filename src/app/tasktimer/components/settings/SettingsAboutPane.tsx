"use client";

import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { SettingsDetailPane } from "./SettingsShared";

const FEATURE_POINTS = [
  "Track live task time with direct launch into Focus Mode.",
  "Review progress through dashboard summaries, streaks, and session trends.",
  "Manage history with filtering, bulk actions, sorting, and export-ready records.",
  "Sync account-backed data and move between Tasks, Dashboard, Friends, and Settings from one runtime.",
];

const PROBLEM_POINTS = [
  "Reduces context switching by keeping timing, review, history, and settings in one authenticated app shell.",
  "Makes it easier to stay focused on one task without losing visibility into trends, streaks, and past sessions.",
  "Cuts down manual cleanup by giving history tools for sorting, bulk actions, and record management.",
  "Keeps personal setup and account-aware app data consistent across sessions instead of forcing repeated reconfiguration.",
];

export function SettingsAboutPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsAboutPane"
      title="About"
      subtitle="Basic summary, key features, and the main problems TaskLaunch is designed to solve."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionTitle">Summary</div>
          <div className="settingsDetailNote">
            TaskLaunch is the authenticated TaskTimer app for tracking live work sessions, reviewing progress, managing history, and adjusting account and app settings in one connected workspace.
          </div>
        </section>
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionTitle">Features</div>
          <ul className="settingsAboutList">
            {FEATURE_POINTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionTitle">Problems It Solves</div>
          <ul className="settingsAboutList">
            {PROBLEM_POINTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="settingsInlineSection">
          <div className="settingsInlineSectionTitle">Quick Links</div>
          <div className="settingsAboutQuickLinks">
            <a className="btn btn-ghost small" href={resolveTaskTimerRouteHref("/user-guide")}>
              Open User Guide
            </a>
            <a className="btn btn-ghost small" href={resolveTaskTimerRouteHref("/feedback")}>
              Send Feedback
            </a>
            <a className="btn btn-ghost small" href={resolveTaskTimerRouteHref("/privacy")}>
              View Privacy
            </a>
          </div>
        </section>
      </div>
    </SettingsDetailPane>
  );
}
