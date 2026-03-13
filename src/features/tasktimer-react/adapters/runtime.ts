export interface TaskTimerRuntimeAdapter {
  now(): number;
  startTicker(onTick: (nowMs: number) => void): () => void;
}

export function createBrowserTaskTimerRuntime(): TaskTimerRuntimeAdapter {
  return {
    now() {
      return Date.now();
    },
    startTicker(onTick) {
      const tick = () => onTick(Date.now());
      tick();
      const intervalId = window.setInterval(tick, 250);
      return () => window.clearInterval(intervalId);
    },
  };
}
