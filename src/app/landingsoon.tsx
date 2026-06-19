"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import AppImg from "../components/AppImg";
import type { LandingProps } from "./landing.types";

const rocketVideoFadeOutMs = 1200;
const rocketVideoFadeInMs = 2000;
const resendLockMs = 60 * 60 * 1000;

type SubscribeState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function formatResendCountdown(lockedUntilMs: number | null, nowMs: number) {
  if (!lockedUntilMs) return "";
  const totalSeconds = Math.max(0, Math.ceil((lockedUntilMs - nowMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function LandingSoon(props: LandingProps) {
  void props;

  const [revealStage, setRevealStage] = useState(0);
  const [isRocketVideoResetting, setIsRocketVideoResetting] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribeState, setSubscribeState] = useState<SubscribeState>({ status: "idle", message: "" });
  const [duplicateEmail, setDuplicateEmail] = useState("");
  const [resendLockedUntilMs, setResendLockedUntilMs] = useState<number | null>(null);
  const [resendNowMs, setResendNowMs] = useState(() => Date.now());
  const [isResendPending, setIsResendPending] = useState(false);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const hasTriggeredRocketVideoRef = useRef(false);
  const isRocketVideoResettingRef = useRef(false);
  const rocketFadeOutTimerRef = useRef<number | null>(null);
  const rocketFadeInTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const applyLandingRouteBodyState = () => {
      document.body.classList.remove("webSignInRoute");
      document.body.classList.add("landingRoute");
    };

    applyLandingRouteBodyState();
    window.addEventListener("pageshow", applyLandingRouteBodyState);

    return () => {
      window.removeEventListener("pageshow", applyLandingRouteBodyState);
      document.body.classList.remove("landingRoute");
    };
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 300));
      timers.push(window.setTimeout(() => setRevealStage(3), 600));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!resendLockedUntilMs) return;
    const syncResendCountdown = () => {
      const nowMs = Date.now();
      setResendNowMs(nowMs);
      if (resendLockedUntilMs <= nowMs) {
        setResendLockedUntilMs(null);
      }
    };
    syncResendCountdown();
    const intervalId = window.setInterval(syncResendCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [resendLockedUntilMs]);

  const playRocketVideo = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;
    if (hasTriggeredRocketVideoRef.current) return;
    if (isRocketVideoResettingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    hasTriggeredRocketVideoRef.current = true;
    video.currentTime = 0;
    void video.play().catch(() => {
      hasTriggeredRocketVideoRef.current = false;
    });
  };

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video) return;

    const resetVideo = () => {
      video.pause();
      video.currentTime = 0;
      hasTriggeredRocketVideoRef.current = false;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      resetVideo();
    }

    return () => {
      if (rocketFadeOutTimerRef.current !== null) {
        window.clearTimeout(rocketFadeOutTimerRef.current);
      }
      if (rocketFadeInTimerRef.current !== null) {
        window.clearTimeout(rocketFadeInTimerRef.current);
      }
    };
  }, []);

  const startRocketVideoReset = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;
    if (isRocketVideoResettingRef.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.pause();
      video.currentTime = 0;
      hasTriggeredRocketVideoRef.current = false;
      isRocketVideoResettingRef.current = false;
      setIsRocketVideoResetting(false);
      return;
    }

    isRocketVideoResettingRef.current = true;
    setIsRocketVideoResetting(true);

    if (rocketFadeOutTimerRef.current !== null) {
      window.clearTimeout(rocketFadeOutTimerRef.current);
    }
    if (rocketFadeInTimerRef.current !== null) {
      window.clearTimeout(rocketFadeInTimerRef.current);
    }

    rocketFadeOutTimerRef.current = window.setTimeout(() => {
      video.pause();
      video.currentTime = 0;
      setIsRocketVideoResetting(false);

      rocketFadeInTimerRef.current = window.setTimeout(() => {
        hasTriggeredRocketVideoRef.current = false;
        isRocketVideoResettingRef.current = false;
      }, rocketVideoFadeInMs);
    }, rocketVideoFadeOutMs);
  };

  const handleRocketVideoTimeUpdate = () => {
    const video = backgroundVideoRef.current;
    if (!video) return;
    if (isRocketVideoResettingRef.current) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    if (video.duration - video.currentTime > rocketVideoFadeOutMs / 1000) return;
    startRocketVideoReset();
  };

  const resetRocketVideoAfterPlayback = () => {
    startRocketVideoReset();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setDuplicateEmail("");
      setResendLockedUntilMs(null);
      setSubscribeState({ status: "error", message: "Please enter a valid email address." });
      return;
    }

    setDuplicateEmail("");
    setResendLockedUntilMs(null);
    setSubscribeState({ status: "loading", message: "Registering..." });

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = (await response.json()) as { ok?: boolean; alreadySubscribed?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not save your email right now.");
      }

      if (payload.alreadySubscribed) {
        setDuplicateEmail(normalizedEmail);
        setSubscribeState({ status: "success", message: "You're already on the early access list." });
        return;
      }

      setSubscribeState({
        status: "success",
        message: "You've subscribed to the early access list",
      });
      setEmail("");
    } catch (error: unknown) {
      setSubscribeState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "Could not save your email right now.",
      });
    }
  };

  const handleResendConfirmation = async () => {
    const resendEmail = (duplicateEmail || email).trim();
    if (!resendEmail || isResendPending || (resendLockedUntilMs !== null && resendLockedUntilMs > resendNowMs)) return;

    setIsResendPending(true);
    try {
      const response = await fetch("/api/subscribe/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: resendEmail }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        resent?: boolean;
        resendLockedUntilMs?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not send the confirmation email right now.");
      }

      const lockedUntilMs =
        typeof payload.resendLockedUntilMs === "number" && Number.isFinite(payload.resendLockedUntilMs)
          ? payload.resendLockedUntilMs
          : Date.now() + resendLockMs;
      setDuplicateEmail(resendEmail);
      setResendNowMs(Date.now());
      setResendLockedUntilMs(lockedUntilMs);
      setSubscribeState({
        status: "success",
        message: payload.resent ? "Confirmation email sent." : "Confirmation email was already sent recently.",
      });
    } catch (error: unknown) {
      setSubscribeState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "Could not send the confirmation email right now.",
      });
    } finally {
      setIsResendPending(false);
    }
  };

  const showHero = revealStage >= 1;
  const showHeroActions = revealStage >= 2;
  const showHeader = revealStage >= 3;
  const showBackgroundImage = revealStage >= 1;
  const resendCountdownText = formatResendCountdown(resendLockedUntilMs, resendNowMs);
  const isResendLocked = Boolean(resendCountdownText);

  return (
    <main
      className={`landingV2 landingSoonV2 ${showBackgroundImage ? "isHeroVisible" : ""}${
        isRocketVideoResetting ? " isRocketVideoResetting" : ""
      }`}
    >
      <video
        ref={backgroundVideoRef}
        className="landingV2BackgroundVideo"
        src="/rocket_breaking_chains4_opticalflow_60fps_50pct.mp4"
        muted
        preload="auto"
        playsInline
        aria-hidden="true"
        onTimeUpdate={handleRocketVideoTimeUpdate}
        onEnded={resetRocketVideoAfterPlayback}
      />
      <button
        type="button"
        className="landingV2RocketHotspot"
        aria-label="Play rocket animation"
        onMouseEnter={playRocketVideo}
        onFocus={playRocketVideo}
      />
      <div className="landingV2Shell">
        <header className={`landingV2Header landingV2HeaderFooter landingSoonV2Header ${showHeader ? "isVisible" : ""}`}>
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/tasklaunch-logo.webp" alt="" className="landingHeaderLogo" />
          </Link>
          <Link href="/about" className="landingSoonV2AboutLink displayFont">
            About
          </Link>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch landing hero">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">
              <span className="landingV2HeroTitleGradient">Break free</span> from guilt-driven productivity systems
            </h1>

            <p className="landingV2HeroCopy">
              Designed for the neurodivergent, TaskLaunch uses non-traditional productivity methods to build
              sustainable discipline over time, supporting inconsistency instead of punishing it, helping you rebuild
              momentum quickly, and make progress without perfectionism.
            </p>

            <form className={`landingV2Actions landingSoonV2Form ${showHeroActions ? "isVisible" : ""}`} onSubmit={handleSubmit}>
              <div className="landingSoonV2Field">
                <label className="landingSoonV2FieldLabel displayFont" htmlFor="landingSoonEmail">
                  Email
                </label>
                <div className="landingSoonV2InputShell">
                  <input
                    id="landingSoonEmail"
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setDuplicateEmail("");
                      setResendLockedUntilMs(null);
                    }}
                    onFocus={() => {
                      setSubscribeState((current) =>
                        current.message && !duplicateEmail ? { status: "idle", message: "" } : current
                      );
                    }}
                    className="landingSoonV2Input"
                    aria-describedby={subscribeState.message ? "landingSoonStatus" : undefined}
                  />
                  <button
                    type="submit"
                    className="landingV2PrimaryBtn displayFont landingSoonV2Submit"
                    disabled={subscribeState.status === "loading"}
                    aria-label={subscribeState.status === "loading" ? "Submitting early access request" : "Request early access"}
                  >
                    {subscribeState.status === "loading" ? "Submitting..." : "Join Early Access List"}
                  </button>
                </div>
              </div>
            </form>

            {subscribeState.message ? (
              <p
                id="landingSoonStatus"
                className={`landingSoonV2Status is-${subscribeState.status}`}
                aria-live="polite"
                role={subscribeState.status === "error" ? "alert" : undefined}
              >
                {subscribeState.message}
                {duplicateEmail ? (
                  <>
                    {" "}
                    {isResendLocked ? (
                      <span className="landingSoonV2ResendLink isDisabled">Resend available in {resendCountdownText}</span>
                    ) : (
                      <button
                        type="button"
                        className="landingSoonV2ResendLink"
                        onClick={handleResendConfirmation}
                        disabled={isResendPending}
                      >
                        {isResendPending ? "Sending..." : "Resend confirmation"}
                      </button>
                    )}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
