"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getFirebaseAuthClient, firebaseAuthMode, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { ensureUserProfileIndex } from "./tasktimer/lib/cloudStore";
import { readStartupModulePreference, startupModuleToRoute } from "./tasktimer/lib/startupModule";
import LandingClassic from "./landingClassic";
import LandingExperimental from "./landing";
import type { LandingClassicProps, LandingExperimentalProps } from "./landing.types";
import { getRedirectResult, onAuthStateChanged, signOut } from "firebase/auth";

const LOGO_PHASE_MS = 1200;
const DIAL_PHASE_MS = 3000;
const CTA_PHASE_MS = (LOGO_PHASE_MS + DIAL_PHASE_MS) / 2;
const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";

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
  const [showTitlePhase, setShowTitlePhase] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [bypassAutoRedirect, setBypassAutoRedirect] = useState(false);
  const [resolvedLanding, setResolvedLanding] = useState<"classic" | "v2" | null>(null);

  const landingParam = String(searchParams.get("landing") || "").trim().toLowerCase();
  const hasLandingOverride = landingParam === "classic" || landingParam === "v2";
  const effectiveLanding = hasLandingOverride ? (landingParam as "classic" | "v2") : resolvedLanding;
  const isExperimentalLanding = effectiveLanding === "v2";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      if (landingParam === "classic") {
        setResolvedLanding("classic");
        return;
      }
      if (landingParam === "v2") {
        setResolvedLanding("v2");
        return;
      }
      const hostname = window.location.hostname;
      const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
      setResolvedLanding(isLocalHost ? "v2" : "classic");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [landingParam]);

  useEffect(() => {
    const titleTimer = window.setTimeout(() => setShowTitlePhase(true), LOGO_PHASE_MS);
    const actionTimer = window.setTimeout(() => setShowActions(true), CTA_PHASE_MS);

    return () => {
      window.clearTimeout(titleTimer);
      window.clearTimeout(actionTimer);
    };
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
    const timer = window.setTimeout(() => {
      if (shouldBypass) {
        setBypassAutoRedirect(true);
        const auth = getFirebaseAuthClient();
        if (auth) {
          void signOut(auth).catch(() => {
            // ignore; onAuthStateChanged still drives the final UI state
          });
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email || null;
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
        router.replace(startupModuleToRoute(readStartupModulePreference()));
      }
    });
    return () => unsub();
  }, [router, hasRedirected, bypassAutoRedirect]);

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
      } catch (err: unknown) {
        if (cancelled) return;
        logFirebaseAuthError("getRedirectResult", err);
      }
    };
    void applyRedirectResult();
    return () => {
      cancelled = true;
    };
  }, []);

  const experimentalLandingProps: LandingExperimentalProps = {
    showTitlePhase,
    showActions,
  };

  const classicLandingProps: LandingClassicProps = {
    showTitlePhase,
    showActions,
  };

  if (!effectiveLanding) return null;

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

export default function HomePageClient() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
