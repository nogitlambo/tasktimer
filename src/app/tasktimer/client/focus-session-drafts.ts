export type FocusSessionDraftStorage = {
  load: () => Record<string, string>;
  persist: (drafts: Record<string, string>) => void;
};

export type FocusSessionDraftState = {
  getDrafts: () => Record<string, string>;
  setDrafts: (drafts: Record<string, string>) => void;
  getActiveTaskId: () => string | null;
  getPendingSaveTimer: () => number | null;
  setPendingSaveTimer: (timer: number | null) => void;
  getInputValue: () => string;
  setInputValue?: (value: string) => void;
  setSectionOpen?: (open: boolean) => void;
};

export type FocusSessionDrafts = ReturnType<typeof createFocusSessionDrafts>;

function normalizeTaskId(taskId?: string | null) {
  return String(taskId || "").trim();
}

function normalizeDrafts(source: Record<string, unknown> | null | undefined) {
  const next: Record<string, string> = {};
  Object.keys(source || {}).forEach((taskId) => {
    const taskKey = normalizeTaskId(taskId);
    const value = String(source?.[taskId] || "").trim();
    if (taskKey && value) next[taskKey] = value;
  });
  return next;
}

export function createLocalStorageFocusSessionDraftStorage(storageKey: string): FocusSessionDraftStorage {
  return {
    load() {
      if (typeof window === "undefined") return {};
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") return {};
        return normalizeDrafts(parsed);
      } catch {
        return {};
      }
    },
    persist(drafts) {
      if (typeof window === "undefined") return;
      try {
        const next = normalizeDrafts(drafts);
        if (Object.keys(next).length) window.localStorage.setItem(storageKey, JSON.stringify(next));
        else window.localStorage.removeItem(storageKey);
      } catch {
        // ignore localStorage failures
      }
    },
  };
}

export function createFocusSessionDrafts(state: FocusSessionDraftState, storage: FocusSessionDraftStorage) {
  function load() {
    return storage.load();
  }

  function persist() {
    storage.persist(state.getDrafts());
  }

  function setDraft(taskId: string, noteRaw: string) {
    const taskKey = normalizeTaskId(taskId);
    if (!taskKey) return;
    const nextDrafts = { ...(state.getDrafts() || {}) };
    const nextValue = String(noteRaw || "").trim();
    if (nextValue) nextDrafts[taskKey] = nextValue;
    else delete nextDrafts[taskKey];
    state.setDrafts(nextDrafts);
    storage.persist(nextDrafts);
  }

  function getDraft(taskId: string) {
    const taskKey = normalizeTaskId(taskId);
    if (!taskKey) return "";
    return String(state.getDrafts()[taskKey] || "");
  }

  function clearDraft(taskId: string) {
    const taskKey = normalizeTaskId(taskId);
    const current = state.getDrafts();
    if (!taskKey || !current[taskKey]) return;
    const nextDrafts = { ...current };
    delete nextDrafts[taskKey];
    state.setDrafts(nextDrafts);
    storage.persist(nextDrafts);
  }

  function syncInput(taskId: string | null) {
    state.setInputValue?.(taskId ? getDraft(taskId) : "");
  }

  function syncAccordion(taskId: string | null) {
    state.setSectionOpen?.(!!normalizeTaskId(taskId));
  }

  function flushPendingSave(taskId?: string | null) {
    const pendingTaskId = normalizeTaskId(taskId || state.getActiveTaskId());
    const timer = state.getPendingSaveTimer();
    if (timer != null) {
      globalThis.clearTimeout(timer);
      state.setPendingSaveTimer(null);
    }
    if (!pendingTaskId) return;
    if (normalizeTaskId(state.getActiveTaskId()) === pendingTaskId) {
      setDraft(pendingTaskId, state.getInputValue());
    }
  }

  function getLiveValue(taskId?: string | null) {
    const taskKey = normalizeTaskId(taskId);
    if (!taskKey) return "";
    if (normalizeTaskId(state.getActiveTaskId()) !== taskKey) return "";
    return String(state.getInputValue() || "").trim();
  }

  function captureSnapshot(taskId?: string | null) {
    const taskKey = normalizeTaskId(taskId);
    if (!taskKey) return "";
    flushPendingSave(taskKey);
    const liveNote = getLiveValue(taskKey);
    if (liveNote) {
      setDraft(taskKey, liveNote);
      return liveNote;
    }
    return getDraft(taskKey);
  }

  function captureResetActionSnapshot(taskId?: string | null) {
    const taskKey = normalizeTaskId(taskId);
    if (!taskKey) return "";
    const liveNote = getLiveValue(taskKey);
    if (liveNote) {
      setDraft(taskKey, liveNote);
      return liveNote;
    }
    return captureSnapshot(taskKey);
  }

  return {
    load,
    persist,
    setDraft,
    getDraft,
    clearDraft,
    syncInput,
    syncAccordion,
    flushPendingSave,
    getLiveValue,
    captureSnapshot,
    captureResetActionSnapshot,
  };
}
