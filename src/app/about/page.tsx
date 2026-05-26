import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import { buildPageMetadata, jsonLdScript, organizationJsonLd, softwareApplicationJsonLd } from "../seo";

export const metadata: Metadata = buildPageMetadata({
  title: "About TaskLaunch",
  description:
    "Learn how TaskLaunch supports neurodivergent productivity, ADHD-friendly workflows, sustainable momentum, and progress without perfectionism.",
  path: "/about/",
});

const HELP_POINTS = [
  "Quickly resume work without falling victim to self-blame.",
  "Increase your momentum without stressing out.",
  "Feel organized without becoming overwhelmed.",
  "Avoid all-or-nothing thinking.",
  "Focus on results instead of perfection.",
  "Recover faster after setbacks and downtime.",
  "Remain engaged without having to follow a strict streak-based system.",
];

const FEATURE_POINTS = [
  "Flexible task management to ease the process of getting started.",
  "Setting goals and forming habits with less pressure on your shoulders.",
  "Push notifications and reminders to help you take action.",
  "Public leaderboards and social systems to give you additional motivation (optional).",
  "Progress tracking that rewards persistence and recovery.",
  "Clean and minimalist interfaces for better focus.",
];

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

function AboutList({ items }: { items: string[] }) {
  return (
    <div className="privacyLandingStack">
      {items.map((item) => (
        <div className="privacyLandingClause" key={item}>
          <span className="privacyLandingClauseKey" aria-hidden="true">
            &bull;
          </span>
          <div>{item}</div>
        </div>
      ))}
    </div>
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
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
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

            <p className="landingV2HeroCopy">PRODUCTIVITY THAT FEELS REALISTIC, SUPPORTIVE, AND HUMAN</p>
          </div>
        </section>

        <div className="privacyLandingBody">
          <AboutSection id="mission" number={1} title="Mission">
            <p>
              TaskLaunch is a highly adaptive productivity tool aimed at neurodivergent brains. It doesn&apos;t require
              you to be perfect or follow strict schedules, but rather helps create sustainable momentum by being
              realistic and human-centric.
            </p>
            <p>
              TaskLaunch doesn&apos;t transform you into a productivity machine. Instead, it helps you function in a way
              that supports your focus patterns and optimize your output in those periods.
            </p>
          </AboutSection>

          <AboutSection id="cycle" number={2} title="Cycle to break">
            <p>
              Most productivity tools assume that success lies within doing something the same way every day without a
              break. Failure to hit a goal or missing a habit makes you lose all momentum instantly. One bad day turns
              into guilt, which eventually leads to avoiding work entirely and becoming overwhelmed and exhausted.
            </p>
            <p>
              The vicious cycle of procrastination and lack of motivation becomes a regular routine for many people
              suffering from ADHD, executive dysfunction, autism, burnout, fluctuating motivation, or inconsistent
              energy levels. TaskLaunch helps break that circle.
            </p>
          </AboutSection>

          <AboutSection id="different-way" number={3} title="Alternative approach">
            <p>
              Rather than punishing for inconsistency, TaskLaunch lets you regain control and resume productivity
              without feeling guilty or expecting perfection from yourself. One challenging day shouldn&apos;t make you
              abandon all your goals or lose all the momentum you&apos;ve gained previously.
            </p>
            <p>
              It is still progress even if it goes slowly or unpredictably because of your condition. TaskLaunch works
              with the ways your mind naturally processes information and doesn&apos;t try to make you fit a specific set
              of rules, making things more complicated over time.
            </p>
          </AboutSection>

          <AboutSection id="helps-you" number={4} title="Advantages">
            <AboutList items={HELP_POINTS} />
          </AboutSection>

          <AboutSection id="features" number={5} title="Features">
            <p>TaskLaunch offers an expanding list of mechanisms aimed at developing sustainable productivity.</p>
            <AboutList items={FEATURE_POINTS} />
          </AboutSection>

          <AboutSection id="philosophy" number={6} title="Philosophy">
            <p>
              Unlike other productivity tools that constantly push you to do more, TaskLaunch encourages you to be more
              resilient and realistic. Productivity is not a straight line where each next step follows previous ones.
              Sometimes you feel highly motivated and ready to do anything. At other times, even a minor task seems
              impossible to complete.
            </p>
            <p>
              Both states are natural. What&apos;s important is being able to overcome failures and resume working without
              falling into depression and self-blame. Real productivity can only be achieved through recovery,
              persistence, and self-confidence.
            </p>
          </AboutSection>
        </div>
      </div>
    </main>
  );
}
