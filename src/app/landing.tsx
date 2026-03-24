"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LandingExperimentalProps } from "./landing.types";

type LandingIntroSequenceProps = {
  showActions: boolean;
  preHeroText: string;
  fullHeroText: string;
  supportLineOne: string;
  supportLineTwo: string;
  typeMsPerChar: number;
};

function LandingIntroSequence({
  showActions,
  preHeroText,
  fullHeroText,
  supportLineOne,
  supportLineTwo,
  typeMsPerChar,
}: LandingIntroSequenceProps) {
  const [entered, setEntered] = useState(false);
  const [typedHero, setTypedHero] = useState("");
  const [showPreHeroText, setShowPreHeroText] = useState(false);
  const [showSubHeroText, setShowSubHeroText] = useState(false);
  const typingFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    let cancelled = false;

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
      for (let idx = 1; idx <= text.length; idx += 1) {
        if (cancelled) return;
        setValue(text.slice(0, idx));
        await wait(typeMsPerChar);
      }
    };

    const run = async () => {
      await typeInto(fullHeroText, setTypedHero);
      if (cancelled) return;
      setShowPreHeroText(true);
      await wait(160);
      if (cancelled) return;
      setShowSubHeroText(true);
    };

    void run();
    return () => {
      cancelled = true;
      clearTypingFrame();
    };
  }, [fullHeroText, typeMsPerChar]);

  const isPreHeroVisible = showPreHeroText;
  const isSubHeroVisible = showSubHeroText;
  const isActionsVisible = showActions && isSubHeroVisible;
  const isTypingHero = typedHero.length < fullHeroText.length;

  return (
    <>
      <div className={`space-y-8 transition-all duration-700 ${entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
        {preHeroText ? (
          <p
            className={`landingV2PreHero displayFont text-[12px] tracking-[0.22em] text-[#e7ccf5]${
              isPreHeroVisible ? " isVisible" : ""
            }`}
            aria-hidden={!isPreHeroVisible}
          >
            <span className="mr-2 text-[24px] leading-none text-[#d447d2]">{">"}</span>
            <span>{preHeroText}</span>
          </p>
        ) : null}
        <h1 className="landingV2Title displayFont font-black uppercase tracking-[0.08em] text-[#f5f4fc]">
          <span>{typedHero}</span>
          {isTypingHero ? (
            <span
              className="ml-1 inline-block h-[0.9em] w-[3px] animate-pulse align-[-0.08em] bg-[#f2a4ef] [animation-duration:500ms]"
              aria-hidden="true"
            />
          ) : null}
        </h1>

        <p
          className={`landingV2Lead displayFont text-[#f1f2ff] transition-all duration-500 ${
            isSubHeroVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
          aria-hidden={!isSubHeroVisible}
        >
          {supportLineOne}
        </p>

        <p
          className={`landingV2Lead displayFont text-[#f1f2ff] transition-all duration-500 ${
            isSubHeroVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
          aria-hidden={!isSubHeroVisible}
        >
          {supportLineTwo}
        </p>

        <div
          className={`flex flex-wrap items-center gap-7 transition-all duration-700 ${
            isActionsVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
          aria-hidden={!isActionsVisible}
          inert={!isActionsVisible}
        >
          <Link href="/web-sign-in" className="landingV2PrimaryBtn displayFont rounded-none">
            Launch My First Task
          </Link>
          <Link
            href="https://drive.google.com/file/d/1RkhUWchVwIlBA62hHnitlnJ4HnWqu-0b/view?usp=drive_link"
            className="landingV2TextBtn displayFont"
          >
            Watch Demo
          </Link>
        </div>
      </div>
    </>
  );
}

export default function Landing({
  showTitlePhase,
  showActions,
}: LandingExperimentalProps) {
  const preHeroText = "";
  const fullHeroText = "TURN INTENTION INTO ACTION.";
  const supportLineOne =
    "Break through the procrastination loop and generate momentum instantly from your very first action.";
  const supportLineTwo = "Powered by a smarter system built for neurodivergent minds.";
  const typeMsPerChar = Math.max(14, Math.round(1000 / fullHeroText.length));

  return (
    <main
      className="landingV2 displayFont relative min-h-screen overflow-hidden bg-[#05010b] text-white"
    >
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/landing_page_bg.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-top"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,1,11,0.68)_0%,rgba(5,1,11,0.52)_45%,rgba(5,1,11,0.76)_100%)]" />
      </div>

      <div className="landingV2Glow landingV2GlowTop" aria-hidden="true" />
      <div className="landingV2Glow landingV2GlowBottom" aria-hidden="true" />

      <div className="landingV2Container relative z-10 mx-auto flex min-h-screen w-full max-w-[1625px] flex-col px-6 pb-20 pt-8 sm:px-8 md:px-12">
        <header className="landingV2Header flex items-center justify-between">
          <Link href="/" className="landingV2Brand" aria-label="TaskLaunch home">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={1868}
              height={422}
              priority
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

        </header>

        <section className="landingV2Hero grid grid-cols-1 gap-12 pt-12 lg:grid-cols-[1.02fr_1fr] lg:items-start">
          {showTitlePhase ? (
            <LandingIntroSequence
              showActions={showActions}
              preHeroText={preHeroText}
              fullHeroText={fullHeroText}
              supportLineOne={supportLineOne}
              supportLineTwo={supportLineTwo}
              typeMsPerChar={typeMsPerChar}
            />
          ) : (
            <>
              <div className="space-y-8 transition-all duration-700 translate-y-2 opacity-0" aria-hidden="true" />
            </>
          )}
        </section>

      </div>
    </main>
  );
}
