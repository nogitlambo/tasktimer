import Image from "next/image";
import Link from "next/link";

const slantClip = {
  clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)",
};

const panelClip = {
  clipPath: "polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)",
};

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0d0f13] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(62% 46% at 6% 8%, rgba(53,232,255,.18), transparent 68%), radial-gradient(56% 42% at 92% 84%, rgba(0,140,255,.2), transparent 68%), linear-gradient(160deg, #060910 0%, #0a0f18 48%, #070a11 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(circle at center, black 32%, transparent 88%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 32%, transparent 88%)",
        }}
      />

      <main className="relative mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8">
        <section
          className="border border-white/10 bg-[rgba(12,16,24,.88)] p-4 shadow-[0_20px_60px_rgba(0,0,0,.35)] sm:p-6 md:p-8"
          style={panelClip}
        >
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-4 md:pb-5">
            <Image
              src="/tasktimer-logo.png"
              alt="TaskTimer"
              width={196}
              height={44}
              className="h-auto w-[150px] sm:w-[190px]"
              priority
            />
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/tasktimer/user-guide"
                className="border border-white/20 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/85 transition hover:bg-white/[0.08]"
                style={slantClip}
              >
                User Guide
              </Link>
              <Link
                href="/tasktimer/settings"
                className="border border-white/20 bg-white/[0.03] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/85 transition hover:bg-white/[0.08]"
                style={slantClip}
              >
                Settings
              </Link>
            </div>
          </header>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_.92fr] lg:items-start">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">TaskTimer Productivity Suite</p>
              <h1 className="mt-3 text-4xl font-extrabold uppercase leading-[0.95] tracking-[0.02em] sm:text-5xl xl:text-6xl">
                Time Tracking
                <br />
                Built For
                <br />
                Deep Focus
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/72 sm:text-base">
                Track sessions per task, organize by mode, monitor checkpoint progress, and inspect history with fast inline
                charts and management tools. TaskTimer is designed for focused workflows with high-clarity visual feedback.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/tasktimer"
                  className="inline-flex items-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_16px_rgba(0,220,255,.3)] transition hover:brightness-110"
                  style={slantClip}
                >
                  Open TaskTimer
                </Link>
                <Link
                  href="/tasktimer/settings?import=1"
                  className="inline-flex items-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_16px_rgba(0,220,255,.3)] transition hover:brightness-110"
                  style={slantClip}
                >
                  Import Backup
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Modes", "3 Categories"],
                  ["History", "Entries + Days"],
                  ["Focus", "Dial + Insights"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="border border-[#35e8ff]/20 bg-[linear-gradient(180deg,rgba(53,232,255,.08),rgba(255,255,255,.02))] p-3"
                    style={slantClip}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/55">{k}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-[#96f4ff]">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <section className="border border-white/10 bg-[#0b0f16]/95 p-4" style={panelClip}>
                <div className="mb-4 flex items-center justify-between border-b border-white/8 pb-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/82">Live Task Panel</p>
                  <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#5cf4ff]">Running</span>
                </div>
                <div className="space-y-3">
                  <div className="border border-white/10 bg-[#0b0f16] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[15px] font-black uppercase tracking-[0.12em] text-white">Deep Work Sprint</div>
                        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white/55">Mode 2</div>
                      </div>
                      <div className="font-mono text-[14px] font-extrabold tracking-[0.18em] text-[#3ef3ff] drop-shadow-[0_0_8px_rgba(62,243,255,.28)]">
                        00 02 14 38
                      </div>
                    </div>
                    <div className="mt-4 h-[10px] border border-white/10 bg-black/25">
                      <div className="h-full w-[62%] bg-[#ff7a22]" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    {["Start", "Stop", "Focus"].map((a, idx) => (
                      <div
                        key={a}
                        className={`px-2 py-2.5 text-[11px] font-black uppercase tracking-[0.11em] ${
                          idx === 0
                            ? "border border-[#35e8ff]/35 bg-[#0c121c] text-white/88"
                            : idx === 1
                              ? "border border-red-500/35 bg-[rgba(54,7,13,.75)] text-[#ff6f79]"
                              : "border border-white/12 bg-[#12161d] text-white/80"
                        }`}
                        style={slantClip}
                      >
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="border border-white/10 bg-[#0d0f13]/95 p-4" style={panelClip}>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">History Preview</p>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-white/45">7 entries</span>
                </div>
                <div className="h-40 border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01))] p-3">
                  <div className="flex h-full items-end gap-2">
                    {[18, 62, 44, 30, 76, 12, 50].map((h, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center justify-end gap-2">
                        <div
                          className={`w-full border ${
                            i === 4 ? "border-[#ffe14d] bg-[#ffc400]/65" : "border-[#35e8ff]/20 bg-[#35e8ff]/25"
                          } transition`}
                          style={{ height: `${h}%` }}
                        />
                        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-white/45">
                          {["M", "T", "W", "T", "F", "S", "S"][i]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                title: "Task Modes & Colors",
                text: "Organize work by category with configurable labels, enabled modes, and color-coded tracking.",
              },
              {
                title: "Milestones & Checkpoints",
                text: "Set time checkpoints on each task and monitor progress visually across task and focus views.",
              },
              {
                title: "Inline History Analysis",
                text: "Inspect recent performance per task with interactive columns, lock selections, and quick analysis.",
              },
              {
                title: "Backup & Import Workflow",
                text: "Export backups and import with merge/overwrite confirmation to safely move data between devices.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="border border-white/10 bg-[rgba(12,18,28,.86)] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.02)]"
                style={panelClip}
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#8ff2ff]">{item.title}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/72">{item.text}</p>
              </article>
            ))}
          </div>

          <aside
            className="border border-[#35e8ff]/20 bg-[linear-gradient(165deg,rgba(53,232,255,.12),rgba(255,255,255,.02)_46%,rgba(255,255,255,.01))] p-5"
            style={panelClip}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/62">Workflow Snapshot</p>
            <h2 className="mt-2 text-2xl font-extrabold uppercase tracking-[0.05em]">Built For Daily Consistency</h2>
            <ul className="mt-4 space-y-3 text-sm text-white/74">
              {[
                "Track multiple tasks without losing visual clarity",
                "Use Focus Mode for distraction-free single-task timing",
                "Review trends quickly with history chart interactions",
                "Manage logs in bulk from the History Manager",
                "Customize modes and labels for your own workflow",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 bg-[#35e8ff]" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 grid gap-2">
              <Link
                href="/tasktimer"
                className="inline-flex items-center justify-center border border-[#35e8ff]/70 bg-gradient-to-r from-[#2ea7ff] via-[#35e8ff] to-[#00cfc8] px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#04131c] shadow-[0_0_14px_rgba(0,220,255,.28)] transition hover:brightness-110"
                style={slantClip}
              >
                Launch TaskTimer
              </Link>
              <Link
                href="/tasktimer/user-guide"
                className="inline-flex items-center justify-center border border-white/20 bg-white/[0.03] px-4 py-2.5 text-sm font-bold uppercase tracking-[0.08em] text-white/88 transition hover:bg-white/[0.08]"
                style={slantClip}
              >
                Open User Guide
              </Link>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
