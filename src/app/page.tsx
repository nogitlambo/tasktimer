"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getFirebaseAuthClient, firebaseAuthMode, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "./tasktimer/lib/cloudStore";
import LandingClassic from "./landingClassic";
import LandingExperimental from "./landing";
import type { LandingClassicProps, LandingExperimentalProps } from "./landing.types";
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
  return isNativeOrFileRuntime();
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
    authRuntime: firebaseAuthMode(),
    isNativePlatform: isNativeOrFileRuntime(),
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
  const ownProps = Object.fromEntries(
    Object.getOwnPropertyNames(err).map((key) => [key, (err as Record<string, unknown>)[key]])
  );
  console.error("[auth-debug] error", {
    stage,
    code: e.code ?? null,
    message: e.message ?? null,
    customData: e.customData ?? null,
    name: ownProps.name ?? null,
    stack: ownProps.stack ?? null,
    details: ownProps,
  });
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const isExperimentalLanding = searchParams.get("landing") !== "classic";

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
        router.replace("/tasktimer/dashboard");
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
    if (!shouldUseRedirectAuth()) return;
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
      provider.setCustomParameters({ prompt: "select_account" });
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

  const experimentalLandingProps: LandingExperimentalProps = {
    showTitlePhase,
    showActions,
  };

  const classicLandingProps: LandingClassicProps = {
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
    onToggleEmailLoginForm: () => setShowEmailLoginForm((v) => !v),
    onGoogleSignIn: handleGoogleSignIn,
    onSendEmailLink: handleSendEmailLink,
    onCompleteEmailLink: handleCompleteEmailLink,
    onAuthEmailChange: (value: string) => {
      setAuthEmail(value);
      setAuthError("");
    },
  };

  return isExperimentalLanding ? (
    <LandingExperimental
      {...experimentalLandingProps}
    />
  ) : (
    <LandingClassic
      {...classicLandingProps}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
