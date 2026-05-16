import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import AppImg from "@/components/AppImg";
import AboutBackButton from "./AboutBackButton";

export const metadata: Metadata = {
  title: "About TaskLaunch",
  description:
    "Learn how TaskLaunch supports neurodivergent productivity, sustainable momentum, recovery after setbacks, and progress without perfectionism.",
  alternates: {
    canonical: "/about",
  },
};

const HELP_POINTS = [
  "Restart quickly after setbacks instead of spiralling into guilt.",
  "Build momentum without pressure or unrealistic expectations.",
  "Stay organized without feeling overwhelmed.",
  "Reduce all-or-nothing thinking that destroys motivation.",
  "Focus on meaningful progress instead of perfection.",
  "Create routines that feel sustainable long term.",
  "Turn scattered energy into focused action.",
  "Recover faster after difficult days or periods of inactivity.",
  "Stay engaged without relying on rigid streak systems.",
  "Build confidence through consistent recovery, not flawless performance.",
];

const FEATURE_POINTS = [
  "Flexible task management designed to reduce overwhelm.",
  "Goal and habit tracking without excessive pressure.",
  "Momentum focused workflows that encourage action over perfection.",
  "Public leaderboards and social systems for optional motivation.",
  "Low-pressure productivity systems designed for long term sustainability.",
  "Progress tracking that values recovery and consistency over streak obsession.",
  "Neurodivergent-friendly workflows designed around real-world behaviour.",
  "Clean and distraction-reduced interfaces that support focus.",
  "Systems designed to lower friction between intention and action.",
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
      {items.map((item, index) => (
        <div className="privacyLandingClause" key={item}>
          <span className="privacyLandingClauseKey">({String.fromCharCode(97 + index)})</span>
          <div>{item}</div>
        </div>
      ))}
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="landingV2 privacyLandingPage">
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>

          <div className="landingV2HeaderActions">
            <AboutBackButton />
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
              TaskLaunch is a flexible productivity app built for neurodivergent minds. Instead of demanding
              perfection, rigid routines, or relentless consistency, TaskLaunch helps you build sustainable momentum in
              a way that feels realistic, supportive, and human.
            </p>
            <p>
              It is not about becoming a productivity machine. It is about helping you function more consistently in a
              world that often expects perfection from people who are already exhausted trying to keep up.
            </p>
          </AboutSection>

          <AboutSection id="cycle" number={2} title="The cycle it breaks">
            <p>
              Most productivity apps are built around the idea that success comes from doing the same thing every
              single day without interruption. Miss a habit, fall behind on tasks, lose focus for a week, or struggle
              through burnout, and suddenly it feels like everything has collapsed.
            </p>
            <p>
              One difficult day turns into guilt. Guilt turns into avoidance. Avoidance turns into feeling overwhelmed,
              exhausted, and stuck. For people living with ADHD, autism, executive dysfunction, anxiety, burnout,
              fluctuating motivation, or unpredictable energy levels, that cycle can feel relentless.
            </p>
            <p>TaskLaunch was created to break that cycle.</p>
          </AboutSection>

          <AboutSection id="different-way" number={3} title="A different way forward">
            <p>
              Instead of punishing inconsistency, TaskLaunch is designed to help you recover quickly, regain control,
              and keep moving forward without shame or perfectionism. A difficult day should not erase your progress.
              Losing momentum should not make you feel like you have failed.
            </p>
            <p>
              Progress is still progress, even when it is messy, nonlinear, or slower than expected. TaskLaunch works
              with the way your brain naturally functions instead of forcing you into rigid systems that become
              impossible to maintain over time.
            </p>
            <p>
              Whether you are struggling to start tasks, constantly battling distraction, feeling crushed by traditional
              productivity systems, or trying to rebuild structure after burnout, TaskLaunch is designed to help you
              move forward one step at a time.
            </p>
          </AboutSection>

          <AboutSection id="helps-you" number={4} title="How TaskLaunch helps">
            <AboutList items={HELP_POINTS} />
          </AboutSection>

          <AboutSection id="features" number={5} title="Features">
            <p>TaskLaunch includes a growing range of tools and systems designed to support sustainable productivity.</p>
            <AboutList items={FEATURE_POINTS} />
          </AboutSection>

          <AboutSection id="philosophy" number={6} title="Philosophy">
            <p>
              Unlike traditional productivity apps that constantly remind you of what you missed, TaskLaunch is
              designed to encourage resilience, flexibility, and self-compassion. It recognizes that productivity is not
              a straight line.
            </p>
            <p>
              Some days you will feel focused and unstoppable. Other days even the smallest task can feel impossible.
              Both experiences are normal. The goal is not perfection. The goal is learning how to continue moving
              forward without letting difficult moments completely derail you.
            </p>
            <p>
              Because real progress is not built through endless pressure. It is built through recovery. Through
              persistence. Through learning how to begin again, over and over, without losing hope in yourself.
            </p>
          </AboutSection>
        </div>

        <footer className="landingV2Footer">
          <Link href="/" className="landingV2FooterBrand displayFont">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2FooterBrandIcon" />
            <span>TaskLaunch</span>
          </Link>
          <div className="landingV2FooterLinks">
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
