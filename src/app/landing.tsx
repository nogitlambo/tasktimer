"use client";

import Link from "next/link";
import Image from "next/image";
import { Orbitron } from "next/font/google";
import type { LandingProps } from "./landing.types";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const featureTiles = [
  {
    label: "Focus Sessions",
    title: "Run Tasks In Live Time",
    copy: "Start and stop sessions instantly, then continue with clean per-task history.",
  },
  {
    label: "Progress Pulse",
    title: "Measure Daily Momentum",
    copy: "Track streaks, compare days, and see where your best hours are happening.",
  },
  {
    label: "Flexible Modes",
    title: "Organize By Intent",
    copy: "Use three categories to split work, learning, and personal routines cleanly.",
  },
  {
    label: "Quick Capture",
    title: "Minimal Friction Input",
    copy: "Keep naming, sorting, and session control fast so you stay in flow.",
  },
  {
    label: "Pattern Review",
    title: "Spot Task Trends",
    copy: "Use history tools to review performance and adjust with confidence.",
  },
  {
    label: "Cloud Ready",
    title: "Pick Up Anywhere",
    copy: "Sign in once and keep progress available across your supported devices.",
  },
] as const;

const testimonialCards = [
  {
    quote: "I finally stopped guessing where my workday went. Timebase made the patterns obvious.",
    author: "Product Designer",
    role: "Daily user",
  },
  {
    quote: "The category modes help me separate client work from deep-focus learning sessions.",
    author: "Frontend Engineer",
    role: "Remote team",
  },
  {
    quote: "Fast start/stop plus clean history keeps me accountable without adding overhead.",
    author: "Founder",
    role: "Startup ops",
  },
] as const;

const valueChips = ["Live Session Control", "Trend Visibility", "Less Context Switching"] as const;

export default function Landing({
  showTitlePhase,
}: LandingProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070c] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(56% 42% at 14% 8%, rgba(77,0,255,.26), transparent 72%), radial-gradient(40% 36% at 90% 14%, rgba(0,214,255,.2), transparent 72%), radial-gradient(44% 33% at 55% 90%, rgba(179,0,255,.16), transparent 76%), #05070c",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(191,138,255,.11) 1px, transparent 1px), linear-gradient(90deg, rgba(64,225,255,.09) 1px, transparent 1px)",
          backgroundSize: "68px 68px",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,.7), rgba(0,0,0,.1))",
        }}
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1260px] flex-col px-5 pb-12 pt-8 sm:px-7 md:px-10">
        <header
          className="flex items-center justify-between border border-white/15 bg-black/35 px-4 py-3 backdrop-blur-xl sm:px-6"
          style={{ clipPath: "polygon(13px 0, 100% 0, calc(100% - 13px) 100%, 0 100%)" }}
        >
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#35e8ff] shadow-[0_0_12px_rgba(53,232,255,.9)]" />
            <span className={`text-[11px] uppercase tracking-[0.24em] text-white/90 ${orbitron.className}`}>Timebase</span>
          </Link>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition hover:text-white">
              Privacy
            </Link>
            <Link href="/" className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/70 transition hover:text-white">
              Classic
            </Link>
            <Link
              href="/web-sign-in"
              className="border border-[#dc7cff]/55 bg-[#d33dcb]/20 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#ffd8ff] transition hover:bg-[#d33dcb]/35"
              style={{ clipPath: "polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%)" }}
            >
              Sign In
            </Link>
          </nav>
        </header>

        <section className="grid grid-cols-1 gap-10 pb-12 pt-10 md:pt-14">
          <div className="space-y-8">
            <div
              className={`space-y-4 transition-all duration-700 ${
                showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              <p className={`text-xs uppercase tracking-[0.2em] text-[#f3c9ff] ${orbitron.className}`}>Virtual Precision For Real Work</p>
              <h1 className={`max-w-[14ch] text-4xl uppercase leading-[1.02] tracking-[0.03em] text-white sm:text-5xl md:text-6xl ${orbitron.className}`}>
                Build Momentum In Every Session
              </h1>
              <p className="max-w-[52ch] text-sm leading-relaxed text-white/72 sm:text-base">
                Timebase gives you a focused command view for tracking work blocks, reading trends, and turning routines
                into measurable progress over time.
              </p>
            </div>

            <div
              className={`grid max-w-[620px] grid-cols-1 gap-3 transition-all duration-700 sm:grid-cols-3 ${
                showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              {valueChips.map((item) => (
                <div
                  key={item}
                  className="border border-white/15 bg-white/[.04] px-4 py-3 backdrop-blur-sm"
                  style={{ clipPath: "polygon(11px 0, 100% 0, calc(100% - 11px) 100%, 0 100%)" }}
                >
                  <div className={`text-[10px] uppercase tracking-[0.2em] text-[#77ecff] ${orbitron.className}`}>Capability</div>
                  <div className="mt-1 text-sm font-semibold text-[#ece8ff]">{item}</div>
                </div>
              ))}
            </div>

            <div className="grid max-w-[640px] grid-cols-2 gap-4 pt-2 sm:grid-cols-2">
              <div
                className="relative border border-[#8b54ff]/50 bg-gradient-to-br from-[#4f1d8b]/40 to-[#0d0f1e]/70 p-2"
                style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <div className="pointer-events-none absolute right-0 top-0 h-20 w-20 rounded-full bg-[#db6eff]/20 blur-2xl" />
                <Image src="/timebase-logo.png" alt="Timebase visual" width={420} height={280} className="h-48 w-full object-cover opacity-80" />
              </div>
              <div
                className="border border-[#4ccfff]/50 bg-gradient-to-br from-[#0f2f4f]/45 to-[#130f1f]/70 p-4"
                style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
              >
                <p className={`text-[11px] uppercase tracking-[0.18em] text-[#89f0ff] ${orbitron.className}`}>System Ready</p>
                <h3 className={`mt-2 text-xl uppercase leading-tight text-white ${orbitron.className}`}>Zero Guesswork Tracking</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Capture session time immediately, then move forward with clean summaries and fast controls.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 pb-10 sm:grid-cols-2 lg:grid-cols-3">
          {featureTiles.map((tile, idx) => (
            <article
              key={tile.title}
              className="group relative overflow-hidden border border-white/16 bg-black/35 p-5 backdrop-blur-sm"
              style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
            >
              <div
                className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${
                  idx % 2 === 0 ? "bg-[#8b3eff]/30" : "bg-[#22d8ff]/25"
                }`}
              />
              <p className={`text-[10px] uppercase tracking-[0.18em] text-[#b6a2ff] ${orbitron.className}`}>{tile.label}</p>
              <h3 className={`mt-2 text-xl uppercase leading-tight text-white ${orbitron.className}`}>{tile.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/70">{tile.copy}</p>
            </article>
          ))}
        </section>

        <section
          className="relative overflow-hidden border border-[#8f6bff]/35 bg-gradient-to-r from-[#18092f]/80 via-[#100a25]/85 to-[#061421]/90 px-5 py-7 sm:px-7"
          style={{ clipPath: "polygon(16px 0, 100% 0, calc(100% - 16px) 100%, 0 100%)" }}
        >
          <div className="pointer-events-none absolute -left-12 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-[#f35dff]/20 blur-3xl" />
          <div className="pointer-events-none absolute -right-12 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-[#2cc6ff]/25 blur-3xl" />
          <h2 className={`relative text-center text-2xl uppercase tracking-[0.05em] text-white ${orbitron.className}`}>What Users Say</h2>
          <div className="relative mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {testimonialCards.map((card) => (
              <article
                key={card.quote}
                className="border border-white/15 bg-black/35 p-4 backdrop-blur-sm"
                style={{ clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)" }}
              >
                <p className="text-sm leading-relaxed text-white/80">{card.quote}</p>
                <p className={`mt-4 text-[11px] uppercase tracking-[0.16em] text-[#95eaff] ${orbitron.className}`}>{card.author}</p>
                <p className="text-xs text-white/55">{card.role}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mt-8 overflow-hidden border border-[#35e8ff]/30 bg-gradient-to-r from-[#082136]/85 to-[#33063f]/70 px-5 py-7 sm:px-7"
          style={{ clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-[11px] uppercase tracking-[0.2em] text-[#9befff] ${orbitron.className}`}>Next Session Starts Here</p>
              <h2 className={`mt-2 max-w-[20ch] text-2xl uppercase leading-tight text-white sm:text-3xl ${orbitron.className}`}>
                Explore A Smarter Way To Build Daily Output
              </h2>
            </div>
            <Link
              href="/web-sign-in"
              className="inline-flex items-center justify-center border border-[#35e8ff]/70 bg-black/25 px-6 py-3 text-xs font-extrabold uppercase tracking-[0.13em] text-[#c3f8ff] transition hover:bg-[#35e8ff] hover:text-[#07141d]"
              style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
            >
              Start Now
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
