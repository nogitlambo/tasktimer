export type DashboardRenderPhase = "full" | "live";

export type DashboardRenderMetric = {
  phase: DashboardRenderPhase;
  durationMs: number;
  signature: string;
  skipped: boolean;
  atMs: number;
};

declare global {
  interface Window {
    __taskTimerDashboardPerf__?: {
      metrics: DashboardRenderMetric[];
      counters: {
        fullRenders: number;
        liveRenders: number;
        liveSkips: number;
      };
    };
  }
}

const PERF_WINDOW_KEY = "__taskTimerDashboardPerf__";
const MAX_METRICS = 100;

function ensurePerfState() {
  if (typeof window === "undefined") return null;
  if (!window[PERF_WINDOW_KEY]) {
    window[PERF_WINDOW_KEY] = {
      metrics: [],
      counters: {
        fullRenders: 0,
        liveRenders: 0,
        liveSkips: 0,
      },
    };
  }
  return window[PERF_WINDOW_KEY]!;
}

export function recordDashboardRenderMetric(metric: DashboardRenderMetric): void {
  const perf = ensurePerfState();
  if (!perf) return;
  perf.metrics.push(metric);
  if (perf.metrics.length > MAX_METRICS) perf.metrics.splice(0, perf.metrics.length - MAX_METRICS);
  if (metric.phase === "full") perf.counters.fullRenders += 1;
  if (metric.phase === "live" && metric.skipped) perf.counters.liveSkips += 1;
  if (metric.phase === "live" && !metric.skipped) perf.counters.liveRenders += 1;
}

export function measureDashboardRender<T>(
  phase: DashboardRenderPhase,
  signature: string,
  skipped: boolean,
  run: () => T,
): T {
  const start = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
  try {
    return run();
  } finally {
    const end = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
    recordDashboardRenderMetric({
      phase,
      durationMs: Math.max(0, end - start),
      signature,
      skipped,
      atMs: Date.now(),
    });
  }
}
