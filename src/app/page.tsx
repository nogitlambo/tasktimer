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
  const [showActions, setShowActions] = useState(false);
  const [landingHandAngle, setLandingHandAngle] = useState(0);
  const [landingAnimRun, setLandingAnimRun] = useState(0);
  const handLength = 59;
  const handRadians = (landingHandAngle * Math.PI) / 180;
  const handX2 = 100 + Math.sin(handRadians) * handLength;
  const handY2 = 100 - Math.cos(handRadians) * handLength;

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setShowLogo(true));
    const titleTimer = window.setTimeout(() => setShowTitlePhase(true), LOGO_PHASE_MS);
    const actionTimer = window.setTimeout(() => setShowActions(true), LOGO_PHASE_MS + DIAL_PHASE_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(titleTimer);
      window.clearTimeout(actionTimer);
    };
  }, []);

  useEffect(() => {
    if (!showLogo) return;
    let rafId = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const progress = Math.min(elapsed / DIAL_PHASE_MS, 1);
      setLandingHandAngle(progress * 360);
      if (progress < 1) rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [showLogo, landingAnimRun]);

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
          <div className="relative inline-block">
            <Image
              src="/tasktimer-logo.svg"
              alt="TaskTimer"
              width={420}
              height={94}
              priority
              className="h-auto w-[240px] sm:w-[320px] md:w-[380px]"
            />
            <div
              className="pointer-events-none absolute top-1/2 aspect-square w-[20.6%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
              style={{ left: "11.45%" }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible">
                <defs>
                  <filter id="landingDialGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur1" />
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur2" />
                    <feMerge>
                      <feMergeNode in="blur2" />
                      <feMergeNode in="blur1" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <rect x="-8" y="-8" width="216" height="216" fill="#0d0f13" />
                <circle
                  key={`landing-progress-${landingAnimRun}`}
                  cx="100"
                  cy="100"
                  r="89"
                  pathLength="100"
                  fill="none"
                  stroke="#00E5FF"
                  strokeWidth="12"
                  strokeLinecap="round"
                  filter="url(#landingDialGlow)"
                  style={{
                    strokeDasharray: 100,
                    strokeDashoffset: 100,
                    transform: "rotate(-90deg)",
                    transformOrigin: "100px 100px",
                    opacity: 0.95,
                    animation:
                      showLogo ? `ttLandingFill ${DIAL_PHASE_MS}ms linear forwards` : undefined,
                  }}
                />

                <circle cx="100" cy="100" r="73" fill="#0d0f13" />
                <g>
                  <line
                    x1="100"
                    y1="100"
                    x2={handX2}
                    y2={handY2}
                    stroke="#00E5FF"
                    strokeWidth="7"
                    strokeLinecap="round"
                    filter="url(#landingDialGlow)"
                  />
                  <circle cx="100" cy="100" r="6" fill="#00E5FF" filter="url(#landingDialGlow)" />
                </g>
              </svg>
            </div>
          </div>
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
        </div>

        <div
          className={`mt-6 flex flex-col items-center gap-3 transition-all duration-500 sm:flex-row ${
            showActions ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
          aria-hidden={!showActions}
        >
          <button
            type="button"
            onClick={() => router.push("/tasktimer?page=dashboard")}
            className="min-w-[190px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] shadow-[0_0_10px_rgba(0,220,255,.14)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] hover:shadow-[0_0_16px_rgba(0,220,255,.3)]"
            style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
          >
            Go to Dashboard
          </button>
          <button
            type="button"
            onClick={() => router.push("/tasktimer")}
            className="min-w-[190px] border border-white/20 bg-transparent px-5 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white/90 transition hover:bg-white/[0.08]"
            style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
          >
            Go to Tasks
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setLandingHandAngle(0);
            setLandingAnimRun((v) => v + 1);
          }}
          className="mt-4 border border-white/20 bg-transparent px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
        >
          Reload Animation
        </button>
      </div>
      <style jsx global>{`
        @keyframes ttLandingFill {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </main>
  );
}
