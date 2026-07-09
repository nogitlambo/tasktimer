import type { Metadata } from "next";
import Link from "next/link";
import {
  absoluteUrl,
  buildPageMetadata,
  jsonLdScript,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "../seo";
import { USER_GUIDE_MODULES } from "./content";
import UserGuideExplorer from "./UserGuideExplorer";
import UserGuideHeaderActions from "./UserGuideHeaderActions";
import "../tasktimer/tasktimer.css";
import "../primitives/primitives.css";

export const metadata: Metadata = buildPageMetadata({
  title: "User Guide",
  description:
    "Search the TaskLaunch User Guide for Tasks, Schedule, Dashboard, History Manager, Friends, Leaderboards, Account, Settings, Feedback, and navigation help.",
  path: "/user-guide/",
});

function userGuideJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${absoluteUrl("/user-guide/")}#user-guide`,
    headline: "TaskLaunch User Guide",
    description:
      "A searchable guide to TaskLaunch modules including tasks, scheduling, dashboards, history, friends, leaderboards, account, settings, and feedback.",
    image: absoluteUrl("/user-guide/dashboard.webp"),
    author: {
      "@id": `${absoluteUrl("/")}#organization`,
    },
    publisher: {
      "@id": `${absoluteUrl("/")}#organization`,
    },
  };
}

export default function UserGuidePage() {
  return (
    <main id="app" className="primitiveGallery primitiveSurface" aria-label="TaskLaunch User Guide">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([organizationJsonLd(), softwareApplicationJsonLd(), userGuideJsonLd()])}
      />
      <div className="primitiveShell">
        <header className="primitiveHero">
          <div>
            <p className="primitiveEyebrow displayFont">TaskLaunch Help</p>
            <h1 className="displayFont">User Guide</h1>
            <p className="modalSubtext">
              Simple how-to steps for each module and feature in the current app.
            </p>
          </div>

          <div className="primitiveInlineGrid">
            <Link href="/" className="btn btn-ghost small" aria-label="TaskLaunch home">
              Home
            </Link>
            <UserGuideHeaderActions />
          </div>
        </header>

        <section className="primitiveSection" aria-labelledby="user-guide-start">
          <div className="primitiveSectionHeader">
            <div>
              <h2 id="user-guide-start">Start Here</h2>
              <p className="modalSubtext">
                Search for a task, pick a module from contents, then follow the numbered steps.
              </p>
            </div>
            <Link className="btn btn-accent small" href="/tasklaunch">
              Open Tasks
            </Link>
          </div>
          <section className="dashboardCard primitiveDashboardCard" aria-label="Using the guide">
            <h3 className="dashboardCardTitle">Guide Format</h3>
            <p className="modalSubtext">
              Each module has a short purpose, direct action steps, and compact notes for things that are easy to miss.
            </p>
          </section>
          <pre className="primitiveCode" tabIndex={0}>
            <code>{"Search -> choose module -> follow steps -> open the app module"}</code>
          </pre>
        </section>

        <UserGuideExplorer modules={USER_GUIDE_MODULES} />
      </div>
    </main>
  );
}
