import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "TaskLaunch Pricing",
  description: "Mockup pricing plans for TaskLaunch.",
};

const pricingTiers = [
  {
    name: "Starter",
    price: "$0",
    accent: "cyan" as const,
    cta: "Get Started",
    badge: null,
    description: "Per month",
    features: [
      "3 active goals",
      "Focus timer and streak tracking",
      "Basic history and task insights",
      "Local-only workspace",
    ],
    finePrint: "Ideal for solo momentum",
  },
  {
    name: "Pro",
    price: "$49",
    accent: "magenta" as const,
    cta: "Upgrade Now",
    badge: "Most Popular",
    description: "Per month",
    features: [
      "Unlimited active goals",
      "Advanced analytics and deep history",
      "Cloud sync across devices",
      "Priority productivity tools",
      "Smart weekly review snapshots",
    ],
    finePrint: "Designed for power users",
  },
  {
    name: "Teams",
    price: "$99",
    accent: "lime" as const,
    cta: "Contact Sales",
    badge: null,
    description: "Per month",
    features: [
      "Shared workspaces and team planning",
      "Collaboration visibility",
      "Centralized reporting views",
      "Unlimited storage and sync",
      "Admin-ready account controls",
    ],
    finePrint: "Built for high-output teams",
  },
];

function accentClasses(accent: "cyan" | "magenta" | "lime") {
  if (accent === "magenta") {
    return {
      border: "border-[#ff21f2]",
      glow: "shadow-[0_0_0_1px_rgba(255,33,242,0.55),0_0_38px_rgba(255,33,242,0.18)]",
      price: "text-[#ff2ef6]",
      button:
        "border-[#ff21f2] bg-[linear-gradient(135deg,#ff00e5_0%,#ff35bb_52%,#c517ff_100%)] text-white hover:brightness-110",
      badge: "bg-[#ff21f2] text-white",
      panel: "bg-[linear-gradient(180deg,rgba(24,8,34,0.96),rgba(12,8,23,0.96))]",
    };
  }
  if (accent === "lime") {
    return {
      border: "border-[#e8ff2f]",
      glow: "shadow-[0_0_0_1px_rgba(232,255,47,0.4),0_0_30px_rgba(232,255,47,0.1)]",
      price: "text-[#fbff24]",
      button:
        "border-[#f1ff2b] bg-[linear-gradient(135deg,#f4ff32_0%,#ecff00_55%,#d3f700_100%)] text-[#0c0f14] hover:brightness-105",
      badge: "bg-[#e8ff2f] text-[#081018]",
      panel: "bg-[linear-gradient(180deg,rgba(28,27,10,0.92),rgba(18,18,10,0.96))]",
    };
  }
  return {
    border: "border-[#2cf6ff]",
    glow: "shadow-[0_0_0_1px_rgba(44,246,255,0.4),0_0_30px_rgba(44,246,255,0.1)]",
    price: "text-[#2cf6ff]",
    button:
      "border-[#2cf6ff] bg-[linear-gradient(135deg,#2c3a46_0%,#3f4e59_50%,#4f616c_100%)] text-white hover:brightness-110",
    badge: "bg-[#2cf6ff] text-[#04141b]",
    panel: "bg-[linear-gradient(180deg,rgba(10,18,34,0.96),rgba(12,17,28,0.96))]",
  };
}

export default function PricingPage() {
  return (
    <main className={`${styles.pricingRoot} relative min-h-screen overflow-hidden bg-[#050813] text-white`}>
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

      <section className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 pb-16 pt-8 sm:px-8 md:px-12 lg:px-16">
        <div className="flex items-start justify-end">
          <Link
            href="/"
            className="displayFont inline-flex min-h-[42px] items-center justify-center border border-white/12 bg-white/[0.04] px-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/90 transition hover:border-[#2cf6ff]/70 hover:text-[#bdfcff]"
          >
            Back Home
          </Link>
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-[1100px] flex-1 flex-col justify-center">
          <div className="mb-12 text-center">
            <p className="displayFont text-[12px] font-bold uppercase tracking-[0.18em] text-[#24e9ff] sm:text-[14px]">
              TaskLaunch Productivity Platform
            </p>
            <h1 className="displayFont mt-2 text-[40px] font-black uppercase leading-none text-white sm:text-[56px] md:text-[64px]">
              Pricing Plans
            </h1>
            <p className="mx-auto mt-4 max-w-[42rem] text-sm uppercase tracking-[0.16em] text-white/55 sm:text-[15px]">
              Focused plans for builders, operators, and teams who want a sharper execution system.
            </p>
          </div>

          <div className="grid gap-7 lg:grid-cols-3">
            {pricingTiers.map((tier) => {
              const accent = accentClasses(tier.accent);
              const isFeatured = tier.badge !== null;
              return (
                <article
                  key={tier.name}
                  className={[
                    styles.pricingCard,
                    "group relative border px-8 pb-8 pt-10 transition duration-300",
                    accent.border,
                    accent.glow,
                    accent.panel,
                    isFeatured ? `${styles.featuredCard} translate-y-0 scale-[1.01] lg:-translate-y-3` : "",
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
                    <h2 className="displayFont text-[28px] font-extrabold uppercase tracking-[0.04em] text-white">
                      {tier.name}
                    </h2>
                    <div className={["displayFont mt-2 text-[48px] font-black leading-none", accent.price].join(" ")}>
                      {tier.price}
                    </div>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/65">
                      {tier.description}
                    </p>
                  </div>

                  <div className="mx-auto my-8 h-px w-full bg-white/14" />

                  <ul className="space-y-4 text-center text-[14px] font-medium uppercase tracking-[0.05em] text-white/88">
                    {tier.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>

                  <div className="mt-10">
                    <button
                      type="button"
                      className={[
                        "displayFont w-full border px-4 py-4 text-[13px] font-black uppercase tracking-[0.14em] transition",
                        accent.button,
                      ].join(" ")}
                    >
                      {tier.cta}
                    </button>
                  </div>

                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                    {tier.finePrint}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
