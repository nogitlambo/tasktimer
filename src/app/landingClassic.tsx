"use client";

import Link from "next/link";
import Image from "next/image";
import type { LandingClassicProps } from "./landing.types";

export default function LandingClassic({
  showLogo,
  showTitlePhase,
  showActions,
  landingDialProgress,
  landingHandAngle,
  landingAnimRun,
  authUserEmail,
  showEmailLoginForm,
  isEmailLinkFlow,
  isValidAuthEmail,
  authEmail,
  authStatus,
  authError,
  authBusy,
  onToggleEmailLoginForm,
  onGoogleSignIn,
  onSendEmailLink,
  onCompleteEmailLink,
  onAuthEmailChange,
}: LandingClassicProps) {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0f13] px-6 text-white"
      style={{ fontFamily: "var(--font-orbitron), 'Segoe UI Variable', 'Segoe UI', Arial, sans-serif" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 40%, rgba(53,232,255,.14), transparent 70%), radial-gradient(38% 32% at 50% 65%, rgba(0,140,255,.10), transparent 72%), #0d0f13",
        }}
      />

      <div className="relative flex w-full max-w-[2130px] flex-col items-center justify-center text-center">
        <div
          className={`transition-all duration-1000 ease-out ${
            showLogo ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          } ${showTitlePhase ? "-translate-y-6 sm:-translate-y-8" : ""}`}
        >
          <div className="relative inline-block">
            <Image
              src="/logo/tasklaunch-logo-v2.png"
              alt="TaskLaunch"
              width={1868}
              height={422}
              priority
              className="h-auto w-[260px] sm:w-[340px] md:w-[410px]"
              style={{ clipPath: `inset(0 ${(1 - landingDialProgress) * 100}% 0 28%)` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 aspect-square w-[14.6%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
              style={{ left: "12.2%" }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible">
                <defs>
                  <filter id="landingClassicDialGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur1" />
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur2" />
                    <feMerge>
                      <feMergeNode in="blur2" />
                      <feMergeNode in="blur1" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle
                  key={`landing-classic-progress-${landingAnimRun}`}
                  cx="100"
                  cy="100"
                  r="89"
                  pathLength="100"
                  fill="none"
                  stroke="#00E5FF"
                  strokeWidth="12"
                  strokeLinecap="round"
                  filter="url(#landingClassicDialGlow)"
                  style={{
                    strokeDasharray: 100,
                    strokeDashoffset: 100 - landingDialProgress * 100,
                    transform: "rotate(-90deg)",
                    transformOrigin: "100px 100px",
                    opacity: 0.95,
                  }}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div
                  className="absolute left-1/2 top-1/2 h-[9px] w-[27%] -translate-y-1/2 rounded-[1px] bg-[#00E5FF]"
                  style={{
                    boxShadow: "0 0 10px rgba(0,229,255,.55), 0 0 18px rgba(0,229,255,.22)",
                    transformOrigin: "0 50%",
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-[9px] w-[27%] -translate-y-1/2 rounded-[1px] bg-[#00E5FF]"
                  style={{
                    boxShadow: "0 0 10px rgba(0,229,255,.6), 0 0 20px rgba(0,229,255,.24)",
                    transformOrigin: "0 50%",
                    transform: `translateY(-50%) rotate(${landingHandAngle - 90}deg)`,
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#00E5FF]"
                  style={{ boxShadow: "0 0 10px rgba(0,229,255,.6), 0 0 20px rgba(0,229,255,.22)" }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className={`mt-6 flex flex-col items-center gap-5 transition-all duration-500 ${
            showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
          aria-hidden={!showTitlePhase}
        >
          <h1 className="displayFont max-w-[11ch] text-center text-[clamp(2.8rem,7vw,5.8rem)] font-black uppercase leading-[0.92] tracking-[-0.04em] text-[#f5f4fc]">
            Your daily productivity engine.
          </h1>
        </div>

        <div
          className={`mt-12 flex w-full flex-col items-center gap-3 transition-all duration-500 sm:flex-row ${
            showActions ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
          aria-hidden={!showActions}
        >
          {!authUserEmail ? (
            <div className="mx-auto flex w-[240px] max-w-full flex-col items-stretch gap-3 sm:w-[320px] md:w-[380px]">
              <button
                type="button"
                onClick={onToggleEmailLoginForm}
                aria-expanded={showEmailLoginForm ? "true" : "false"}
                disabled={authBusy}
                className="displayFont flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/15 bg-black/35 px-6 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/35 disabled:cursor-not-allowed disabled:opacity-55"
                style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zm0 2v.4l8 5.1 8-5.1V8H4zm16 8V10.76l-7.46 4.75a1 1 0 0 1-1.08 0L4 10.76V16h16z"
                  />
                </svg>
                <span>Login with email</span>
              </button>
              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={authBusy}
                className="displayFont flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/15 bg-black/35 px-6 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/35 disabled:cursor-not-allowed disabled:opacity-55"
                style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12.24 10.29v3.93h5.47c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.42-.19-2.09h-9.57z"
                  />
                  <path
                    fill="#4285F4"
                    d="M12 22c2.75 0 5.06-.91 6.74-2.47l-3.3-2.56c-.91.61-2.08.98-3.44.98-2.65 0-4.89-1.79-5.69-4.19H2.9v2.63A10 10 0 0 0 12 22z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.31 13.76A5.99 5.99 0 0 1 6 12c0-.61.11-1.2.31-1.76V7.61H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13.9 4.39l3.41-2.63z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 6.05c1.49 0 2.82.51 3.87 1.51l2.9-2.9C17.05 3.05 14.74 2 12 2A10 10 0 0 0 2.9 7.61l3.41 2.63c.8-2.4 3.04-4.19 5.69-4.19z"
                  />
                </svg>
                <span>Login with Google</span>
              </button>
              {showEmailLoginForm ? (
                <>
                  <label htmlFor="landingEmailInput" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="landingEmailInput"
                    type="email"
                    autoComplete="email"
                    placeholder="name@example.com"
                    value={authEmail}
                    onChange={(e) => onAuthEmailChange(e.target.value)}
                    className="h-11 w-full border border-white/15 bg-black/20 px-4 text-sm text-white outline-none"
                    style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
                  />
                </>
              ) : null}
              {authStatus ? <div className="text-left text-xs text-[#d3faff]">{authStatus}</div> : null}
              {authError ? <div className="text-left text-xs text-[#ff9b9b]">{authError}</div> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                {showEmailLoginForm ? (
                  <button
                    type="button"
                    onClick={onSendEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="displayFont min-w-[190px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] shadow-[0_0_10px_rgba(0,220,255,.14)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] hover:shadow-[0_0_16px_rgba(0,220,255,.3)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
                  >
                    Send Link
                  </button>
                ) : null}
                {isEmailLinkFlow ? (
                  <button
                    type="button"
                    onClick={onCompleteEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="displayFont min-w-[190px] border border-[#35e8ff]/50 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
                  >
                    Complete Sign-In
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 place-items-center gap-3 pt-1 text-xs text-white/70">
                <Link href="/privacy" className="text-center underline underline-offset-2 hover:text-white">
                  Privacy Policy
                </Link>
                <Link href="/?landing=v2" className="text-center underline underline-offset-2 hover:text-white">
                  Try New Landing Page
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 place-items-center gap-2 text-xs text-white/70">
              <Link href="/privacy" className="underline underline-offset-2 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/?landing=v2" className="underline underline-offset-2 hover:text-white">
                Try New Landing Page
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
