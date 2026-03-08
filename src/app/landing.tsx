"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LandingProps } from "./landing.types";

export default function Landing({
  showTitlePhase,
  showActions,
}: LandingProps) {
  const preHeroText = "YOUR DAILY PRODUCTIVITY ENGINE";
  const heroPrefix = "A smarter task tracker built for ";
  const heroSignalPrefix = "neuro";
  const heroSignalText = "divergent";
  const heroSignal = `${heroSignalPrefix}${heroSignalText}`;
  const heroSuffix = " minds.";
  const fullHeroText = `${heroPrefix}${heroSignal}${heroSuffix}`;
  const typeMsPerChar = Math.max(14, Math.round(1800 / fullHeroText.length));
  const [typedHero, setTypedHero] = useState("");
  const [flickerSignal, setFlickerSignal] = useState(false);
  const [showSubHeroText, setShowSubHeroText] = useState(false);
  const typingFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!showActions) return;

    const clearTypingFrame = () => {
      if (typingFrameRef.current != null) {
        window.clearTimeout(typingFrameRef.current);
        typingFrameRef.current = null;
      }
    };
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        clearTypingFrame();
        typingFrameRef.current = window.setTimeout(() => {
          typingFrameRef.current = null;
          resolve();
        }, ms);
      });
    const typeInto = async (text: string, setValue: (value: string) => void) => {
      const divergentStartIndex = heroPrefix.length + heroSignalPrefix.length + 1;
      let flickerStarted = false;
      let flickerEndsAt = 0;
      for (let idx = 1; idx <= text.length; idx += 1) {
        if (cancelled) return;
        setValue(text.slice(0, idx));
        if (!flickerStarted && idx >= divergentStartIndex) {
          flickerStarted = true;
          flickerEndsAt = performance.now() + 1350;
          setFlickerSignal(true);
        }
        await wait(typeMsPerChar);
      }
      if (!flickerStarted) return;
      const remainingMs = Math.max(0, flickerEndsAt - performance.now());
      if (remainingMs > 0) await wait(remainingMs);
    };
    const run = async () => {
      setTypedHero("");
      setFlickerSignal(false);
      setShowSubHeroText(false);
      await typeInto(fullHeroText, setTypedHero);
      if (cancelled) return;
      setFlickerSignal(false);
      setShowSubHeroText(true);
    };
    void run();
    return () => {
      cancelled = true;
      clearTypingFrame();
    };
  }, [fullHeroText, showActions]);

  const isTypingHero = showActions && typedHero.length < fullHeroText.length;
  const typedPrefix = typedHero.slice(0, heroPrefix.length);
  const typedSignalStart = Math.min(Math.max(typedHero.length - heroPrefix.length, 0), heroSignal.length);
  const typedSignal = heroSignal.slice(0, typedSignalStart);
  const typedNeuro = typedSignal.slice(0, Math.min(typedSignal.length, heroSignalPrefix.length));
  const typedDivergent = typedSignal.length > heroSignalPrefix.length ? typedSignal.slice(heroSignalPrefix.length) : "";
  const typedSuffix =
    typedHero.length > heroPrefix.length + heroSignal.length
      ? heroSuffix.slice(0, typedHero.length - heroPrefix.length - heroSignal.length)
      : "";

  return (
    <main className="landingV2 relative min-h-screen overflow-hidden bg-[#05010b] text-white">
      <div className="landingV2Glow landingV2GlowTop" aria-hidden="true" />
      <div className="landingV2Glow landingV2GlowBottom" aria-hidden="true" />

      <div className="landingV2Container relative mx-auto flex min-h-screen w-full max-w-[1625px] flex-col px-6 pb-20 pt-8 sm:px-8 md:px-12">
        <header className="landingV2Header flex items-center justify-between">
          <Link href="/" className="landingV2Brand" aria-label="TaskLaunch home">
            <img
              src="/logo/tasklaunch.svg"
              alt="TaskLaunch"
              className="block w-[225px] sm:w-[255px] h-auto"
            />
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            <Link href="/" className="landingV2NavLink isActive displayFont">
              Home
            </Link>
            <Link href="/privacy" className="landingV2NavLink displayFont">
              Privacy
            </Link>
            <Link href="/tasktimer/user-guide" className="landingV2NavLink displayFont">
              Features
            </Link>
          </nav>

          <Link href="/web-sign-in" className="landingV2Signup displayFont">
            Sign Up/In
          </Link>
        </header>

        <section className="landingV2Hero grid grid-cols-1 gap-12 pt-12 lg:grid-cols-[1.02fr_1fr] lg:items-start">
          <div className={`space-y-8 transition-all duration-700 ${showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
            <p className="displayFont text-[12px] tracking-[0.22em] text-[#e7ccf5]">
              <span className="mr-2 text-[24px] leading-none text-[#d447d2]">{">"}</span>
              <span>{preHeroText}</span>
            </p>
            <h1 className="landingV2Title displayFont text-[#f5f4fc]">
              <span>{typedPrefix}</span>
              {typedNeuro ? <span className="landingV2SignalGradient">{typedNeuro}</span> : null}
              {typedDivergent ? (
                <span
                  className={`landingV2SignalText landingV2SignalGradient${flickerSignal ? " isFlickering" : ""}`}
                  data-text={typedDivergent}
                >
                  {typedDivergent}
                </span>
              ) : null}
              <span>{typedSuffix}</span>
              {isTypingHero ? (
                <span
                  className="ml-1 inline-block h-[0.9em] w-[3px] animate-pulse align-[-0.08em] bg-[#f2a4ef] [animation-duration:500ms]"
                  aria-hidden="true"
                />
              ) : null}
            </h1>

            <p
              className={`landingV2Lead displayFont text-[#f1f2ff] transition-all duration-500 ${
                showSubHeroText ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
              aria-hidden={showSubHeroText ? "false" : "true"}
            >
              Break the procrastination barrier and turn momentum into quantifiable, rewarding progress that keeps your
              focus locked in.
            </p>

            <div
              className={`flex flex-wrap items-center gap-7 transition-all duration-700 ${
                showActions && showSubHeroText ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
              aria-hidden={showSubHeroText ? "false" : "true"}
            >
              <Link href="/web-sign-in" className="landingV2PrimaryBtn displayFont">
                Get the App
              </Link>
              <Link href="/blueberry" className="landingV2TextBtn displayFont">
                Boysenberry
              </Link>
            </div>
          </div>
          {showSubHeroText ? (
            <div
              className={`landingV2HeroMedia transition-all duration-700 ${
                showSubHeroText ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <div className="landingV2HeroImageFrame">
                <div className="landingV2HeroImageGlow" aria-hidden="true" />
                <Image
                  src="/dashboard.PNG"
                  alt="TaskLaunch dashboard preview"
                  width={1407}
                  height={938}
                  priority
                  className="landingV2HeroImage"
                />
              </div>
            </div>
          ) : null}
        </section>

      </div>
    </main>
  );
}
