type ListenerRecord = {
  el: EventTarget;
  type: string;
  fn: EventListenerOrEventListenerObject;
  opts?: boolean | AddEventListenerOptions;
};

export function createTaskTimerRuntime() {
  const listeners: ListenerRecord[] = [];

  const on = (
    el: EventTarget | null | undefined,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions
  ) => {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    listeners.push({ el, type, fn, opts });
  };

  return {
    listeners,
    on,
    destroyed: false,
    tickTimeout: null as number | null,
    tickRaf: null as number | null,
    newTaskHighlightTimer: null as number | null,
    eventsWired: false,
    tickStarted: false,
    removeCapBackListener: null as null | (() => void),
    removeCapAppStateListener: null as null | (() => void),
    removeCloudTaskCollectionListener: null as null | (() => void),
    removeAuthStateListener: null as null | (() => void),
  };
}

export type TaskTimerRuntime = ReturnType<typeof createTaskTimerRuntime>;

type DestroyTaskTimerRuntimeOptions = {
  runtime: TaskTimerRuntime;
  deferredCloudRefreshTimer: number | null;
  checkpointToastAutoCloseTimer: number | null;
  checkpointToastCountdownRefreshTimer: number | null;
  checkpointBeepQueueTimer: number | null;
  checkpointRepeatCycleTimer: number | null;
  unsubscribeCachedPreferences: () => void;
};

export function destroyTaskTimerRuntime(opts: DestroyTaskTimerRuntimeOptions) {
  const {
    runtime,
    deferredCloudRefreshTimer,
    checkpointToastAutoCloseTimer,
    checkpointToastCountdownRefreshTimer,
    checkpointBeepQueueTimer,
    checkpointRepeatCycleTimer,
    unsubscribeCachedPreferences,
  } = opts;

  runtime.destroyed = true;
  if (runtime.tickTimeout != null) window.clearTimeout(runtime.tickTimeout);
  if (runtime.tickRaf != null) window.cancelAnimationFrame(runtime.tickRaf);
  if (deferredCloudRefreshTimer != null) window.clearTimeout(deferredCloudRefreshTimer);
  if (checkpointToastAutoCloseTimer != null) window.clearTimeout(checkpointToastAutoCloseTimer);
  if (checkpointToastCountdownRefreshTimer != null) window.clearTimeout(checkpointToastCountdownRefreshTimer);
  if (checkpointBeepQueueTimer != null) window.clearTimeout(checkpointBeepQueueTimer);
  if (checkpointRepeatCycleTimer != null) window.clearTimeout(checkpointRepeatCycleTimer);
  if (runtime.removeCapBackListener) {
    try {
      runtime.removeCapBackListener();
    } catch {
      // ignore
    }
    runtime.removeCapBackListener = null;
  }
  if (runtime.removeCapAppStateListener) {
    try {
      runtime.removeCapAppStateListener();
    } catch {
      // ignore
    }
    runtime.removeCapAppStateListener = null;
  }
  if (runtime.removeCloudTaskCollectionListener) {
    try {
      runtime.removeCloudTaskCollectionListener();
    } catch {
      // ignore
    }
    runtime.removeCloudTaskCollectionListener = null;
  }
  if (runtime.removeAuthStateListener) {
    try {
      runtime.removeAuthStateListener();
    } catch {
      // ignore
    }
    runtime.removeAuthStateListener = null;
  }
  for (const l of runtime.listeners) {
    try {
      l.el.removeEventListener(l.type, l.fn, l.opts);
    } catch {
      // ignore
    }
  }
  try {
    unsubscribeCachedPreferences();
  } catch {
    // ignore
  }
}
