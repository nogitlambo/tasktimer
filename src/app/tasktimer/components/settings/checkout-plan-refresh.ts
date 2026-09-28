import type { TaskTimerPlan } from "../../lib/entitlements";

export function startCheckoutPlanRefresh(options: {
  loadPlan: () => Promise<TaskTimerPlan>;
  onConfirmed: (plan: TaskTimerPlan) => void;
  onPending: () => void;
}) {
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(deadline);
  };
  const deadline = setTimeout(() => {
    stop();
    options.onPending();
  }, 30_000);
  const read = async () => {
    try {
      const plan = await options.loadPlan();
      if (stopped) return;
      if (plan !== "free") {
        stop();
        options.onConfirmed(plan);
        return;
      }
    } catch {
      // Temporary offline/server failures share the bounded retry window.
    }
    if (!stopped) retry = setTimeout(() => void read(), 2_000);
  };
  void read();
  return stop;
}
