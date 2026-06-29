import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import { buildPageMetadata, jsonLdScript, organizationJsonLd, softwareApplicationJsonLd } from "../seo";

export const metadata: Metadata = buildPageMetadata({
  title: "About TaskLaunch",
  description:
    "TaskLaunch is a time tracking and productivity app for sustainable progress, stronger habits, momentum, XP, ranks, and optional productivity leaderboards.",
  path: "/about/",
});

function AboutSection({
  id,
  number,
  title,
  children,
}: {
  id?: string;
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="privacyLandingSection" id={id}>
      <div className="landingV2SectionLabel">
        <span className="landingV2SectionIndex displayFont">{String(number).padStart(2, "0")}</span>
        <span className="landingV2SectionName">{title}</span>
      </div>
      <div className="privacyLandingContent">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="landingV2 privacyLandingPage aboutLandingPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript([organizationJsonLd(), softwareApplicationJsonLd()])}
      />
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo.webp" alt="" className="landingHeaderLogo" />
          </Link>

          <div className="landingV2HeaderActions">
            <Link href="/" className="landingV2HeaderBack displayFont">
              Home
            </Link>
            <Link href="/privacy" className="landingV2HeaderBack displayFont">
              Privacy
            </Link>
          </div>
        </header>

        <section className="landingV2Hero isVisible" aria-label="TaskLaunch about hero">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">About</h1>
          </div>
        </section>

        <div className="privacyLandingBody">
          <AboutSection id="realistic-productivity-tool" number={1} title="A realistic productivity tool">
            <p>
              TaskLaunch is a time tracking and productivity app built around sustainable progress. It helps turn small
              moments of effort into stronger habits by supporting the way your focus and energy naturally shift
              throughout the week.
            </p>
            <p>
              Instead of pushing you to perform at the same level every day, TaskLaunch helps you plan tasks around your
              strongest focus windows. Work when your mind is more ready, reduce friction when energy is low, and build
              a routine that feels achievable rather than forced.
            </p>
          </AboutSection>

          <AboutSection id="stronger-habits" number={2} title="Build stronger habits">
            <p>
              Each completed task becomes part of a larger progress picture. TaskLaunch converts logged effort into
              real-time feedback, helping you see what you are doing well, where your patterns are forming, and how your
              habits are developing.
            </p>
            <p>
              Your stats show what you complete, when you are most active, and how your effort changes over time. These
              insights make it easier to plan smarter and keep moving without relying on guesswork.
            </p>
            <p>
              The aim is not perfect daily performance. The aim is visible, repeatable progress that is easier to
              maintain.
            </p>
          </AboutSection>

          <AboutSection id="momentum" number={3} title="Momentum is key">
            <p>
              TaskLaunch changes the way momentum works. Consistency still matters, but it is not treated as something
              that disappears the moment you miss a day.
            </p>
            <p>
              Every focused effort contributes to your momentum score. Smaller sessions still count, restarted tasks
              still matter, and uneven weeks can still move you forward. Missed days may lower your momentum, but they
              do not wipe out everything you have built.
            </p>
          </AboutSection>

          <AboutSection id="visible-progress" number={4} title="Progress you can see and feel">
            <p>
              The time you log earns XP, and stronger momentum increases the rate at which XP is awarded. This gives
              your effort a visible sense of growth and helps make progress feel more rewarding.
            </p>
            <p>
              XP supports rank progression and optional leaderboard participation, adding a social and competitive
              element for users who enjoy extra motivation. It creates a clearer sense of achievement without adding
              unnecessary pressure.
            </p>
          </AboutSection>
        </div>
      </div>
    </main>
  );
}
