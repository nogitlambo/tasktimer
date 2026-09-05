import { resolveTaskPlannedActivation } from "../lib/schedule-placement";
import type { Task } from "../lib/types";

const MAX_TIMEOUT_MS = 2_147_000_000;

type PlannedStartActivationSchedulerOptions = {
  getTasks: () => Task[];
  onActivation: () => void | Promise<void>;
  onScheduleChanged?: () => void | Promise<void>;
  nowMs?: () => number;
  setTimeoutRef?: (handler: () => void, timeoutMs: number) => number;
  clearTimeoutRef?: (timer: number) => void;
};

function activationMsForTask(task: Task) {
  const activation = resolveTaskPlannedActivation(task);
  if (!activation) return null;
  const [year, month, day] = activation.localDate.split("-").map(Number);
  const [hour, minute] = activation.localTime.split(":").map(Number);
  const value = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(value) ? value : null;
}

function scheduleSnapshot(tasks: Task[]) {
  return tasks
    .flatMap((task) => {
      const activation = resolveTaskPlannedActivation(task);
      return activation ? [`${String(task.id || "")}:${activation.localDate}T${activation.localTime}`] : [];
    })
    .sort();
}

export function createPlannedStartActivationScheduler(options: PlannedStartActivationSchedulerOptions) {
  const nowMs = options.nowMs ?? Date.now;
  const setTimeoutRef = options.setTimeoutRef ?? ((handler, timeoutMs) => window.setTimeout(handler, timeoutMs));
  const clearTimeoutRef = options.clearTimeoutRef ?? ((timer) => window.clearTimeout(timer));
  let timer: number | null = null;
  let nextActivationMs: number | null = null;
  let lastSnapshot: string | null = null;
  let destroyed = false;

  function stopTimer() {
    if (timer != null) clearTimeoutRef(timer);
    timer = null;
  }

  function runActivation() {
    if (destroyed) return;
    stopTimer();
    nextActivationMs = null;
    void Promise.resolve(options.onActivation()).finally(() => {
      if (!destroyed) sync();
    });
  }

  function arm(activationMs: number | null) {
    if (activationMs === nextActivationMs && timer != null) return;
    stopTimer();
    nextActivationMs = activationMs;
    if (activationMs == null) return;
    const delay = Math.max(0, activationMs - nowMs());
    const timeoutMs = Math.min(delay, MAX_TIMEOUT_MS);
    timer = setTimeoutRef(() => {
      timer = null;
      if (destroyed) return;
      if (nextActivationMs != null && nowMs() >= nextActivationMs) runActivation();
      else sync();
    }, timeoutMs);
  }

  function sync() {
    if (destroyed) return;
    const tasks = options.getTasks() || [];
    const snapshot = scheduleSnapshot(tasks).join("|");
    const scheduleChanged = lastSnapshot != null && snapshot !== lastSnapshot;
    lastSnapshot = snapshot;
    const currentMs = nowMs();
    const futureActivations = tasks
      .map(activationMsForTask)
      .filter((value): value is number => value != null && value > currentMs);
    arm(futureActivations.length ? Math.min(...futureActivations) : null);
    if (scheduleChanged) void options.onScheduleChanged?.();
  }

  function handleResume() {
    if (destroyed) return;
    if (nextActivationMs != null && nowMs() >= nextActivationMs) runActivation();
    else sync();
  }

  function destroy() {
    destroyed = true;
    stopTimer();
    nextActivationMs = null;
  }

  return { sync, handleResume, destroy };
}
