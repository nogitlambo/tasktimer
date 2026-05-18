"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AppImg from "@/components/AppImg";

type UnsubscribeStatus = "loading" | "unsubscribed" | "already-unsubscribed" | "invalid";

const COPY: Record<UnsubscribeStatus, { title: string; message: string }> = {
  loading: {
    title: "Updating email preferences",
    message: "One moment while we process your unsubscribe request.",
  },
  invalid: {
    title: "This unsubscribe link is invalid",
    message: "The link may be incomplete or no longer match this email address.",
  },
  "already-unsubscribed": {
    title: "You're already unsubscribed",
    message: "This email address was already removed from early access emails.",
  },
  unsubscribed: {
    title: "You're unsubscribed",
    message: "This email address has been removed from early access emails.",
  },
};

export default function UnsubscribeClient() {
  const [status, setStatus] = useState<UnsubscribeStatus>("loading");

  useEffect(() => {
    const controller = new AbortController();

    async function unsubscribe() {
      try {
        const params = new URLSearchParams(window.location.search);
        const response = await fetch(`/api/unsubscribe?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        const payload = (await response.json()) as { status?: UnsubscribeStatus };
        if (!response.ok || !payload.status || !(payload.status in COPY)) {
          setStatus("invalid");
          return;
        }
        setStatus(payload.status);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("invalid");
      }
    }

    void unsubscribe();
    return () => controller.abort();
  }, []);

  const copy = COPY[status];

  return (
    <main className="landingV2 privacyLandingPage unsubscribePage">
      <div className="landingV2Shell">
        <header className="landingV2Header isVisible">
          <Link href="/" className="landingV2FooterBrand displayFont" aria-label="TaskLaunch home">
            <AppImg src="/logo/launch-icon-original-transparent.png" alt="" className="landingV2HeaderBrandIcon" />
            <span>TaskLaunch</span>
          </Link>
        </header>

        <section className="landingV2Hero isVisible" aria-label="TaskLaunch email preferences">
          <div className="landingV2HeroMain">
            <h1 className="landingV2HeroTitle displayFont">{copy.title}</h1>
            <p className="landingV2HeroCopy">{copy.message}</p>
            <Link href="/" className="landingV2PrimaryBtn displayFont unsubscribePageHomeLink">
              Return Home
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
