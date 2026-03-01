"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "./tasktimer/lib/cloudStore";
import {
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signOut,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";

const LOGO_PHASE_MS = 1200;
const DIAL_PHASE_MS = 3000;
const EMAIL_LINK_STORAGE_KEY = "tasktimer:authEmailLinkPendingEmail";
const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";

function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function shouldUseRedirectAuth() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() || window.location.protocol === "file:";
  } catch {
    return window.location.protocol === "file:";
  }
}

function maskApiKey(value: string | undefined) {
  if (!value) return null;
  if (value.length <= 8) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function logGoogleAuthDebug(stage: string, auth: ReturnType<typeof getFirebaseAuthClient>) {
  if (typeof window === "undefined") return;
  const opts = auth?.app?.options;
  const mode = shouldUseRedirectAuth() ? "redirect/native" : "popup/web";
  console.info("[auth-debug] google", {
    stage,
    mode,
    href: window.location.href,
    origin: window.location.origin,
    protocol: window.location.protocol,
    isNativePlatform: Capacitor.isNativePlatform(),
    authDomain: opts?.authDomain ?? null,
    projectId: opts?.projectId ?? null,
    appId: opts?.appId ?? null,
    apiKey: maskApiKey(opts?.apiKey),
  });
}

function logFirebaseAuthError(stage: string, err: unknown) {
  if (!err || typeof err !== "object") {
    console.error("[auth-debug] error", { stage, err });
    return;
  }
  const e = err as {
    code?: string;
    message?: string;
    customData?: { email?: string; _tokenResponse?: unknown; [key: string]: unknown };
  };
  console.error("[auth-debug] error", {
    stage,
    code: e.code ?? null,
    message: e.message ?? null,
    customData: e.customData ?? null,
  });
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
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);
  const [bypassAutoRedirect, setBypassAutoRedirect] = useState(false);

  const isValidAuthEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim());
  const landingDialProgress = Math.max(0, Math.min(1, (100 - landingRingOffset) / 100));

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
    if (typeof window === "undefined") return;
    let shouldBypass = false;
    try {
      const params = new URLSearchParams(window.location.search || "");
      shouldBypass = params.get("signedOut") === "1";
    } catch {
      shouldBypass = false;
    }
    if (!shouldBypass) {
      try {
        shouldBypass = sessionStorage.getItem(SIGN_OUT_LANDING_BYPASS_KEY) === "1";
      } catch {
        shouldBypass = false;
      }
    }
    if (shouldBypass) {
      setBypassAutoRedirect(true);
      setAuthUserEmail(null);
      const auth = getFirebaseAuthClient();
      if (auth) {
        void signOut(auth).catch(() => {
          // ignore; onAuthStateChanged still drives the final UI state
        });
      }
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email || null;
      setAuthUserEmail(email);
      if (user?.uid) void ensureUserProfileIndex(user.uid);
      if (!email && bypassAutoRedirect) {
        setBypassAutoRedirect(false);
        try {
          sessionStorage.removeItem(SIGN_OUT_LANDING_BYPASS_KEY);
        } catch {
          // ignore
        }
        try {
          const params = new URLSearchParams(window.location.search || "");
          if (params.get("signedOut") === "1") {
            params.delete("signedOut");
            const qs = params.toString();
            const cleanUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
            window.history.replaceState({}, "", cleanUrl);
          }
        } catch {
          // ignore
        }
      }
      if (email && !hasRedirected && !bypassAutoRedirect) {
        setHasRedirected(true);
        router.replace("/tasktimer?page=dashboard");
      }
    });
    return () => unsub();
  }, [router, hasRedirected, bypassAutoRedirect]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const auth = getFirebaseAuthClient();
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

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const applyRedirectResult = async () => {
      try {
        logGoogleAuthDebug("beforeGetRedirectResult", auth);
        const result = await getRedirectResult(auth);
        console.info("[auth-debug] google", {
          stage: "afterGetRedirectResult",
          hasResult: Boolean(result),
          hasUser: Boolean(result?.user),
          providerId: result?.providerId ?? null,
        });
        if (cancelled || !result?.user) return;
        setAuthStatus("Signed in successfully.");
        setAuthError("");
      } catch (err: unknown) {
        if (cancelled) return;
        logFirebaseAuthError("getRedirectResult", err);
        setAuthError(getErrorMessage(err, "Could not complete Google sign-in."));
        setAuthStatus("");
      }
    };
    void applyRedirectResult();
    return () => {
      cancelled = true;
    };
  }, []);

  const getEmailLinkContinueUrl = () => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (/^https?:/i.test(origin)) return `${origin}/`;
    }
    return "https://tasktimer-prod.firebaseapp.com/";
  };

  const handleSendEmailLink = async () => {
    const auth = getFirebaseAuthClient();
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
    const auth = getFirebaseAuthClient();
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

  const handleGoogleSignIn = async () => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    logGoogleAuthDebug("beforeGoogleSignIn", auth);
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Signing in with Google...");
    try {
      if (shouldUseRedirectAuth()) {
        const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
        const nativeResult = await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
        });
        const idToken = nativeResult.credential?.idToken;
        const accessToken = nativeResult.credential?.accessToken;
        if (!idToken && !accessToken) {
          throw new Error("Google sign-in did not return an auth token.");
        }
        const nativeCredential = GoogleAuthProvider.credential(idToken ?? undefined, accessToken ?? undefined);
        await signInWithCredential(auth, nativeCredential);
        console.info("[auth-debug] google", {
          stage: "afterSignInWithCredential",
          provider: "google.com",
          tokenSource: "native-capacitor",
        });
        setAuthStatus("Signed in successfully.");
        return;
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      console.info("[auth-debug] google", {
        stage: "afterSignInWithPopup",
        provider: "google.com",
      });
      setAuthStatus("Signed in successfully.");
    } catch (err: unknown) {
      logFirebaseAuthError("handleGoogleSignIn", err);
      setAuthError(getErrorMessage(err, "Could not sign in with Google."));
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

      <div className="relative flex w-full max-w-[2130px] flex-col items-center justify-center text-center">
        <div
          className={`transition-all duration-1000 ease-out ${
            showLogo ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          } ${showTitlePhase ? "-translate-y-6 sm:-translate-y-8" : ""}`}
        >
          <div className="relative inline-block">
            <img
              src="/timebase-logo.svg"
              alt="Timebase"
              width={420}
              height={94}
              className="h-auto w-[240px] sm:w-[320px] md:w-[380px]"
              style={{ clipPath: `inset(0 ${(1 - landingDialProgress) * 100}% 0 28%)` }}
            />
            <div
              className="pointer-events-none absolute top-1/2 aspect-square w-[14.6%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
              style={{ left: "12.2%" }}
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
          className={`mt-12 flex w-full flex-col items-center gap-3 transition-all duration-500 sm:flex-row ${
            showActions ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
          aria-hidden={!showActions}
        >
          {!authUserEmail ? (
            <div className="mx-auto flex w-[240px] max-w-full flex-col items-stretch gap-3 sm:w-[320px] md:w-[380px]">
              <button
                type="button"
                onClick={() => setShowEmailLoginForm((v) => !v)}
                aria-expanded={showEmailLoginForm ? "true" : "false"}
                disabled={authBusy}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/15 bg-black/35 px-6 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/35 disabled:cursor-not-allowed disabled:opacity-55"
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
                onClick={handleGoogleSignIn}
                disabled={authBusy}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 border border-white/15 bg-black/35 px-6 py-2 text-base font-bold text-white transition hover:border-[#35e8ff]/35 disabled:cursor-not-allowed disabled:opacity-55"
                style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" aria-hidden="true">
                  <path fill="#EA4335" d="M12.24 10.29v3.93h5.47c-.24 1.26-.96 2.33-2.04 3.05l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.72-.06-1.42-.19-2.09h-9.57z"/>
                  <path fill="#4285F4" d="M12 22c2.75 0 5.06-.91 6.74-2.47l-3.3-2.56c-.91.61-2.08.98-3.44.98-2.65 0-4.89-1.79-5.69-4.19H2.9v2.63A10 10 0 0 0 12 22z"/>
                  <path fill="#FBBC05" d="M6.31 13.76A5.99 5.99 0 0 1 6 12c0-.61.11-1.2.31-1.76V7.61H2.9A10 10 0 0 0 2 12c0 1.61.39 3.13.9 4.39l3.41-2.63z"/>
                  <path fill="#34A853" d="M12 6.05c1.49 0 2.82.51 3.87 1.51l2.9-2.9C17.05 3.05 14.74 2 12 2A10 10 0 0 0 2.9 7.61l3.41 2.63c.8-2.4 3.04-4.19 5.69-4.19z"/>
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
                  onChange={(e) => {
                    setAuthEmail(e.target.value);
                    setAuthError("");
                  }}
                  className="h-11 w-full border border-white/15 bg-black/20 px-4 text-sm text-white outline-none"
                  style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
                />
              ) : null}
              {authStatus ? <div className="text-left text-xs text-[#d3faff]">{authStatus}</div> : null}
              {authError ? <div className="text-left text-xs text-[#ff9b9b]">{authError}</div> : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                {showEmailLoginForm ? (
                  <button
                    type="button"
                    onClick={handleSendEmailLink}
                    disabled={authBusy || !isValidAuthEmail}
                    className="min-w-[190px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] shadow-[0_0_10px_rgba(0,220,255,.14)] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c] hover:shadow-[0_0_16px_rgba(0,220,255,.3)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
                  >
                    Send Link
                  </button>
                ) : null}
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
              <div className="grid grid-cols-1 place-items-center gap-3 pt-1 text-xs text-white/70">
                <a href="/privacy" className="text-center underline underline-offset-2 hover:text-white">
                  Privacy Policy
                </a>
              </div>
            </div>
          ) : (
            <>
              <a href="/privacy" className="text-xs text-white/70 underline underline-offset-2 hover:text-white">
                Privacy Policy
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
