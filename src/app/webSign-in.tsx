"use client";

import Image from "next/image";
import { Orbitron } from "next/font/google";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

type WebSignInProps = {
  showLogo: boolean;
  landingDialProgress: number;
  landingHandAngle: number;
  landingAnimRun: number;
  authUserEmail: string | null;
  showEmailLoginForm: boolean;
  isEmailLinkFlow: boolean;
  isValidAuthEmail: boolean;
  authEmail: string;
  authStatus: string;
  authError: string;
  authBusy: boolean;
  onToggleEmailLoginForm: () => void;
  onGoogleSignIn: () => void;
  onSendEmailLink: () => void;
  onCompleteEmailLink: () => void;
  onAuthEmailChange: (value: string) => void;
};

export default function WebSignIn(props: WebSignInProps) {
  const {
    authUserEmail,
    showLogo,
    landingDialProgress,
    landingHandAngle,
    landingAnimRun,
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
  } = props;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(56% 42% at 14% 8%, rgba(77,0,255,.26), transparent 72%), radial-gradient(40% 36% at 90% 14%, rgba(0,214,255,.2), transparent 72%), radial-gradient(44% 33% at 55% 90%, rgba(179,0,255,.16), transparent 76%), #05070c",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(191,138,255,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(64,225,255,.09) 1px, transparent 1px)",
          backgroundSize: "68px 68px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,.7), rgba(0,0,0,.1))",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1260px] flex-col items-center justify-center gap-8 px-5 py-10 sm:px-7 md:px-10">
        <div
          className={`transition-all duration-1000 ease-out ${
            showLogo ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <div className="relative inline-block">
            <Image
              src="/timebase-logo.svg"
              alt="Timebase"
              width={420}
              height={94}
              priority
              className="h-auto w-[260px] sm:w-[340px] md:w-[400px]"
              style={{ clipPath: `inset(0 ${(1 - landingDialProgress) * 100}% 0 28%)` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 aspect-square w-[14.6%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
              style={{ left: "12.2%" }}
              aria-hidden="true"
            >
              <svg viewBox="0 0 200 200" className="h-full w-full overflow-visible">
                <defs>
                  <filter id="webSignInDialGlow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="1.8" result="blur1" />
                    <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur2" />
                    <feMerge>
                      <feMergeNode in="blur2" />
                      <feMergeNode in="blur1" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle
                  key={`web-sign-in-progress-${landingAnimRun}`}
                  cx="100"
                  cy="100"
                  r="89"
                  pathLength="100"
                  fill="none"
                  stroke="#35E8FF"
                  strokeWidth="12"
                  strokeLinecap="round"
                  filter="url(#webSignInDialGlow)"
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
                  className="absolute left-1/2 top-1/2 h-[9px] w-[27%] -translate-y-1/2 rounded-[1px] bg-[#35E8FF]"
                  style={{
                    boxShadow: "0 0 10px rgba(53,232,255,.55), 0 0 20px rgba(53,232,255,.3)",
                    transformOrigin: "0 50%",
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-[9px] w-[27%] -translate-y-1/2 rounded-[1px] bg-[#35E8FF]"
                  style={{
                    boxShadow: "0 0 10px rgba(53,232,255,.65), 0 0 20px rgba(53,232,255,.34)",
                    transformOrigin: "0 50%",
                    transform: `translateY(-50%) rotate(${landingHandAngle - 90}deg)`,
                  }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#35E8FF]"
                  style={{ boxShadow: "0 0 10px rgba(53,232,255,.6), 0 0 20px rgba(53,232,255,.32)" }}
                />
              </div>
            </div>
          </div>
        </div>

        <section
          id="landingAuthPanel"
          className="relative w-full max-w-[520px] border border-[#35e8ff]/35 bg-[#07111a]/75 p-5 backdrop-blur-xl sm:p-7"
          style={{ clipPath: "polygon(18px 0, 100% 0, calc(100% - 18px) 100%, 0 100%)" }}
        >
          <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-[#35e8ff]/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-14 left-1/4 h-28 w-28 rounded-full bg-[#2e7bff]/20 blur-3xl" />

          <div className="relative">
            <h2 className={`text-lg uppercase tracking-[0.12em] text-white ${orbitron.className}`}>Start Tracking Today</h2>
            <p className="mt-2 text-sm text-white/72">
              Sign in to sync your tasks, keep your history, and pick up where you left off.
            </p>
          </div>

          {!authUserEmail ? (
            <div className="relative mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={onToggleEmailLoginForm}
                aria-expanded={showEmailLoginForm ? "true" : "false"}
                disabled={authBusy}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/20 bg-black/35 px-5 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/50 disabled:cursor-not-allowed disabled:opacity-55"
                style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
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
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/20 bg-black/35 px-5 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/50 disabled:cursor-not-allowed disabled:opacity-55"
                style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
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
                <input
                  id="landingEmailInput"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => onAuthEmailChange(e.target.value)}
                  className="h-11 w-full border border-white/16 bg-black/25 px-4 text-sm text-white outline-none placeholder:text-white/45"
                  style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
                />
              ) : null}

              <div className="flex flex-wrap gap-2 pt-1">
                {showEmailLoginForm ? (
                  <button
                    type="button"
                    onClick={onSendEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="min-w-[172px] border border-[#35e8ff]/75 bg-transparent px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#b5fbff] shadow-[0_0_12px_rgba(53,232,255,.18)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
                  >
                    Send Link
                  </button>
                ) : null}
                {isEmailLinkFlow ? (
                  <button
                    type="button"
                    onClick={onCompleteEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="min-w-[172px] border border-[#35e8ff]/55 bg-transparent px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-[#b5fbff] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
                  >
                    Complete Sign-In
                  </button>
                ) : null}
              </div>

              {authStatus ? <div className="text-xs text-[#d3faff]">{authStatus}</div> : null}
              {authError ? <div className="text-xs text-[#ff9b9b]">{authError}</div> : null}
            </div>
          ) : (
            <div className="mt-6 border border-white/14 bg-white/[.03] p-4 text-sm text-white/80">
              Signed in as <span className="font-semibold text-[#d8fbff]">{authUserEmail}</span>. Redirecting...
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
