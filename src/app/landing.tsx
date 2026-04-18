"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LandingExperimentalProps } from "./landing.types";

const demoHref = "https://drive.google.com/file/d/1RkhUWchVwIlBA62hHnitlnJ4HnWqu-0b/view?usp=drive_link";

const launchNotes = [
  {
    code: "N-01",
    title: "Core runtime is in active development",
    description:
      "TaskLaunch is being refined before public release, with work focused on making the first-use experience stable, clear, and fast.",
  },
  {
    code: "N-02",
    title: "Local builds remain available",
    description:
      "The current landing and sign-in flow still stay available in localhost so development and testing can continue without disruption.",
  },
  {
    code: "N-03",
    title: "Public launch page is intentionally limited",
    description:
      "The live domain should set the right expectation: TaskLaunch is not open yet, but the product direction and preview material are already in place.",
  },
];

const releasePoints = [
  "Task timing and focus-oriented workflow tools",
  "History and progress context across sessions",
  "Smarter planning defaults and reduced admin overhead",
  "A cleaner production-ready public launch experience",
];

export default function Landing({ showTitlePhase, showActions }: LandingExperimentalProps) {
  const [revealStage, setRevealStage] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 220));
      timers.push(window.setTimeout(() => setRevealStage(3), 500));
      timers.push(window.setTimeout(() => setRevealStage(4), 860));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const showHeader = revealStage >= 1;
  const showHero = showTitlePhase && revealStage >= 2;
  const showDetails = revealStage >= 3;
  const showCta = showActions && revealStage >= 4;

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
            <a href="#status">Status</a>
            <a href="#preview">Preview</a>
            <a href="#release">Release</a>
          </nav>

          <div className="landingV2HeaderActions">
            <Link href="/privacy" className="landingV2HeaderLink">
              Privacy
            </Link>
            <Link href="/pricing" className="landingV2LoginLink">
              Pricing
            </Link>
          </div>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch pre-launch hero">
          <div className="landingV2Grid" aria-hidden="true" />
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>Pre-launch preview</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">TaskLaunch is not live yet.</h1>

            <p className="landingV2HeroCopy">
              The public site is currently a holding page while the app is being prepared for release. Local builds
              continue to use the current development landing and sign-in flow.
            </p>

            <div className={`landingV2Actions ${showActions ? "isVisible" : ""}`}>
              <Link href={demoHref} className="landingV2PrimaryBtn displayFont">
                Watch Demo
              </Link>
              <Link href="/privacy" className="landingV2SecondaryBtn displayFont">
                Privacy Policy
              </Link>
            </div>
          </div>
        </section>

        <div className={`landingV2Ticker ${showDetails ? "isVisible" : ""}`} aria-hidden={!showDetails}>
          <div className="landingV2TickerTrack">
            {[
              "Pre-launch preview",
              "Public release pending",
              "Local development remains active",
              "TaskLaunch runtime in progress",
              "Pre-launch preview",
              "Public release pending",
              "Local development remains active",
              "TaskLaunch runtime in progress",
            ].map((item, index) => (
              <span key={`${item}-${index}`} className="landingV2TickerItem displayFont">
                {item}
              </span>
            ))}
          </div>
        </div>

        <section className={`landingV2Section ${showDetails ? "isVisible" : ""}`} id="status">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">01</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">Current status</span>
          </div>

          <div className="landingV2FeatureGrid">
            {launchNotes.map((note) => (
              <article key={note.code} className="landingV2FeatureCard">
                <div className="landingV2FeatureCardHeader">
                  <div className="landingV2FeatureCode displayFont">{note.code}</div>
                </div>
                <h2 className="landingV2FeatureTitle displayFont">{note.title}</h2>
                <p className="landingV2FeatureDescription">{note.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`landingV2Section ${showDetails ? "isVisible" : ""}`} id="preview">
          <div className="landingV2SectionLabel">
            <span className="landingV2SectionIndex displayFont">02</span>
            <span className="landingV2SectionLine" />
            <span className="landingV2SectionName">What is being built</span>
          </div>

          <div className="landingV2PreviewFrame">
            <div className="landingV2PreviewTopbar">
              <div className="landingV2PreviewDots">
                <span />
                <span />
                <span />
              </div>
              <div className="landingV2PreviewUrl">tasklaunch.app / pre-launch</div>
              <div className="landingV2PreviewStatus">release pending</div>
            </div>

            <div className="landingV2PreviewBody">
              <div className="landingV2PreviewMain">
                <div className="landingV2PreviewMainHeader">
                  <div>
                    <h2 className="landingV2PreviewTitle displayFont">Release scope</h2>
                    <p className="landingV2PreviewSubtitle">
                      The goal is to launch with a cleaner first impression and a more stable day-to-day task workflow.
                    </p>
                  </div>
                  <span className="landingV2PreviewBadge displayFont">In progress</span>
                </div>

                <div className="landingV2PreviewGroup">
                  <div className="landingV2PreviewGroupLabel displayFont">Planned for launch</div>
                  {releasePoints.map((point) => (
                    <div key={point} className="landingV2PreviewTask">
                      <span className="landingV2PreviewCheck" />
                      <span>{point}</span>
                      <span className="landingV2PreviewTaskTag">Scope</span>
                    </div>
                  ))}
                </div>
              </div>

              <aside className="landingV2PreviewPanel">
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">Site mode</span>
                  <strong className="landingV2PanelValue displayFont">Holding page</strong>
                  <p>The public host now communicates that the product is still being prepared for release.</p>
                </div>
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">Local mode</span>
                  <strong className="landingV2PanelValue displayFont">Current landing</strong>
                  <p>Localhost continues to expose the current development landing and sign-in flow.</p>
                </div>
                <div className="landingV2PanelCard">
                  <span className="landingV2PanelLabel displayFont">Preview</span>
                  <strong className="landingV2PanelValue displayFont">Available</strong>
                  <p>The demo link remains available so the product direction can still be shown before launch.</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className={`landingV2Cta ${showCta ? "isVisible" : ""}`} id="release">
          <div className="landingV2CtaActions">
            <p>
              TaskLaunch is still in pre-launch. Until the product is ready, the live domain should communicate status
              clearly and avoid presenting the unfinished app as publicly available.
            </p>
            <div className="landingV2Actions isVisible">
              <Link href={demoHref} className="landingV2PrimaryBtn displayFont">
                Watch Demo
              </Link>
              <Link href="/pricing" className="landingV2SecondaryBtn displayFont">
                View Pricing
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
            <Link href={demoHref}>Demo</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
