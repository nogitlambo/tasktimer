"use client";

import Link from "next/link";
import { Orbitron } from "next/font/google";
import type { LandingProps } from "./landing.types";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const onlineAvatars = [
  "/avatars/initials/initials-AN.svg",
  "/avatars/toon/toonHead-male.svg",
  "/avatars/action-heroes/bruce-lee.svg",
  "/avatars/action-heroes/lara-croft.svg",
] as const;

export default function Landing({
  showTitlePhase,
  showActions,
}: LandingProps) {
  return (
    <main className="landingV2 relative min-h-screen overflow-hidden bg-[#05010b] text-white">
      <div className="landingV2Glow landingV2GlowTop" aria-hidden="true" />
      <div className="landingV2Glow landingV2GlowBottom" aria-hidden="true" />

      <div className="landingV2Container relative mx-auto flex min-h-screen w-full max-w-[1300px] flex-col px-6 pb-20 pt-8 sm:px-8 md:px-12">
        <header className="landingV2Header flex items-center justify-between">
          <Link href="/" className={`landingV2Brand text-3xl leading-none text-white ${orbitron.className}`}>
            Light
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            <Link href="/" className={`landingV2NavLink isActive ${orbitron.className}`}>
              Home
            </Link>
            <Link href="/privacy" className={`landingV2NavLink ${orbitron.className}`}>
              Company
            </Link>
            <Link href="/tasktimer/user-guide" className={`landingV2NavLink ${orbitron.className}`}>
              Features
            </Link>
          </nav>

          <Link href="/web-sign-in" className={`landingV2Signup ${orbitron.className}`}>
            Sign Up
          </Link>
        </header>

        <section className="landingV2Hero grid grid-cols-1 gap-12 pt-12 lg:grid-cols-[1.02fr_1fr] lg:items-start">
          <div className={`space-y-8 transition-all duration-700 ${showTitlePhase ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
            <h1 className={`landingV2Title text-[#f5f4fc] ${orbitron.className}`}>
              Let&apos;s Explore
              <br />
              Three-Dimensional
              <br />
              visual
            </h1>

            <p className="landingV2Lead text-[#f1f2ff]">
              With virtual technology you can see the digital world feel more real and you can play the game with a new
              style.
            </p>

            <div className={`flex flex-wrap items-center gap-7 transition-all duration-700 ${showActions ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}>
              <Link href="/web-sign-in" className={`landingV2PrimaryBtn ${orbitron.className}`}>
                Get it Now
              </Link>
              <Link href="/tasktimer/user-guide" className={`landingV2TextBtn ${orbitron.className}`}>
                Explore Device
              </Link>
            </div>

            <div className="landingV2Online flex items-center gap-4">
              <div className="landingV2OnlineAvatars" aria-hidden="true">
                {onlineAvatars.map((src, idx) => (
                  <img key={src} src={src} alt="" className={`landingV2OnlineAvatar landingV2OnlineAvatar${idx + 1}`} />
                ))}
              </div>
              <span className="landingV2OnlineDot" aria-hidden="true" />
              <span className={`landingV2OnlineText ${orbitron.className}`}>400k people online</span>
            </div>
          </div>

          <div className="landingV2CapsuleWrap">
            <div className={`landingV2Sparkles ${orbitron.className}`} aria-hidden="true">
              ✦✦
            </div>
            <article className="landingV2Capsule">
              <div className="landingV2CapsuleRim" aria-hidden="true" />
              <div className="landingV2CapsuleTop">
                <img src="/avatars/action-heroes/robocop.svg" alt="VR character in headset" />
              </div>
              <div className="landingV2CapsuleBody">
                <h2 className={`landingV2CapsuleTitle ${orbitron.className}`}>Cinematic Virtual Reality</h2>
                <div className="landingV2CapsuleLine" aria-hidden="true" />
                <p className="landingV2CapsuleCopy">
                  Let&apos;s be the best for more real and effective results and ready to explore the limitless world that we
                  have prepared for you.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="landingV2Lower grid grid-cols-1 gap-7 pt-14 lg:grid-cols-[320px_320px_1fr] lg:items-end">
          <div className="landingV2PhotoCard landingV2PhotoTall">
            <img src="/avatars/action-heroes/lara-croft.svg" alt="VR portrait" />
          </div>
          <div className="landingV2PhotoCard landingV2PhotoShort">
            <img src="/avatars/action-heroes/t-1000.svg" alt="VR portrait" />
          </div>
          <div className="landingV2LowerCopy">
            <h3 className={`landingV2LowerTitle ${orbitron.className}`}>New Experience In Playing Game</h3>
            <p className="landingV2LowerText">
              You can try playing the game with a new style and of course a more real feel, like you are the main character
              in your game and adventure in this new digital world.
            </p>
            <div className="pt-6">
              <Link href="/web-sign-in" className={`landingV2PrimaryBtn ${orbitron.className}`}>
                Get it Now
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
