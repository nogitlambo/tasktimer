"use client";

import Link from "next/link";
import AppImg from "../components/AppImg";
import { useEffect, useState } from "react";
import type { LandingProps } from "./landing.types";

const getStartedHref = "/login";

type FeatureIconName = "flow" | "automation" | "insight";

const featureCards: Array<{
  code: string;
  icon: FeatureIconName;
  title: string;
  description: string;
}> = [
  {
    code: "brain-dump",
    icon: "flow",
    title: "Brain Dump - Get it out of your head",
    description:
      "Drop in everything that's competing for your attention. Type it, say it, or add an image. TaskLaunch turns the mess into structured, actionable tasks.",
  },
  {
    code: "clarify",
    icon: "insight",
    title: "Clarify - Make the unclear actionable",
    description:
      "Vague or overwhelming tasks become easier to approach. TaskLaunch helps define what \"done\" looks like, break down bigger tasks, and uncover a clear first step.",
  },
  {
    code: "prioritise",
    icon: "insight",
    title: "Prioritise - Know what to do next",
    description:
      "Instead of staring at a list and deciding where to start, TaskLaunch weighs what matters, what fits, and what needs attention to surface your best next action.",
  },
  {
    code: "plan",
    icon: "automation",
    title: "Plan - Build a day that actually fits",
    description:
      "TaskLaunch considers your available time, focus patterns, priorities, deadlines, and realistic capacity to help shape a plan you can actually follow.",
  },
  {
    code: "adapt",
    icon: "flow",
    title: "Adapt - When the day changes, the plan changes with it",
    description:
      "Things take longer. Energy shifts. Life interrupts. TaskLaunch recognises when your plan no longer fits and helps you safely adjust without starting over.",
  },
  {
    code: "recover",
    icon: "automation",
    title: "Recover - Get back into motion",
    description:
      "Missed a few days? Backlog piling up? TaskLaunch separates what needs attention from what can wait and gives you one achievable place to restart.",
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

export default function Landing(props: LandingProps) {
  void props;

  const [revealStage, setRevealStage] = useState(0);

  useEffect(() => {
    const applyLandingRouteBodyState = () => {
      document.body.classList.remove("webSignInRoute");
      document.body.classList.add("landingRoute");
    };

    applyLandingRouteBodyState();
    window.addEventListener("pageshow", applyLandingRouteBodyState);

    return () => {
      window.removeEventListener("pageshow", applyLandingRouteBodyState);
      document.body.classList.remove("landingRoute");
    };
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 300));
      timers.push(window.setTimeout(() => setRevealStage(3), 600));
      timers.push(window.setTimeout(() => setRevealStage(4), 900));
      timers.push(window.setTimeout(() => setRevealStage(5), 1200));
      timers.push(window.setTimeout(() => setRevealStage(6), 1500));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const showHero = revealStage >= 1;
  const showHeroActions = revealStage >= 2;
  const showHeader = revealStage >= 3;
  const showLowerSections = revealStage >= 6;

  return (
    <main className="landingV2 landingV2LandingPage">
      <div className="landingV2Shell">
        <header
          className={`landingV2Header landingV2HeaderFooter ${showHeader ? "isVisible" : ""}`}
        >
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo-main.png" alt="" className="landingHeaderLogo" />
          </Link>

          <div className="landingV2FooterLinks">
            <Link href="/login">Sign In</Link>
          </div>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch landing hero">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">
              Your <span className="landingV2HeroTitleGradient">Executive Function,</span> Outsourced.
            </h1>

            <p className="landingV2HeroCopy">
              Bridge the gap between knowing what needs to be done and getting started. Simplify the overwhelming,
              find your next best action, build realistic plans, and adapt when life gets in the way.
            </p>

            <div className={`landingV2Actions ${showHeroActions ? "isVisible" : ""}`}>
              <Link
                href={getStartedHref}
                className="btn btn-accent primitiveSciFiModalAction primitiveSciFiModalPrimaryAction landingV2PrimaryBtn displayFont"
              >
                GET STARTED
              </Link>
              <Link
                href="https://play.google.com/store/apps/details?id=com.tasklaunch.app&hl=en-US&ah=n93boNLLkVvMLSey6j9qG9SPGek"
                className="landingV2SecondaryBtn displayFont"
              >
                <AppImg className="landingV2SecondaryBtnIcon" src="/logo/googleplay.webp" alt="" aria-hidden="true" />
                Get it on Google Play
              </Link>
            </div>
          </div>
        </section>

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
                </div>
                <h2 className="landingV2FeatureTitle displayFont">{feature.title}</h2>
                <p className="landingV2FeatureDescription">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="landingV2Footer">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo-main.png" alt="" className="landingFooterLogo" />
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
