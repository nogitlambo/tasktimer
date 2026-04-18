"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LandingExperimentalProps } from "./landing.types";

const demoHref = "https://drive.google.com/file/d/1RkhUWchVwIlBA62hHnitlnJ4HnWqu-0b/view?usp=drive_link";

type FeatureIconName = "flow" | "automation" | "insight";

const featureCards: Array<{
  code: string;
  icon: FeatureIconName;
  title: string;
  description: string;
}> = [
  {
    code: "F-001",
    icon: "flow",
    title: "Adaptive task flow",
    description:
      "Shape each day around how you naturally work with flexible task timing, cleaner prioritization, and less friction between intent and action.",
  },
  {
    code: "F-002",
    icon: "automation",
    title: "Intelligent automation",
    description:
      "Let recurring decisions happen in the background so the app supports momentum instead of pulling attention away from the work itself.",
  },
  {
    code: "F-003",
    icon: "insight",
    title: "Insight-led refinement",
    description:
      "Use AI-guided patterns, history, and progress context to spot what is helping, what is draining focus, and what should change next.",
  },
];

function FeatureIcon({ icon, title }: { icon: FeatureIconName; title: string }) {
  if (icon === "flow") {
    return (
      <svg viewBox="0 0 56 56" role="img" aria-label={`${title} icon`} className="landingV2FeatureIconSvg">
        <rect x="7" y="14" width="14" height="14" rx="3" />
        <rect x="35" y="14" width="14" height="14" rx="3" />
        <rect x="21" y="32" width="14" height="14" rx="3" />
        <path d="M21 21h14M28 21v11" />
      </svg>
    );
  }

  if (icon === "automation") {
    return (
      <svg viewBox="0 0 56 56" role="img" aria-label={`${title} icon`} className="landingV2FeatureIconSvg">
        <circle cx="28" cy="28" r="8" />
        <path d="M28 10v8M28 38v8M10 28h8M38 28h8M16 16l6 6M34 34l6 6M40 16l-6 6M16 40l6-6" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 56 56" role="img" aria-label={`${title} icon`} className="landingV2FeatureIconSvg">
      <path d="M9 41l12-12 8 8 18-18" />
      <path d="M47 26V14H35" />
      <circle cx="21" cy="29" r="3" />
      <circle cx="29" cy="37" r="3" />
    </svg>
  );
}

const principles = [
  {
    code: "P-01",
    title: "Support natural focus",
    description:
      "TaskLaunch is built to work with your energy, timing, and existing habits instead of forcing a rigid productivity routine.",
  },
  {
    code: "P-02",
    title: "Reduce maintenance work",
    description:
      "The system should remove repetitive admin so more of your attention stays on deciding, doing, and finishing meaningful tasks.",
  },
  {
    code: "P-03",
    title: "Keep progress legible",
    description:
      "Clear history, momentum, and task context make it easier to trust the system and easier to keep going when your day shifts.",
  },
  {
    code: "P-04",
    title: "Guide without overriding",
    description:
      "Automation and AI should clarify decisions and refine workflows, not fight the user for control of how work gets done.",
  },
];

export default function Landing({ showTitlePhase, showActions }: LandingExperimentalProps) {
  const [revealStage, setRevealStage] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 240));
      timers.push(window.setTimeout(() => setRevealStage(3), 520));
      timers.push(window.setTimeout(() => setRevealStage(4), 860));
      timers.push(window.setTimeout(() => setRevealStage(5), 1220));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const showHero = showTitlePhase && revealStage >= 2;
  const showHeader = revealStage >= 1;
  const showSupporting = revealStage >= 3;
  const showLowerSections = revealStage >= 4;
  const showFinalCta = showActions && revealStage >= 5;

  return (
    <main className="landingV2">
      <div className="landingV2Shell">
        <header className={`landingV2Header ${showHeader ? "isVisible" : ""}`}>
          <Link href="/" className="landingV2Brand" aria-label="TaskLaunch home">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={1868}
              height={422}
              priority
              className="landingV2BrandLogo"
            />
          </Link>

          <nav className="landingV2Nav" aria-label="Landing navigation">
            <a href="#features">Features</a>
            <a href="#preview">Interface</a>
            <a href="#principles">Principles</a>
          </nav>

          <div className="landingV2HeaderActions">
            <Link href="/privacy" className="landingV2HeaderLink">
              Privacy
            </Link>
            <Link href="/?landing=classic" className="landingV2HeaderLink">
              Coming Soon
            </Link>
            <Link href="/web-sign-in" className="landingV2LoginLink">
              Login
            </Link>
          </div>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch landing hero">
          <div className="landingV2Grid" aria-hidden="true" />
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>Focus-aware planning and task tracking</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">Task tracking made easy</h1>

            <p className="landingV2HeroCopy">
              Move from scattered task capture to a calmer daily workflow with smarter defaults, better timing, and
              less manual upkeep.
            </p>

            <div className={`landingV2Actions ${showActions ? "isVisible" : ""}`}>
              <Link href="/web-sign-in" className="landingV2PrimaryBtn displayFont">
                Get Started
              </Link>
              <Link href={demoHref} className="landingV2SecondaryBtn displayFont">
                Watch Demo
              </Link>
            </div>
          </div>
        </section>

        <div className={`landingV2Ticker ${showSupporting ? "isVisible" : ""}`} aria-hidden={!showSupporting}>
          <div className="landingV2TickerTrack">
            {[
              "Focus-aware planning",
              "Adaptive timing",
              "Smarter automation",
              "AI-driven insights",
              "Cleaner task flow",
              "Progress without friction",
              "Support your natural rhythm",
              "Focus-aware planning",
              "Adaptive timing",
              "Smarter automation",
              "AI-driven insights",
              "Cleaner task flow",
              "Progress without friction",
              "Support your natural rhythm",
            ].map((item, index) => (
              <span key={`${item}-${index}`} className="landingV2TickerItem displayFont">
                {item}
              </span>
            ))}
          </div>
        </div>

        <section className={`landingV2Section ${showLowerSections ? "isVisible" : ""}`} id="features">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">01</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Core capabilities</span>
          </div>

          <div className="landingV2FeatureGrid">
            {featureCards.map((feature) => (
              <article key={feature.code} className="landingV2FeatureCard">
                <div className="landingV2FeatureCardHeader">
                  <span className="landingV2FeatureIcon" aria-hidden="true">
                    <FeatureIcon icon={feature.icon} title={feature.title} />
                  </span>
                  <div className="landingV2FeatureCode displayFont">{feature.code}</div>
                </div>
                <h2 className="landingV2FeatureTitle displayFont">{feature.title}</h2>
                <p className="landingV2FeatureDescription">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`landingV2Section ${showLowerSections ? "isVisible" : ""}`} id="preview">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">02</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Interface preview</span>
          </div>

          <div className="landingV2PreviewFrame">
            <div className="landingV2PreviewTopbar">
              <div className="landingV2PreviewDots">
                <span />
                <span />
                <span />
              </div>
              <div className="landingV2PreviewUrl">tasklaunch.app / today</div>
              <div className="landingV2PreviewStatus">focus mode active</div>
            </div>

            <div className="landingV2PreviewBody">
              <aside className="landingV2PreviewSidebar">
                <div className="landingV2PreviewSidebarLabel displayFont">Views</div>
                <div className="landingV2PreviewSidebarItem isActive">Today</div>
                <div className="landingV2PreviewSidebarItem">Upcoming</div>
                <div className="landingV2PreviewSidebarItem">Momentum</div>
                <div className="landingV2PreviewSidebarLabel displayFont">Focus modes</div>
                <div className="landingV2PreviewSidebarItem">Mode 1</div>
                <div className="landingV2PreviewSidebarItem">Mode 2</div>
                <div className="landingV2PreviewSidebarItem">Mode 3</div>
              </aside>

              <div className="landingV2PreviewMain">
                <div className="landingV2PreviewMainHeader">
                  <div>
                    <h2 className="landingV2PreviewTitle displayFont">Today&apos;s flow</h2>
                    <p className="landingV2PreviewSubtitle">A cleaner queue shaped around timing, energy, and momentum.</p>
                  </div>
                  <span className="landingV2PreviewBadge displayFont">Adaptive plan</span>
                </div>

                <div className="landingV2PreviewGroup">
                  <div className="landingV2PreviewGroupLabel displayFont">In focus</div>
                  <div className="landingV2PreviewTask isDone">
                    <span className="landingV2PreviewCheck">OK</span>
                    <span>Morning planning reset</span>
                    <span className="landingV2PreviewTaskTag">Completed</span>
                  </div>
                  <div className="landingV2PreviewTask">
                    <span className="landingV2PreviewCheck" />
                    <span>Draft sprint summary</span>
                    <span className="landingV2PreviewTaskTag isAccent">Priority</span>
                  </div>
                </div>

                <div className="landingV2PreviewGroup">
                  <div className="landingV2PreviewGroupLabel displayFont">Queued next</div>
                  <div className="landingV2PreviewTask">
                    <span className="landingV2PreviewCheck" />
                    <span>Review time patterns</span>
                    <span className="landingV2PreviewTaskTag">Insights</span>
                  </div>
                  <div className="landingV2PreviewTask">
                    <span className="landingV2PreviewCheck" />
                    <span>Refine afternoon block</span>
                    <span className="landingV2PreviewTaskTag">Schedule</span>
                  </div>
                  <div className="landingV2PreviewTask">
                    <span className="landingV2PreviewCheck" />
                    <span>Prepare low-energy tasks</span>
                    <span className="landingV2PreviewTaskTag">Automation</span>
                  </div>
                </div>
              </div>

              <aside className="landingV2PreviewPanel">
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">Momentum</span>
                  <strong className="landingV2PanelValue displayFont">Steady</strong>
                  <p>Consistent progress with low drag between finished work and the next useful task.</p>
                </div>
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">AI guidance</span>
                  <strong className="landingV2PanelValue displayFont">Refine timing</strong>
                  <p>Shift admin-heavy tasks later and protect your highest-focus window for deeper work.</p>
                </div>
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">Automation</span>
                  <strong className="landingV2PanelValue displayFont">Prepared</strong>
                  <p>Repeatable structure is ready before the next session starts, so re-entry stays easy.</p>
                </div>
              </aside>
            </div>
          </div>

          <h2 className="landingV2TickerHeading displayFont">
            <em>Make progress easier to start, easier to sustain, and easier to trust</em>
          </h2>
        </section>

        <section className={`landingV2Section ${showLowerSections ? "isVisible" : ""}`} id="principles">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">03</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Design principles</span>
          </div>

          <div className="landingV2PrinciplesGrid">
            {principles.map((principle) => (
              <article key={principle.code} className="landingV2PrincipleCard">
                <div className="landingV2PrincipleCode displayFont">{principle.code}</div>
                <h2 className="landingV2PrincipleTitle displayFont">{principle.title}</h2>
                <p className="landingV2PrincipleDescription">{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`landingV2Cta ${showFinalCta ? "isVisible" : ""}`} id="cta">
          <div className="landingV2CtaActions">
            <p>
              Move from scattered task capture to a calmer daily workflow with smarter defaults, better timing, and less manual upkeep.
            </p>
            <div className="landingV2Actions isVisible">
              <Link href="/web-sign-in" className="landingV2PrimaryBtn displayFont">
                Get Started
              </Link>
              <Link href={demoHref} className="landingV2SecondaryBtn displayFont">
                Watch Demo
              </Link>
            </div>
          </div>
        </section>

        <footer className="landingV2Footer">
          <Link href="/" className="landingV2FooterBrand displayFont">
            TaskLaunch
          </Link>
          <div className="landingV2FooterLinks">
            <Link href="/privacy">Privacy</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/web-sign-in">Sign In</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
