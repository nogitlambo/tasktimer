"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import AppImg from "../components/AppImg";
import type { LandingProps } from "./landing.types";

const rocketVideoFadeOutMs = 1200;
const rocketVideoFadeInMs = 2000;
const earlyAccessCountdownTarget = new Date("2026-05-25T10:00:00+10:00");
const earlyAccessCountdownTargetLabel = "25th May 2026";

type SubscribeState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function getCountdownParts(now: Date) {
  const diffMs = Math.max(0, earlyAccessCountdownTarget.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (60 * 60 * 24));
  const hours = Math.floor((totalSeconds % (60 * 60 * 24)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, isComplete: diffMs <= 0 };
}

export default function LandingSoon(props: LandingProps) {
  void props;

  const [revealStage, setRevealStage] = useState(0);
  const [isRocketVideoResetting, setIsRocketVideoResetting] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribeState, setSubscribeState] = useState<SubscribeState>({ status: "idle", message: "" });
  const [countdown, setCountdown] = useState<ReturnType<typeof getCountdownParts> | null>(null);
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
    const syncCountdown = () => setCountdown(getCountdownParts(new Date()));
    syncCountdown();
    const intervalId = window.setInterval(syncCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

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
      setSubscribeState({ status: "error", message: "Enter a valid email address." });
      return;
    }

    setSubscribeState({ status: "loading", message: "Saving your early access request..." });

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

      setSubscribeState({
        status: "success",
        message: payload.alreadySubscribed
          ? "You're already on the early access list."
          : "You're on the early access list.",
      });
      setEmail("");
    } catch (error: unknown) {
      setSubscribeState({
        status: "error",
        message: error instanceof Error && error.message ? error.message : "Could not save your email right now.",
      });
    }
  };

  const showHero = revealStage >= 1;
  const showHeroActions = revealStage >= 2;
  const showHeader = revealStage >= 3;
  const showBackgroundImage = revealStage >= 1;
  const countdownText =
    countdown === null
      ? "Loading..."
      : countdown.isComplete
      ? "Open now"
      : `${countdown.days}d ${countdown.hours}h ${countdown.minutes}m ${countdown.seconds}s`;

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
          <Link href="/" className="landingV2FooterBrand displayFont">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>

          <div className="landingSoonV2Countdown" aria-live="polite">
            <div className="landingSoonV2CountdownInfo">
              <span className="landingSoonV2CountdownLabel displayFont">Early Access Countdown</span>
              <span className="landingSoonV2CountdownDate">{earlyAccessCountdownTargetLabel}</span>
            </div>
            <span className="landingSoonV2CountdownValue displayFont">{countdownText}</span>
          </div>
          <Link href="/about" className="landingSoonV2AboutLink displayFont">
            About
          </Link>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch landing hero">
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>Progress over perfection</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">
              <span className="landingV2HeroTitleGradient">Break free</span> from guilt-driven productivity systems
            </h1>

            <p className="landingV2HeroCopy">
              Designed for the neurodivergent, TaskLaunch uses non-traditional productivity methods to build
              sustainable discipline over time, supporting inconsistency instead of punishing it, helping you rebuild
              momentum quickly, and make progress without perfectionism.
            </p>

            <div className="landingSoonV2Countdown landingSoonV2CountdownMobile" aria-live="polite">
              <div className="landingSoonV2CountdownInfo">
                <span className="landingSoonV2CountdownLabel displayFont">Early Access Countdown</span>
                <span className="landingSoonV2CountdownDate">{earlyAccessCountdownTargetLabel}</span>
              </div>
              <span className="landingSoonV2CountdownValue displayFont">{countdownText}</span>
            </div>

            <form className={`landingV2Actions landingSoonV2Form ${showHeroActions ? "isVisible" : ""}`} onSubmit={handleSubmit}>
              <label className="landingSoonV2Field" htmlFor="landingSoonEmail">
                <span className="landingSoonV2FieldLabel displayFont">Email</span>
                <input
                  id="landingSoonEmail"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => {
                    setSubscribeState((current) => (current.message ? { status: "idle", message: "" } : current));
                  }}
                  className="landingSoonV2Input"
                  aria-describedby={subscribeState.message ? "landingSoonStatus" : undefined}
                />
              </label>
              <button
                type="submit"
                className="landingV2PrimaryBtn displayFont landingSoonV2Submit"
                disabled={subscribeState.status === "loading"}
              >
                {subscribeState.status === "loading" ? "Submitting..." : "Request Early Access"}
              </button>
            </form>

            {subscribeState.message ? (
              <p
                id="landingSoonStatus"
                className={`landingSoonV2Status is-${subscribeState.status}`}
                aria-live="polite"
                role={subscribeState.status === "error" ? "alert" : undefined}
              >
                {subscribeState.message}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
