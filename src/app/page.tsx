import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl">
        <h1 className="text-3xl font-bold tracking-tight">TaskTimer</h1>
        <p className="mt-3 text-zinc-300">
          Track focused time across tasks, review history, and keep progress moving.
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            href="/tasktimer"
            className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            Open TaskTimer
          </Link>
        </div>
      </div>
    </main>
  );
}
