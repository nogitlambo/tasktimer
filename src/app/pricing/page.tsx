import type { Metadata } from "next";
import Link from "next/link";
import PricingSection from "./PricingSection";

export const metadata: Metadata = {
  title: "TaskLaunch Pricing",
  description: "Mockup pricing plans for TaskLaunch.",
};

export default function PricingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050813] text-white">
      <section className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-6 pb-16 pt-8 sm:px-8 md:px-12 lg:px-16">
        <div className="flex items-start justify-end">
          <Link
            href="/"
            className="displayFont inline-flex min-h-[42px] items-center justify-center border border-white/12 bg-white/[0.04] px-4 text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/90 transition hover:border-[#2cf6ff]/70 hover:text-[#bdfcff]"
          >
            Back Home
          </Link>
        </div>

        <div className="mx-auto mt-8 flex w-full flex-1 flex-col justify-center">
          <PricingSection mode="page" />
        </div>
      </section>
    </main>
  );
}
