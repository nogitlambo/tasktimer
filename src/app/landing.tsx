"use client";

import Link from "next/link";
import AppImg from "../components/AppImg";
import { useEffect, useRef, useState } from "react";
import type { LandingProps } from "./landing.types";

const demoHref = "https://drive.google.com/file/d/1RkhUWchVwIlBA62hHnitlnJ4HnWqu-0b/view?usp=drive_link";
const getStartedHref = "/login";
const rocketVideoFadeOutMs = 1200;
const rocketVideoFadeInMs = 2000;

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
    title: "Adaptive Task Flow",
    description:
      "TaskLaunch aligns with how you naturally operate, turning your energy, timing, and habits into a system where starting and progressing feels effortless instead of forced.",
  },
  {
    code: "F-002",
    icon: "automation",
    title: "Intelligent Automation",
    description:
      "Routine decisions and admin fade into the background, creating a frictionless environment where momentum builds and your attention stays on meaningful work.",
  },
  {
    code: "F-003",
    icon: "insight",
    title: "Insight-led Refinement",
    description:
      "AI continuously interprets your patterns and progress to surface what's working, eliminate drag, and guide smarter next moves without disrupting your flow.",
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
  const [isRocketVideoResetting, setIsRocketVideoResetting] = useState(false);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const hasTriggeredRocketVideoRef = useRef(false);
  const isRocketVideoResettingRef = useRef(false);
  const rocketFadeOutTimerRef = useRef<number | null>(null);
  const rocketFadeInTimerRef = useRef<number | null>(null);

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

  const playRocketVideo = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;

    if (hasTriggeredRocketVideoRef.current) return;
    if (isRocketVideoResettingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    hasTriggeredRocketVideoRef.current = true;
    video.currentTime = 0;
    void video.play().catch(() => {
      hasTriggeredRocketVideoRef.current = false;
    });
  };

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video) return;

    const resetVideo = () => {
      video.pause();
      video.currentTime = 0;
      hasTriggeredRocketVideoRef.current = false;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      resetVideo();
    }

    return () => {
      if (rocketFadeOutTimerRef.current !== null) {
        window.clearTimeout(rocketFadeOutTimerRef.current);
      }

      if (rocketFadeInTimerRef.current !== null) {
        window.clearTimeout(rocketFadeInTimerRef.current);
      }
    };
  }, []);

  const startRocketVideoReset = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;
    if (isRocketVideoResettingRef.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      video.currentTime = 0;
      hasTriggeredRocketVideoRef.current = false;
      isRocketVideoResettingRef.current = false;
      setIsRocketVideoResetting(false);
      return;
    }

    isRocketVideoResettingRef.current = true;
    setIsRocketVideoResetting(true);

    if (rocketFadeOutTimerRef.current !== null) {
      window.clearTimeout(rocketFadeOutTimerRef.current);
    }

    if (rocketFadeInTimerRef.current !== null) {
      window.clearTimeout(rocketFadeInTimerRef.current);
    }

    rocketFadeOutTimerRef.current = window.setTimeout(() => {
      video.pause();
      video.currentTime = 0;
      setIsRocketVideoResetting(false);

      rocketFadeInTimerRef.current = window.setTimeout(() => {
        hasTriggeredRocketVideoRef.current = false;
        isRocketVideoResettingRef.current = false;
      }, rocketVideoFadeInMs);
    }, rocketVideoFadeOutMs);
  };

  const handleRocketVideoTimeUpdate = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;
    if (isRocketVideoResettingRef.current) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime > rocketVideoFadeOutMs / 1000) return;
    startRocketVideoReset();
  };

  const resetRocketVideoAfterPlayback = () => {
    startRocketVideoReset();
  };

  const showHero = revealStage >= 1;
  const showHeroActions = revealStage >= 2;
  const showHeader = revealStage >= 3;
  const showBackgroundImage = revealStage >= 1;
  const showSupporting = revealStage >= 5;
  const showLowerSections = revealStage >= 6;
  const showFinalCta = revealStage >= 6;

  return (
    <main
      className={`landingV2 landingV2LandingPage ${showBackgroundImage ? "isHeroVisible" : ""}${
        isRocketVideoResetting ? " isRocketVideoResetting" : ""
      }`}
    >
      <video
        ref={backgroundVideoRef}
        className="landingV2BackgroundVideo"
        src="/rocket_breaking_chains4_opticalflow_60fps_50pct.mp4"
        muted
        preload="auto"
        playsInline
        aria-hidden="true"
        onTimeUpdate={handleRocketVideoTimeUpdate}
        onEnded={resetRocketVideoAfterPlayback}
      />
      <button
        type="button"
        className="landingV2RocketHotspot"
        aria-label="Play rocket animation"
        onMouseEnter={playRocketVideo}
        onFocus={playRocketVideo}
      />
      <div className="landingV2Shell">
        <header
          className={`landingV2Header landingV2HeaderFooter ${showHeader ? "isVisible" : ""}`}
        >
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo.webp" alt="" className="landingHeaderLogo" />
          </Link>

          <div className="landingV2FooterLinks">
            <Link href="/landingsoon">Landing Soon</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/login">Sign In</Link>
          </div>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch landing hero">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">
              <span className="landingV2HeroTitleGradient">Break free</span> from guilt-driven productivity systems
            </h1>

            <p className="landingV2HeroCopy">
              Designed for the neurodivergent, TaskLaunch uses non-traditional productivity methods to build
              sustainable discipline over time, supporting inconsistency instead of punishing it, helping you rebuild
              momentum quickly, and make progress without perfectionism.
            </p>

            <div className={`landingV2Actions ${showHeroActions ? "isVisible" : ""}`}>
              <Link href={getStartedHref} className="landingV2PrimaryBtn displayFont">
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
          <div className={`landingV2Actions landingV2ActionsCentered ${showFinalCta ? "isVisible" : ""}`}>
            <Link href={getStartedHref} className="landingV2PrimaryBtn displayFont">
              Get Started
            </Link>
            <Link href={demoHref} className="landingV2SecondaryBtn displayFont">
              Watch Demo
            </Link>
          </div>
        </section>

        <footer className="landingV2Footer">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo.webp" alt="" className="landingFooterLogo" />
          </Link>
          <div className="landingV2FooterLinks">
            <Link href="/landingsoon">Landing Soon</Link>
            <Link href="/about">About</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
