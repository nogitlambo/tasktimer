import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#07080d] text-white">
      <div
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 45% at 10% 10%, rgba(32,86,255,.20), transparent 60%), radial-gradient(60% 40% at 90% 40%, rgba(16,73,255,.18), transparent 70%)",
        }}
      />
      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-4 sm:py-6 md:gap-8 md:px-8 md:py-8">
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0d14] p-4 sm:p-5 md:rounded-3xl md:p-8">
          <div className="mb-6 flex items-center justify-between gap-4 text-xs tracking-[0.16em] text-white/70 md:mb-10">
            <Image
              src="/tasktimer-logo.png"
              alt="TaskTimer"
              width={170}
              height={36}
              className="h-auto w-[140px] sm:w-[170px]"
              priority
            />
          </div>
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">
                Smart Personal Time Tracking
              </p>
              <h1 className="mt-3 max-w-xl text-3xl font-bold uppercase leading-[1.05] tracking-tight sm:text-4xl md:text-6xl">
                Track Better. Focus Longer.
              </h1>
              <p className="mt-3 max-w-xl text-sm text-white/70 md:mt-4 md:text-base">
                TaskTimer helps you run focused sessions, monitor progress across
                categories, and build better work habits with clean visual history.
              </p>
              <Link
                href="/tasktimer"
                className="mt-5 inline-flex rounded-full bg-[#1453ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2a64ff] md:mt-6 md:px-5"
              >
                Open TaskTimer
              </Link>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.03] p-2 sm:rounded-2xl sm:p-3">
              <Image
                src="/focus-timer-preview.svg"
                alt="TaskTimer focus timer preview"
                width={640}
                height={420}
                className="h-auto w-full rounded-xl border border-white/10"
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
