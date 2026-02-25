"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebaseClient";
import { isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";

const LOGO_PHASE_MS = 1200;
const DIAL_PHASE_MS = 3000;
const EMAIL_LINK_STORAGE_KEY = "tasktimer:authEmailLinkPendingEmail";

function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export default function Home() {
  const router = useRouter();
  const [showLogo, setShowLogo] = useState(false);
  const [showTitlePhase, setShowTitlePhase] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [landingHandAngle, setLandingHandAngle] = useState(0);
  const [landingRingOffset, setLandingRingOffset] = useState(100);
  const [landingAnimRun] = useState(0);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isEmailLinkFlow, setIsEmailLinkFlow] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  const isValidAuthEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim());

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
      setLandingRingOffset(100 - progress * 100);
      if (progress < 1) rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [showLogo, landingAnimRun]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || "";
      if (saved) setAuthEmail(saved);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const auth = firebaseAuth;
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email || null;
      setAuthUserEmail(email);
      if (email && !hasRedirected) {
        setHasRedirected(true);
        router.replace("/tasktimer?page=dashboard");
      }
    });
    return () => unsub();
  }, [router, hasRedirected]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = firebaseAuth;
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      return;
    }
    const href = window.location.href;
    const emailLink = isSignInWithEmailLink(auth, href);
    setIsEmailLinkFlow(emailLink);
    if (!emailLink) return;

    const complete = async () => {
      let email = "";
      try {
        email = (localStorage.getItem(EMAIL_LINK_STORAGE_KEY) || "").trim();
      } catch {
        email = "";
      }
      if (!email) {
        setAuthStatus("Email sign-in link detected. Enter your email below, then click Complete Sign-In.");
        return;
      }
      setAuthBusy(true);
      setAuthError("");
      setAuthStatus("Completing sign-in...");
      try {
        await signInWithEmailLink(auth, email, href);
        try {
          localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
        } catch {
          // ignore
        }
        setAuthEmail(email);
        setAuthStatus("Signed in successfully.");
        try {
          const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
          window.history.replaceState({}, "", cleanUrl);
        } catch {
          // ignore
        }
        setIsEmailLinkFlow(false);
      } catch (err: unknown) {
        setAuthError(getErrorMessage(err, "Could not complete email sign-in."));
        setAuthStatus("");
      } finally {
        setAuthBusy(false);
      }
    };
    void complete();
  }, []);

  const getEmailLinkContinueUrl = () => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (/^https?:/i.test(origin)) return `${origin}/`;
    }
    return "https://tasktimer-prod.firebaseapp.com/";
  };

  const handleSendEmailLink = async () => {
    const auth = firebaseAuth;
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Enter a valid email address.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Sending sign-in link...");
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: getEmailLinkContinueUrl(),
        handleCodeInApp: true,
      });
      try {
        localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
      } catch {
        // ignore
      }
      setAuthStatus("Sign-in link sent. Open the link from your email on this device.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not send sign-in link."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCompleteEmailLink = async () => {
    if (typeof window === "undefined") return;
    const auth = firebaseAuth;
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    const href = window.location.href;
    if (!isSignInWithEmailLink(auth, href)) {
      setAuthError("No email sign-in link detected in this page URL.");
      setAuthStatus("");
      return;
    }
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Enter the same email address used to request the sign-in link.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Completing sign-in...");
    try {
      await signInWithEmailLink(auth, email, href);
      try {
        localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
      } catch {
        // ignore
      }
      setAuthStatus("Signed in successfully.");
      setIsEmailLinkFlow(false);
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not complete email sign-in."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

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
              style={{ clipPath: "inset(0 0 0 21.8%)" }}
            />
            <div
              className="pointer-events-none absolute top-1/2 aspect-square w-[21.2%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
              style={{ left: "11.5%" }}
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
                    strokeDashoffset: landingRingOffset,
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
          <h1 className="max-w-[26ch] text-center text-[15px] font-extrabold uppercase tracking-[0.16em] text-white sm:text-[18px]">
            Build better habits with smarter time tracking.
          </h1>
        </div>

        <div
          className={`mt-6 flex flex-col items-center gap-3 transition-all duration-500 sm:flex-row ${
            showActions ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
          aria-hidden={!showActions}
        >
          {!authUserEmail ? (
            <div className="flex w-full max-w-[420px] flex-col items-stretch gap-3 rounded-none border border-[#35e8ff]/20 bg-[rgba(255,255,255,.02)] p-3 sm:p-4">
              <label
                htmlFor="landingEmailInput"
                className="text-left text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#b7f7ff]"
              >
                Continue with Email
              </label>
              <input
                id="landingEmailInput"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={authEmail}
                onChange={(e) => {
                  setAuthEmail(e.target.value);
                  setAuthError("");
                }}
                className="h-10 w-full border border-white/15 bg-black/20 px-3 text-sm text-white outline-none"
                style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
              />
              {authStatus ? <div className="text-left text-xs text-[#d3faff]">{authStatus}</div> : null}
              {authError ? <div className="text-left text-xs text-[#ff9b9b]">{authError}</div> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSendEmailLink}
                  disabled={authBusy || !isValidAuthEmail}
                  className="min-w-[190px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] shadow-[0_0_10px_rgba(0,220,255,.14)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] hover:shadow-[0_0_16px_rgba(0,220,255,.3)] disabled:cursor-not-allowed disabled:opacity-45"
                  style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
                >
                  Send Link
                </button>
                {isEmailLinkFlow ? (
                  <button
                    type="button"
                    onClick={handleCompleteEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="min-w-[190px] border border-[#35e8ff]/50 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
                  >
                    Complete Sign-In
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <>
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
                className="min-w-[190px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] shadow-[0_0_10px_rgba(0,220,255,.14)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] hover:shadow-[0_0_16px_rgba(0,220,255,.3)]"
                style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
              >
                Go to Tasks
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
