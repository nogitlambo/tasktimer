import Link from "next/link";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0d0f13] px-6 text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 50% 40%, rgba(53,232,255,.14), transparent 70%), radial-gradient(38% 32% at 50% 65%, rgba(0,140,255,.10), transparent 72%), #0d0f13",
        }}
      />

      <section className="relative w-full max-w-xl border border-white/15 bg-black/35 p-8 text-center sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8ff6ff]">Error 404</p>
        <h1 className="mt-3 text-3xl font-extrabold uppercase tracking-[0.08em] sm:text-4xl">Page Not Found</h1>
        <p className="mx-auto mt-4 max-w-[42ch] text-sm text-white/80 sm:text-base">
          The page you requested does not exist or may have been moved.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="min-w-[180px] border border-[#35e8ff]/70 bg-transparent px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-[#8ff6ff] transition hover:bg-gradient-to-r hover:from-[#2ea7ff] hover:via-[#35e8ff] hover:to-[#00cfc8] hover:text-[#04131c]"
            style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
          >
            Go Home
          </Link>
          <Link
            href="/tasktimer?page=dashboard"
            className="min-w-[180px] border border-white/20 bg-black/30 px-5 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] text-white transition hover:border-[#35e8ff]/35"
            style={{ clipPath: "polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)" }}
          >
            Open TaskTimer
          </Link>
        </div>
      </section>
    </main>
  );
}
