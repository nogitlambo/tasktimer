"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";

const SIGN_OUT_LANDING_BYPASS_KEY = "tasktimer:authSignedOutRedirectBypass";

export default function SignedOutPage() {
  const [bypassAutoRedirect, setBypassAutoRedirect] = useState(() => {
    if (typeof window === "undefined") return false;
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
    return shouldBypass;
  });

  useEffect(() => {
    if (!bypassAutoRedirect) return;
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    void signOut(auth).catch(() => {
      // Ignore sign-out retries here; auth state listener below resolves the final UI state.
    });
  }, [bypassAutoRedirect]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user || !bypassAutoRedirect || typeof window === "undefined") return;
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
    });
    return () => unsub();
  }, [bypassAutoRedirect]);

  return (
    <main
      className="displayFont relative min-h-screen overflow-hidden bg-[#05010b] text-white"
      style={{ fontFamily: "var(--font-orbitron), 'Segoe UI Variable', 'Segoe UI', Arial, sans-serif" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(156,67,255,0.24),transparent_34%),radial-gradient(circle_at_80%_18%,rgba(59,246,255,0.18),transparent_24%),radial-gradient(circle_at_bottom,rgba(12,29,64,0.8),transparent_42%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1625px] flex-col px-6 pb-16 pt-8 sm:px-8 md:px-12">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="TaskLaunch home">
            <Image
              src="/logo/tasklaunch-logo.png"
              alt="TaskLaunch"
              width={255}
              height={35}
              priority
              className="block h-auto w-[225px] sm:w-[255px]"
            />
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            <Link href="/" className="text-sm uppercase tracking-[0.18em] text-white/72 transition hover:text-white">
              Home
            </Link>
            <Link href="/privacy" className="text-sm uppercase tracking-[0.18em] text-white/72 transition hover:text-white">
              Privacy
            </Link>
            <Link
              href="/tasklaunch/user-guide"
              className="text-sm uppercase tracking-[0.18em] text-white/72 transition hover:text-white"
            >
              Features
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-12 py-12 lg:grid-cols-[1.02fr_1fr] lg:items-center lg:py-16">
          <div className="space-y-8">
            <p className="text-[12px] uppercase tracking-[0.22em] text-[#e7ccf5]">
              <span className="mr-2 text-[24px] leading-none text-[#d447d2]">{">"}</span>
              Session ended successfully
            </p>

            <div className="space-y-5">
              <h1 className="max-w-[11ch] text-[clamp(2.8rem,7vw,5.8rem)] font-black uppercase leading-[0.92] tracking-[-0.04em] text-[#f5f4fc]">
                You are signed out.
              </h1>
              <p className="max-w-[38rem] text-base leading-8 text-[#f1f2ff]/82 sm:text-lg">
                Your workspace is secure and ready whenever you want to jump back in. Head home or sign in again to
                keep building momentum.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <Link
                href="/web-sign-in"
                className="flex min-h-[56px] items-center justify-center border border-[#58e7ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-8 text-sm font-extrabold uppercase tracking-[0.14em] text-[#04131c] transition hover:brightness-110"
              >
                Sign In Again
              </Link>
              <Link
                href="/"
                className="flex min-h-[56px] items-center justify-center border border-white/15 bg-white/[0.04] px-8 text-sm font-bold uppercase tracking-[0.14em] text-white transition hover:border-white/30 hover:bg-white/[0.08]"
              >
                Back Home
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
