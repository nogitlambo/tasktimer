"use client";

import { Capacitor } from "@capacitor/core";
import {
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "../tasktimer/lib/cloudStore";
import WebSignIn from "../webSign-in";

const EMAIL_LINK_STORAGE_KEY = "tasktimer:authEmailLinkPendingEmail";
const LOGO_PHASE_MS = 1200;
const DIAL_PHASE_MS = 3000;

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

export default function WebSignInPage() {
  const router = useRouter();
  const [showLogo, setShowLogo] = useState(false);
  const [landingHandAngle, setLandingHandAngle] = useState(0);
  const [landingRingOffset, setLandingRingOffset] = useState(100);
  const [landingAnimRun] = useState(0);
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isEmailLinkFlow, setIsEmailLinkFlow] = useState(false);
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  const isValidAuthEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim());
  const landingDialProgress = Math.max(0, Math.min(1, (100 - landingRingOffset) / 100));

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setShowLogo(true));
    return () => window.cancelAnimationFrame(raf);
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

    const delay = window.setTimeout(() => {
      rafId = window.requestAnimationFrame(tick);
    }, LOGO_PHASE_MS);

    return () => {
      window.clearTimeout(delay);
      window.cancelAnimationFrame(rafId);
    };
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
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email || null;
      setAuthUserEmail(email);
      if (user?.uid) void ensureUserProfileIndex(user.uid);
      if (email && !hasRedirected) {
        setHasRedirected(true);
        router.replace("/tasktimer?page=dashboard");
      }
    });
    return () => unsub();
  }, [router, hasRedirected]);

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
        const result = await getRedirectResult(auth);
        if (cancelled || !result?.user) return;
        setAuthStatus("Signed in successfully.");
        setAuthError("");
      } catch (err: unknown) {
        if (cancelled) return;
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
      if (/^https?:/i.test(origin)) return `${origin}/web-sign-in`;
    }
    return "https://tasktimer-prod.firebaseapp.com/web-sign-in";
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
        setAuthStatus("Signed in successfully.");
        return;
      }
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setAuthStatus("Signed in successfully.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not sign in with Google."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <WebSignIn
      showLogo={showLogo}
      landingDialProgress={landingDialProgress}
      landingHandAngle={landingHandAngle}
      landingAnimRun={landingAnimRun}
      authUserEmail={authUserEmail}
      showEmailLoginForm={showEmailLoginForm}
      isEmailLinkFlow={isEmailLinkFlow}
      isValidAuthEmail={isValidAuthEmail}
      authEmail={authEmail}
      authStatus={authStatus}
      authError={authError}
      authBusy={authBusy}
      onToggleEmailLoginForm={() => setShowEmailLoginForm((v) => !v)}
      onGoogleSignIn={handleGoogleSignIn}
      onSendEmailLink={handleSendEmailLink}
      onCompleteEmailLink={handleCompleteEmailLink}
      onAuthEmailChange={(value) => {
        setAuthEmail(value);
        setAuthError("");
      }}
    />
  );
}
