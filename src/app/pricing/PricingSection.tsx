"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./PricingSection.module.css";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";

const pricingTiers = [
  {
    name: "Free",
    price: "$0",
    accent: "cyan" as const,
    cta: "Get Started",
    href: null,
    badge: null,
    description: "Complete solo tracking essentials",
    billingLabel: "Per month",
    features: [
      "Create, edit, duplicate, delete, start, stop, and reset tasks",
      "Logged session history and basic inline history",
      "Basic Focus Mode and dashboard access",
      "Appearance and theme controls",
      "Basic import and export backups",
      "Core account and sign-in access",
    ],
    finePrint: null,
  },
  {
    name: "Pro",
    price: "$3.99",
    accent: "magenta" as const,
    cta: "Get Pro",
    href: "/web-sign-in?checkout=pro",
    badge: "7-day free trial",
    description: "Advanced tools for power users",
    billingLabel: "Per month",
    features: [
      "Everything in Free, plus:",
      "History Manager with bulk tools",
      "Inline history analysis and pinned history",
      "Richer dashboard analytics and insights",
      "Milestones, presets, and time-goal setup",
      "Checkpoint alert configuration and dynamic colors",
      "Full-history backups, friends, and task sharing",
    ],
    finePrint: null,
  },
];

function accentClasses(accent: "cyan" | "magenta" | "lime") {
  if (accent === "magenta") {
    return {
      border: "border-[rgba(255,33,242,0.18)]",
      glow: "shadow-[0_0_0_1px_rgba(255,33,242,0.12),0_0_18px_rgba(255,33,242,0.06)]",
      price: "text-[#ff2ef6]",
      button:
        "border-[#ff21f2] bg-[linear-gradient(135deg,#ff00e5_0%,#ff35bb_52%,#c517ff_100%)] text-white hover:brightness-110",
      badge: "bg-[#ff21f2] text-white",
      panel: "bg-[linear-gradient(180deg,rgba(24,8,34,0.96),rgba(12,8,23,0.96))]",
      hoverBorderColor: "#ff4cf5",
      hoverGlowShadow: "0 0 0 1px rgba(255,76,245,0.68), 0 0 42px rgba(255,76,245,0.24)",
    };
  }
  if (accent === "lime") {
    return {
      border: "border-[rgba(232,255,47,0.16)]",
      glow: "shadow-[0_0_0_1px_rgba(232,255,47,0.12),0_0_18px_rgba(232,255,47,0.06)]",
      price: "text-[#fbff24]",
      button:
        "border-[#f1ff2b] bg-[linear-gradient(135deg,#f4ff32_0%,#ecff00_55%,#d3f700_100%)] text-[#0c0f14] hover:brightness-105",
      badge: "bg-[#e8ff2f] text-[#081018]",
      panel: "bg-[linear-gradient(180deg,rgba(28,27,10,0.92),rgba(18,18,10,0.96))]",
      hoverBorderColor: "#f4ff58",
      hoverGlowShadow: "0 0 0 1px rgba(244,255,88,0.56), 0 0 36px rgba(244,255,88,0.16)",
    };
  }
  return {
    border: "border-[rgba(44,246,255,0.16)]",
    glow: "shadow-[0_0_0_1px_rgba(44,246,255,0.12),0_0_18px_rgba(44,246,255,0.06)]",
    price: "text-[#2cf6ff]",
    button:
      "border-[#2cf6ff] bg-[linear-gradient(135deg,#2c3a46_0%,#3f4e59_50%,#4f616c_100%)] text-white hover:brightness-110",
    badge: "bg-[#2cf6ff] text-[#04141b]",
    panel: "bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(12,17,28,0.96))]",
    hoverBorderColor: "#64fbff",
    hoverGlowShadow: "0 0 0 1px rgba(100,251,255,0.56), 0 0 36px rgba(100,251,255,0.16)",
  };
}

type PricingSectionProps = {
  mode?: "landing" | "page";
};

export default function PricingSection({ mode = "landing" }: PricingSectionProps) {
  const router = useRouter();
  const isPage = mode === "page";
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  const handleStartProCheckout = async () => {
    if (checkoutBusy) return;
    setCheckoutError("");

    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    const uid = String(user?.uid || "").trim();
    if (!uid || !user) {
      router.push("/web-sign-in?checkout=pro");
      return;
    }

    setCheckoutBusy(true);
    try {
      const idToken = await user.getIdToken();
      if (!idToken) {
        throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      }
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-firebase-auth": idToken,
        },
        body: JSON.stringify({ uid }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      window.location.assign(data.url);
    } catch (error: unknown) {
      setCheckoutError(error instanceof Error && error.message ? error.message : "Could not start checkout.");
      setCheckoutBusy(false);
    }
  };

  return (
    <section
      className={[
        styles.pricingRoot,
        "relative overflow-hidden text-white",
        isPage ? "bg-[#050813]" : "px-1 py-2 sm:px-2 sm:py-3",
      ].join(" ")}
    >
      {isPage ? (
        <>
          <div className="pointer-events-none absolute inset-0 opacity-40">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(78,118,178,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(78,118,178,.12) 1px, transparent 1px)",
                backgroundSize: "64px 64px",
                maskImage: "linear-gradient(to bottom, rgba(0,0,0,.95), rgba(0,0,0,.72))",
              }}
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(circle_at_top,rgba(93,34,255,0.14),rgba(5,8,19,0)_58%)]" />
          <div className="pointer-events-none absolute -left-24 top-44 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(44,246,255,0.18),rgba(44,246,255,0)_68%)] blur-3xl" />
          <div className="pointer-events-none absolute -right-24 top-56 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,0,230,0.16),rgba(255,0,230,0)_70%)] blur-3xl" />
        </>
      ) : null}

      <div className={["relative mx-auto w-full", isPage ? "max-w-[1100px]" : "max-w-[980px]"].join(" ")}>
        <div className="mb-12 text-center">
          <h2
            className={[
              "displayFont font-black uppercase leading-none text-white",
              isPage ? "text-[40px] sm:text-[56px] md:text-[64px]" : "text-[32px] sm:text-[40px] md:text-[52px]",
            ].join(" ")}
          >
            Get Free or Get Pro
          </h2>
          {checkoutError ? (
            <div className="mt-4 text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[#ff8cb8]">
              {checkoutError}
            </div>
          ) : null}
        </div>

        <div className="mx-auto grid max-w-[860px] gap-7 lg:grid-cols-2">
          {pricingTiers.map((tier) => {
            const accent = accentClasses(tier.accent);
            const isFeatured = tier.badge !== null;
            return (
              <article
                key={tier.name}
                style={
                  {
                    "--pricing-card-hover-border": accent.hoverBorderColor,
                    "--pricing-card-hover-shadow": accent.hoverGlowShadow,
                  } as CSSProperties
                }
                className={[
                  styles.pricingCard,
                  "group relative flex h-full flex-col border px-8 pb-8 pt-10 transition duration-300",
                  accent.border,
                  accent.glow,
                  accent.panel,
                  isFeatured ? `${styles.featuredCard} translate-y-0 scale-[1.01]` : "",
                ].join(" ")}
              >
                {tier.badge ? (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                    <span
                      className={[
                        "displayFont inline-flex min-h-[28px] items-center justify-center px-4 text-[10px] font-black uppercase tracking-[0.14em]",
                        accent.badge,
                      ].join(" ")}
                    >
                      {tier.badge}
                    </span>
                  </div>
                ) : null}

                <div className="text-center">
                  <h3 className="displayFont text-[28px] font-extrabold uppercase tracking-[0.04em] text-white">
                    {tier.name}
                  </h3>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                    {tier.description}
                  </p>
                  <div className={["displayFont mt-2 text-[48px] font-black leading-none", accent.price].join(" ")}>
                    {tier.price}
                  </div>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                    {tier.billingLabel}
                  </p>
                  {tier.finePrint ? (
                    <p className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                      {tier.finePrint}
                    </p>
                  ) : null}
                </div>

                <div className="mx-auto my-8 h-px w-full bg-white/14" />

                <ul
                  className={[
                    styles.featureList,
                    "flex-1 space-y-4 pl-5 text-left text-[14px] font-medium tracking-[0.02em] text-white/88",
                  ].join(" ")}
                >
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>

                <div className="mt-auto pt-10">
                  {tier.name === "Pro" ? (
                    <button
                      type="button"
                      onClick={() => void handleStartProCheckout()}
                      disabled={checkoutBusy}
                      className={[
                        "displayFont block w-full border px-4 py-4 text-center text-[13px] font-black uppercase tracking-[0.14em] transition",
                        accent.button,
                        checkoutBusy ? "cursor-wait opacity-85" : "",
                      ].join(" ")}
                    >
                      {checkoutBusy ? "Starting Checkout..." : tier.cta}
                    </button>
                  ) : tier.href ? (
                    <a
                      href={tier.href}
                      className={[
                        "displayFont block w-full border px-4 py-4 text-center text-[13px] font-black uppercase tracking-[0.14em] transition",
                        accent.button,
                      ].join(" ")}
                    >
                      {tier.cta}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={[
                        "displayFont w-full border px-4 py-4 text-[13px] font-black uppercase tracking-[0.14em] transition",
                        accent.button,
                      ].join(" ")}
                    >
                      {tier.cta}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
