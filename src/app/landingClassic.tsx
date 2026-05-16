"use client";

import Link from "next/link";
import AppImg from "../components/AppImg";
import { useEffect, useState } from "react";
import type { LandingClassicProps } from "./landing.types";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function LandingClassic({ showTitlePhase }: LandingClassicProps) {
  const [revealStage, setRevealStage] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  useEffect(() => {
    const timers: number[] = [];
    const frameId = window.requestAnimationFrame(() => {
      setRevealStage(1);
      timers.push(window.setTimeout(() => setRevealStage(2), 240));
      timers.push(window.setTimeout(() => setRevealStage(3), 520));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const showHeader = revealStage >= 1;
  const showHero = showTitlePhase && revealStage >= 2;
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextEmail = email.trim();
    setSubmitError("");
    setSubmitSuccess("");

    if (!isValidEmail(nextEmail)) {
      setSubmitError("Enter a valid email address.");
      return;
    }

    setSubmitBusy(true);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: nextEmail }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean };
      if (!response.ok) {
        throw new Error(String(payload.error || "Could not save your email right now."));
      }
      setSubmitSuccess(payload.alreadySubscribed ? "You have already subscribed" : "Thanks. You are on the list.");
      setEmail("");
    } catch (error: unknown) {
      const message = error instanceof Error && error.message ? error.message : "Could not save your email right now.";
      setSubmitError(message);
    } finally {
      setSubmitBusy(false);
    }
  }

  return (
    <main className="landingV2 landingV2ComingSoon isHeroVisible" style={{ backgroundColor: "#121212" }}>
      <div className="landingV2Shell">
        <header
          className={`landingV2Header landingV2HeaderFooter ${showHeader ? "isVisible" : ""}`}
        >
          <Link href="/" className="landingV2FooterBrand displayFont">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>

          <div className="landingV2FooterLinks">
            <Link href="/privacy">Privacy</Link>
          </div>
          <div className={mobileMenuOpen ? "landingV2MobileMenu isOpen" : "landingV2MobileMenu"}>
            <button
              type="button"
              className="landingV2MobileMenuButton"
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen ? "true" : "false"}
              onClick={() => setMobileMenuOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="landingV2MobileMenuLinks" aria-hidden={mobileMenuOpen ? "false" : "true"}>
              <button
                type="button"
                className="landingV2MobileMenuClose"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span />
                <span />
              </button>
              <Link href="/privacy">Privacy</Link>
            </div>
          </div>
        </header>

        <section className={`landingV2Hero ${showHero ? "isVisible" : ""}`} aria-label="TaskLaunch coming soon hero">
          <div className="landingV2HeroMain">
            <div className="landingV2HeroTag">
              <span className="landingV2HeroTagDot" />
              <span>Progress over perfection</span>
            </div>

            <h1 className="landingV2HeroTitle displayFont">
              <span className="landingV2HeroTitleGradient">Break free</span> from guilt-driven productivity systems
            </h1>

            <p className="landingV2HeroCopy">
              Flexible task management supporting neurodivergent minds by directing scattered energy into sustainable
              momentum so you can recover quickly after difficult days and continue making progress even when focus,
              energy, and motivation are inconsistent.
            </p>

            <form id="subscribe" className="landingV2SubscribeCard" onSubmit={handleSubmit} noValidate>
              <label htmlFor="comingSoonEmail" className="landingV2SubscribeLabel displayFont">
                Get launch updates
              </label>
              <div className="landingV2SubscribeRow">
                <input
                  id="comingSoonEmail"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (submitError) setSubmitError("");
                  }}
                  className="landingV2SubscribeInput"
                  style={{
                    backgroundColor: "#000000",
                    backgroundImage: "none",
                    boxShadow: "inset 0 0 0 1000px #000000",
                  }}
                  aria-invalid={submitError ? "true" : "false"}
                  disabled={submitBusy}
                />
                <button type="submit" className="landingV2PrimaryBtn displayFont" disabled={submitBusy}>
                  {submitBusy ? "Saving..." : "Subscribe"}
                </button>
              </div>
              {submitError ? <p className="landingV2SubscribeMessage isError">{submitError}</p> : null}
              {submitSuccess ? <p className="landingV2SubscribeMessage isSuccess">{submitSuccess}</p> : null}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
