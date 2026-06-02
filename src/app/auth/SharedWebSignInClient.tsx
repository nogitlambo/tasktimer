"use client";

import "../tasktimer/tasktimer.css";

import type { PluginListenerHandle } from "@capacitor/core";
import {
  GoogleAuthProvider,
  type Auth,
  getRedirectResult,
  isSignInWithEmailLink,
  onAuthStateChanged,
  signOut,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import { ensureUserProfileIndex } from "../tasktimer/lib/cloudStore";
import WebSignIn from "../webSign-in";
import { createGoogleSignInProvider, createNativeGoogleSignInOptions } from "../login/googleAuth";
import { runAuthSuccessRedirect } from "./authRedirect";
import { sendSignInLinkEmail } from "./emailLinkClient";

const EMAIL_LINK_STORAGE_KEY = "tasktimer:authEmailLinkPendingEmail";
const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";

type SharedWebSignInClientProps = {
  redirectOnSuccess?: string | null;
  showGuestLink?: boolean;
  shouldStartProCheckout?: boolean;
  telemetrySource?: string;
};

function getErrorMessage(err: unknown, fallback: string) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

function isMissingNativeFirebaseAuthPluginError(err: unknown) {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "").toLowerCase() : "";
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message || "").toLowerCase()
      : String(err || "").toLowerCase();
  return (
    code === "unimplemented" ||
    message.includes("firebaseauthentication plugin is not implemented on android") ||
    message.includes("firebaseauthentication plugin is not implemented") ||
    message.includes("plugin is not implemented")
  );
}

function isNativeFirebaseAuthPluginAvailable() {
  try {
    return Capacitor.isPluginAvailable("FirebaseAuthentication");
  } catch {
    return false;
  }
}

function shouldUseRedirectAuth() {
  return isNativeOrFileRuntime();
}

function buildNativeEmailLinkRedirect(auth: Auth, rawUrl: string) {
  if (typeof window === "undefined") return "";
  const sourceUrl = rawUrl.trim();
  if (!sourceUrl || !isSignInWithEmailLink(auth, sourceUrl)) return "";
  try {
    const openedUrl = new URL(sourceUrl);
    const targetUrl = new URL("/login/", window.location.href);
    targetUrl.search = openedUrl.search;
    targetUrl.hash = openedUrl.hash;
    return targetUrl.href;
  } catch {
    return "";
  }
}

async function resolveAuthUser(auth: Auth): Promise<User | null> {
  const authWithReady = auth as Auth & { authStateReady?: () => Promise<void> };
  if (typeof authWithReady.authStateReady === "function") {
    try {
      await authWithReady.authStateReady();
    } catch {
      // ignore and continue with current auth state
    }
  }
  let user = auth.currentUser;
  if (user) return user;
  user = await new Promise<User | null>((resolve) => {
    let settled = false;
    const finish = (nextUser: User | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      unsubscribe();
      resolve(nextUser);
    };
    const timeoutId = window.setTimeout(() => finish(auth.currentUser), 1500);
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => finish(nextUser || null));
  });
  return user;
}

export default function SharedWebSignInClient({
  redirectOnSuccess,
  showGuestLink = true,
  shouldStartProCheckout = false,
  telemetrySource = "web_sign_in",
}: SharedWebSignInClientProps) {
  const router = useRouter();
  const isNativeLaunchRuntime = isNativeOrFileRuntime();
  const [authEmail, setAuthEmail] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [isResolvingNativeLaunchAuth, setIsResolvingNativeLaunchAuth] = useState(() => isNativeLaunchRuntime);
  const [isEmailLinkFlow, setIsEmailLinkFlow] = useState(false);
  const [showEmailLoginForm, setShowEmailLoginForm] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [googlePopupPending, setGooglePopupPending] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [bypassAutoRedirect, setBypassAutoRedirect] = useState(false);
  const hasRedirectedRef = useRef(false);

  const isValidAuthEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim());

  const redirectAfterAuthSuccess = useCallback(() => {
    return runAuthSuccessRedirect({
      hasRedirected: hasRedirectedRef.current,
      shouldStartProCheckout,
      bypassAutoRedirect,
      redirectOnSuccess,
      markRedirected: () => {
        hasRedirectedRef.current = true;
        setHasRedirected(true);
      },
      replace: router.replace,
    });
  }, [bypassAutoRedirect, redirectOnSuccess, router, shouldStartProCheckout]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("webSignInRoute");
    if (isNativeLaunchRuntime) {
      document.body.classList.add("webSignInNativeRoute");
    }
    return () => {
      document.body.classList.remove("webSignInRoute");
      document.body.classList.remove("webSignInNativeRoute");
    };
  }, [isNativeLaunchRuntime]);

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
    if (!shouldBypass) return;
    setBypassAutoRedirect(true);
    const auth = getFirebaseAuthClient();
    if (auth) {
      void signOut(auth).catch(() => {
        // ignore; auth state listener will settle the final UI state
      });
    }
  }, []);

  useEffect(() => {
    if (!isNativeLaunchRuntime) {
      setIsResolvingNativeLaunchAuth(false);
      return;
    }
    if (bypassAutoRedirect) {
      setIsResolvingNativeLaunchAuth(false);
      return;
    }
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setIsResolvingNativeLaunchAuth(false);
      return;
    }
    let cancelled = false;
    const resolveLaunchAuth = async () => {
      const user = await resolveAuthUser(auth);
      if (cancelled) return;
      const email = user?.email || null;
      const uid = user?.uid || null;
      setAuthUserEmail(email);
      setAuthUserUid(uid);
      if (uid) void ensureUserProfileIndex(uid);
      setIsResolvingNativeLaunchAuth(false);
    };
    void resolveLaunchAuth();
    return () => {
      cancelled = true;
    };
  }, [bypassAutoRedirect, isNativeLaunchRuntime]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email || null;
      const uid = user?.uid || null;
      setAuthUserEmail(email);
      setAuthUserUid(uid);
      if (email) setGooglePopupPending(false);
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
      if (email) redirectAfterAuthSuccess();
    });
    return () => unsub();
  }, [bypassAutoRedirect, redirectAfterAuthSuccess]);

  useEffect(() => {
    if (!shouldStartProCheckout || checkoutBusy || hasRedirected) return;
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser;
    const uid = String(user?.uid || authUserUid || "").trim();
    if (!uid) return;

    let cancelled = false;
    const startCheckout = async () => {
      setCheckoutBusy(true);
      setAuthError("");
      setAuthStatus("Redirecting to secure checkout...");
      try {
        const idToken = await user?.getIdToken();
        if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
        const res = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
          body: JSON.stringify({
            uid,
          }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error || "Could not start checkout.");
        }
        if (cancelled) return;
        setHasRedirected(true);
        window.location.assign(data.url);
      } catch (err: unknown) {
        if (cancelled) return;
        void recordNonFatal(err, {
          flow: "billing_checkout",
          source_page: telemetrySource,
        });
        setAuthError(getErrorMessage(err, "Could not start checkout."));
        setAuthStatus("");
        setCheckoutBusy(false);
      }
    };
    void startCheckout();
    return () => {
      cancelled = true;
    };
  }, [authUserUid, checkoutBusy, hasRedirected, shouldStartProCheckout, telemetrySource]);

  useEffect(() => {
    if (typeof window === "undefined" || !isNativeOrFileRuntime()) return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let disposed = false;
    let appUrlOpenHandle: PluginListenerHandle | null = null;

    const openEmailLink = (rawUrl: string) => {
      const targetUrl = buildNativeEmailLinkRedirect(auth, rawUrl);
      if (!targetUrl || targetUrl === window.location.href) return;
      window.location.assign(targetUrl);
    };

    const setupNativeEmailLinkHandling = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const launchUrl = await App.getLaunchUrl().catch(() => undefined);
        if (!disposed) openEmailLink(launchUrl?.url || "");
        appUrlOpenHandle = await App.addListener("appUrlOpen", (event) => {
          openEmailLink(event.url || "");
        });
      } catch {
        // Ignore native deep-link setup failures; browser email-link handling still applies.
      }
    };

    void setupNativeEmailLinkHandling();
    return () => {
      disposed = true;
      if (appUrlOpenHandle) {
        void appUrlOpenHandle.remove();
      }
    };
  }, []);

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
        redirectAfterAuthSuccess();
      } catch (err: unknown) {
        void recordNonFatal(err, {
          flow: "auth_email_link_sign_in",
          source_page: telemetrySource,
        });
        setAuthError(getErrorMessage(err, "Could not complete email sign-in."));
        setAuthStatus("");
      } finally {
        setAuthBusy(false);
      }
    };
    void complete();
  }, [redirectAfterAuthSuccess, telemetrySource]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    if (!shouldUseRedirectAuth()) return;
    let cancelled = false;
    const applyRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (cancelled || !result?.user) return;
        setAuthStatus("Signed in successfully.");
        setAuthError("");
      } catch (err: unknown) {
        if (cancelled) return;
        void recordNonFatal(err, {
          flow: "auth_google_sign_in",
          source_page: telemetrySource,
        });
        setAuthError(getErrorMessage(err, "Could not complete Google sign-in."));
        setAuthStatus("");
      }
    };
    void applyRedirectResult();
    return () => {
      cancelled = true;
    };
  }, [telemetrySource]);

  useEffect(() => {
    if (!googlePopupPending) return;
    const onFocus = () => {
      const auth = getFirebaseAuthClient();
      if (auth?.currentUser) return;
      if (typeof window !== "undefined") window.location.reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [googlePopupPending]);

  const handleSendEmailLink = async () => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthError("Email sign-in is not configured for this environment.");
      setAuthStatus("");
      return;
    }
    const email = authEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthError("Please enter a valid email address.");
      setAuthStatus("");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Sending sign-in link...");
    try {
      await sendSignInLinkEmail(email);
      try {
        localStorage.setItem(EMAIL_LINK_STORAGE_KEY, email);
      } catch {
        // ignore
      }
      setAuthStatus("Sign-in link sent. Open the link from your email on this device.");
    } catch (err: unknown) {
      void recordNonFatal(err, {
        flow: "auth_email_link_send",
        source_page: telemetrySource,
      });
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
      redirectAfterAuthSuccess();
    } catch (err: unknown) {
      void recordNonFatal(err, {
        flow: "auth_email_link_sign_in",
        source_page: telemetrySource,
      });
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
        try {
          const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
          await FirebaseAuthentication.signOut().catch(() => {
            // Best-effort native session clearing; the sign-in attempt below still owns the final outcome.
          });
          const nativeResult = await FirebaseAuthentication.signInWithGoogle(createNativeGoogleSignInOptions());
          const idToken = nativeResult.credential?.idToken;
          const accessToken = nativeResult.credential?.accessToken;
          if (!idToken && !accessToken) {
            throw new Error("Google sign-in did not return an auth token.");
          }
          const nativeCredential = GoogleAuthProvider.credential(idToken ?? undefined, accessToken ?? undefined);
          await signInWithCredential(auth, nativeCredential);
          setAuthStatus("Signed in successfully.");
          return;
        } catch (nativeErr: unknown) {
          if (!isMissingNativeFirebaseAuthPluginError(nativeErr) || isNativeFirebaseAuthPluginAvailable()) {
            throw nativeErr;
          }
          throw new Error(
            "Google sign-in is unavailable in this Android build because the native FirebaseAuthentication plugin is not loading."
          );
        }
      }
      const provider = createGoogleSignInProvider();
      setGooglePopupPending(true);
      await signInWithPopup(auth, provider);
      setGooglePopupPending(false);
      setAuthStatus("Signed in successfully.");
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
      if (code === "auth/popup-closed-by-user") {
        setGooglePopupPending(false);
        if (typeof window !== "undefined") window.location.reload();
        return;
      }
      setGooglePopupPending(false);
      void recordNonFatal(err, {
        flow: "auth_google_sign_in",
        source_page: telemetrySource,
      });
      setAuthError(getErrorMessage(err, "Could not sign in with Google."));
      setAuthStatus("");
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <WebSignIn
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
      showGuestLink={showGuestLink}
      showLaunchingScreen={
        isNativeLaunchRuntime &&
        (isResolvingNativeLaunchAuth || (!!authUserEmail && !hasRedirected && !shouldStartProCheckout && !bypassAutoRedirect))
      }
    />
  );
}
