"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LandingExperimentalProps } from "./landing.types";

const demoHref = "https://drive.google.com/file/d/1RkhUWchVwIlBA62hHnitlnJ4HnWqu-0b/view?usp=drive_link";
const heroGradientWord = "smarter";

type LandingIntroSequenceProps = {
  revealStage: number;
  showActions: boolean;
  fullHeroText: string;
  supportLineOne: string;
  supportLineTwo: string;
};

function LandingIntroSequence({
  revealStage,
  showActions,
  fullHeroText,
  supportLineOne,
  supportLineTwo,
}: LandingIntroSequenceProps) {
  const isHeroVisible = revealStage >= 2;
  const isSubHeroVisible = revealStage >= 3;
  const isActionsVisible = showActions && revealStage >= 3;
  const gradientWordStart = fullHeroText.toLowerCase().indexOf(heroGradientWord);
  const gradientWordEnd = gradientWordStart + heroGradientWord.length;
  const beforeGradientWord = gradientWordStart >= 0 ? fullHeroText.slice(0, gradientWordStart) : fullHeroText;
  const visibleGradientWord = gradientWordStart >= 0 ? fullHeroText.slice(gradientWordStart, gradientWordEnd) : "";
  const afterGradientWord = gradientWordStart >= 0 ? fullHeroText.slice(gradientWordEnd) : "";

  return (
    <div className="landingV2Intro">
      <h1 className={`landingV2HeroTitle displayFont ${isHeroVisible ? "isVisible" : ""}`} aria-label={fullHeroText}>
        <span>{beforeGradientWord}</span>
        {visibleGradientWord ? <span className="landingV2HeroGradientWord">{visibleGradientWord}</span> : null}
        {afterGradientWord ? <span>{afterGradientWord}</span> : null}
      </h1>

      <div className={`landingV2HeroCopy ${isSubHeroVisible ? "isVisible" : ""}`} aria-hidden={!isSubHeroVisible}>
        <p>{supportLineOne}</p>
        {supportLineTwo ? <p>{supportLineTwo}</p> : null}
      </div>

      <div className={`landingV2Actions ${isActionsVisible ? "isVisible" : ""}`} aria-hidden={!isActionsVisible} inert={!isActionsVisible}>
        <Link href="/web-sign-in" className="landingV2PrimaryBtn displayFont">
          Get Started
        </Link>
        <Link href={demoHref} className="landingV2SecondaryBtn displayFont">
          Watch Demo
        </Link>
      </div>
    </div>
  );
}

export default function Landing({ showTitlePhase, showActions }: LandingExperimentalProps) {
  const [revealStage, setRevealStage] = useState(0);
  const fullHeroText = "A smarter way to stay productive";
  const supportLineOne =
    "Built to work around your natural focus patterns, with automation that keeps progress effortless, and clever insights to help refine your workflow over time.";
  const supportLineTwo = "";

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 360));
      timers.push(window.setTimeout(() => setRevealStage(3), 1080));
      timers.push(window.setTimeout(() => setRevealStage(4), 1740));
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return (
    <main className="landingV2 relative min-h-screen overflow-hidden text-white">
      <div className="landingV2Shell">
        <section className="landingV2Panel" aria-label="TaskLaunch landing hero">
          <header className="landingV2Header">
            <Link href="/" className={`landingV2Brand ${revealStage >= 1 ? "isVisible" : ""}`} aria-label="TaskLaunch home">
              <Image
                src="/logo/tasklaunch-logo-v2.png"
                alt="TaskLaunch"
                width={1868}
                height={422}
                priority
                className="landingV2BrandLogo"
              />
            </Link>

            <nav className={`landingV2Nav ${revealStage >= 4 ? "isVisible" : ""}`} aria-label="Landing navigation">
              <Link href="/privacy">Privacy</Link>
            </nav>

            <div className={`landingV2HeaderActions ${revealStage >= 4 ? "isVisible" : ""}`}>
              <Link href="/web-sign-in" className="landingV2LoginLink">
                Login
              </Link>
            </div>
          </header>

          <div className="landingV2Hero">
            {showTitlePhase ? (
              <LandingIntroSequence
                revealStage={revealStage}
                showActions={showActions}
                fullHeroText={fullHeroText}
                supportLineOne={supportLineOne}
                supportLineTwo={supportLineTwo}
              />
            ) : (
              <div className="landingV2Intro" aria-hidden="true" />
            )}
          </div>

        </section>
      </div>
    </main>
  );
}
