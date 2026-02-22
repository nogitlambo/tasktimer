"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LOGO_PHASE_MS = 1200;
const DIAL_PHASE_MS = 3000;

export default function Home() {
  const router = useRouter();
  const [showLogo, setShowLogo] = useState(false);
  const [showTitlePhase, setShowTitlePhase] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setShowLogo(true));
    const titleTimer = window.setTimeout(() => setShowTitlePhase(true), LOGO_PHASE_MS);
    const routeTimer = window.setTimeout(() => {
      router.replace("/tasktimer");
    }, LOGO_PHASE_MS + DIAL_PHASE_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(titleTimer);
      window.clearTimeout(routeTimer);
    };
  }, [router]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0f13] px-6 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 40%, rgba(53,232,255,.14), transparent 70%), radial-gradient(38% 32% at 50% 65%, rgba(0,140,255,.10), transparent 72%), #0d0f13",
        }}
      />

      <div className="relative flex w-full max-w-2xl flex-col items-center justify-center text-center">
        <div
          className={`transition-all duration-1000 ease-out ${
            showLogo ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          } ${showTitlePhase ? "-translate-y-6 sm:-translate-y-8" : ""}`}
        >
          <Image
            src="/tasktimer-logo.png"
            alt="TaskTimer"
            width={420}
            height={94}
            priority
            className="h-auto w-[240px] sm:w-[320px] md:w-[380px]"
          />
        </div>

        <div
          className={`mt-6 flex flex-col items-center gap-5 transition-all duration-500 ${
            showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
          aria-hidden={!showTitlePhase}
        >
          <h1 className="max-w-[26ch] text-center text-[15px] font-extrabold uppercase tracking-[0.16em] text-white sm:text-[18px]">
            TIME TRACKING BUILT FOR DEEP FOCUS
          </h1>

          <div className="relative h-20 w-20 sm:h-24 sm:w-24">
            <div className="absolute inset-0 rounded-full border border-[#35e8ff]/20" />
            <div className="absolute inset-[9px] rounded-full border border-[#35e8ff]/35" />
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[#35e8ff] border-r-[#00cfc8]" />
            <div className="absolute inset-[14px] animate-spin rounded-full border border-transparent border-l-[#2ea7ff]/80 [animation-direction:reverse] [animation-duration:1.2s]" />
            <div className="absolute inset-[26px] rounded-full bg-[#0d0f13] shadow-[0_0_18px_rgba(53,232,255,.18)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
