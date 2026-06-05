import type { Metadata } from "next";
import Link from "next/link";
import AppImg from "@/components/AppImg";
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
    <main className="landingV2 privacyLandingPage userGuidePage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([organizationJsonLd(), softwareApplicationJsonLd(), userGuideJsonLd()])}
      />
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>

          <div className="landingV2HeaderActions">
            <UserGuideHeaderActions />
          </div>
        </header>

        <section className="landingV2Hero isVisible userGuideHero" aria-label="TaskLaunch User Guide">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">User Guide</h1>
            <p className="landingV2HeroCopy">
              SEARCHABLE KNOWLEDGE BASE FOR EVERY CURRENT TASKLAUNCH MODULE
            </p>
          </div>
        </section>

        <UserGuideExplorer modules={USER_GUIDE_MODULES} />
      </div>
    </main>
  );
}
