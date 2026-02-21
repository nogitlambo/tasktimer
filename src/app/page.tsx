import Image from "next/image";
import Link from "next/link";

const slantClip = {
  clipPath: "polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%)",
};

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0f13] text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-85"
        style={{
          background:
            "radial-gradient(70% 48% at 8% 4%, rgba(53,232,255,.20), transparent 64%), radial-gradient(60% 45% at 92% 88%, rgba(0,140,255,.24), transparent 66%), linear-gradient(155deg, #050910 0%, #070d19 52%, #060b16 100%)",
        }}
      />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 md:gap-7 md:px-8 md:py-8">
        <section className="border border-white/12 bg-[#0a1221]/90 p-4 sm:p-6 md:p-7">
          <header className="mb-8 flex items-center justify-between gap-4 md:mb-12">
            <Image
              src="/tasktimer-logo.png"
              alt="TaskTimer"
              width={170}
              height={36}
              className="h-auto w-[144px] sm:w-[170px]"
              priority
            />
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                href="/tasktimer/user-guide"
                className="border border-white/20 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.09em] text-white/86 transition hover:bg-white/[0.09]"
                style={slantClip}
              >
                User Guide
              </Link>
              <Link
                href="/tasktimer/settings"
                className="border border-white/20 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.09em] text-white/86 transition hover:bg-white/[0.09]"
                style={slantClip}
              >
                Settings
              </Link>
            </div>
          </header>

          <div className="grid items-center gap-8 md:grid-cols-[1.15fr_.85fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-white/62">
                Smart Personal Time Tracking
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-extrabold uppercase leading-[0.98] tracking-[0.01em] sm:text-5xl md:text-6xl">
                Track Better.
                <br />
                Focus Longer.
                <br />
                Improve Daily.
              </h1>
              <p className="mt-4 max-w-2xl text-sm text-white/72 md:text-base">
                Built for deep-work sessions, visual progress tracking, and fast history analysis. TaskTimer keeps your time
                visible, structured, and actionable across every task category.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/tasktimer"
                  className="inline-flex items-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_14px_rgba(0,220,255,.32)] transition hover:brightness-110 md:px-6"
                  style={slantClip}
                >
                  Open TaskTimer
                </Link>
                <Link
                  href="/tasktimer/settings?import=1"
                  className="inline-flex items-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_14px_rgba(0,220,255,.32)] transition hover:brightness-110 md:px-6"
                  style={slantClip}
                >
                  Import Backup
                </Link>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1">
              {[
                { title: "Category Modes", value: "3" },
                { title: "Fast History", value: "Inline + Manager" },
                { title: "Focus Screen", value: "Dial + Milestones" },
              ].map((item) => (
                <div
                  key={item.title}
                  className="border border-[#35e8ff]/25 bg-[linear-gradient(180deg,rgba(53,232,255,.08),rgba(255,255,255,.02))] p-4"
                  style={slantClip}
                >
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/64">{item.title}</p>
                  <p className="mt-2 text-sm font-bold uppercase tracking-[0.07em] text-[#8ff2ff]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Precision Sessions",
              text: "Start, stop, reset, and focus with high-contrast timer states and rapid task controls.",
            },
            {
              title: "Visual Milestones",
              text: "Map checkpoints to each task and monitor progress with clear bars, markers, and smart summaries.",
            },
            {
              title: "History Intelligence",
              text: "Review trends, inspect entries, bulk-manage logs, and export/import data without losing momentum.",
            },
          ].map((item) => (
            <article
              key={item.title}
              className="border border-white/10 bg-[#0c1528]/85 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.02)]"
              style={slantClip}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8defff]">{item.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/74">{item.text}</p>
            </article>
          ))}
        </section>

        <section className="border border-[#35e8ff]/20 bg-[linear-gradient(170deg,rgba(53,232,255,.10),rgba(255,255,255,.02)_42%,rgba(255,255,255,.02)_100%)] p-5 md:p-6">
          <div className="flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/62">Ready to Start</p>
              <h2 className="mt-2 text-2xl font-extrabold uppercase tracking-[0.05em] text-white sm:text-3xl">
                Launch your workflow in seconds
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/tasktimer"
                className="inline-flex items-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_14px_rgba(0,220,255,.32)] transition hover:brightness-110"
                style={slantClip}
              >
                Open App
              </Link>
              <Link
                href="/tasktimer/user-guide"
                className="inline-flex items-center border border-white/20 bg-white/[0.03] px-5 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white/88 transition hover:bg-white/[0.09]"
                style={slantClip}
              >
                Learn More
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
