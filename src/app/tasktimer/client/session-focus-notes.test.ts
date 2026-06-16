import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../lib/types";
import type { TaskTimerSessionContext } from "./context";
import type { TaskTimerRuntime } from "./runtime";
import type { TaskTimerSharedTaskApi } from "./task-shared";
import {
  clearSessionNoteAttachmentUploadStatus,
  createTaskTimerSession,
  isHistoryEntryNoteOverlayEditor,
  resolveRichNoteFileInputHost,
  showSessionNoteAttachmentUploadError,
  showSessionNoteAttachmentUploadStatus,
} from "./session";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

function createClassList(initial: string[] = []) {
  const values = new Set(initial);
  return {
    add: (...names: string[]) => names.forEach((name) => values.add(name)),
    remove: (...names: string[]) => names.forEach((name) => values.delete(name)),
    toggle: (name: string, force?: boolean) => {
      const shouldHave = force == null ? !values.has(name) : !!force;
      if (shouldHave) values.add(name);
      else values.delete(name);
      return shouldHave;
    },
    contains: (name: string) => values.has(name),
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function createElementStub() {
  const target = new EventTarget() as EventTarget & Record<string, unknown>;
  const attrs = new Map<string, string>();
  target.style = {
    height: "",
    overflowY: "",
    setProperty: () => {},
    removeProperty: () => {},
  };
  target.dataset = {};
  target.classList = createClassList();
  target.textContent = "";
  target.value = "";
  target.scrollHeight = 0;
  target.scrollTop = 0;
  target.scrollLeft = 0;
  target.ownerDocument = null;
  target.focus = () => {};
  target.blur = () => {};
  target.contains = (node: unknown) => node === target;
  target.setAttribute = (name: string, value: string) => {
    attrs.set(name, value);
  };
  target.getAttribute = (name: string) => attrs.get(name) ?? null;
  return target;
}

function createAttachmentContainerStub() {
  const attrs = new Map<string, string>();
  const prependedNodes: Array<Record<string, unknown> & { remove: () => void }> = [];
  const container = {
    innerHTML: "",
    ownerDocument: {
      createElement: vi.fn(() => {
        const node: Record<string, unknown> & { remove: () => void } = {
          className: "",
          textContent: "",
          setAttribute: vi.fn((name: string, value: string) => {
            node[name] = value;
          }),
          remove: vi.fn(() => {
            const index = prependedNodes.indexOf(node);
            if (index >= 0) prependedNodes.splice(index, 1);
          }),
        };
        return node;
      }),
    },
    setAttribute: vi.fn((name: string, value: string) => {
      attrs.set(name, value);
    }),
    removeAttribute: vi.fn((name: string) => {
      attrs.delete(name);
    }),
    getAttribute: vi.fn((name: string) => attrs.get(name) ?? null),
    prepend: vi.fn((node: Record<string, unknown> & { remove: () => void }) => {
      prependedNodes.unshift(node);
    }),
    querySelector: vi.fn((selector: string) => {
      if (selector === ".sessionNoteAttachmentStatus") {
        return prependedNodes.find((node) => node.className === "sessionNoteAttachmentStatus") || null;
      }
      return null;
    }),
    querySelectorAll: vi.fn((selector: string) => {
      if (selector === ".sessionNoteAttachmentStatus") {
        return prependedNodes.filter((node) => node.className === "sessionNoteAttachmentStatus");
      }
      return [];
    }),
    getStatusNode: () => prependedNodes.find((node) => node.className === "sessionNoteAttachmentStatus") || null,
    getErrorNode: () => prependedNodes.find((node) => node.className === "sessionNoteAttachmentError") || null,
  };
  return container;
}

function createHarness(overrides?: {
  task?: Task;
  drafts?: Record<string, string>;
  liveSessionsByTaskId?: Record<string, { note?: string }>;
  focusModeTaskId?: string | null;
  focusSessionNotesScrollHeight?: number;
  focusSessionNotesMinHeight?: string;
  focusSessionNotesMaxHeight?: string;
  windowInnerHeight?: number;
}) {
  const storage = createStorage();
  if (overrides?.drafts && Object.keys(overrides.drafts).length) {
    storage.setItem("tasktimer:focus-session-notes", JSON.stringify(overrides.drafts));
  }

  const body = {
    classList: createClassList(),
    scrollTop: 0,
    scrollLeft: 0,
    appendChild: () => {},
  };
  const documentStub = {
    body,
    documentElement: { scrollTop: 0, scrollLeft: 0 },
    activeElement: null,
  } as {
    body: typeof body;
    documentElement: { scrollTop: number; scrollLeft: number };
    activeElement: null;
    defaultView?: unknown;
  };
  const windowTarget = new EventTarget();
  const scrollCalls: Array<[number, number]> = [];
  const frameCallbacks: FrameRequestCallback[] = [];
  const windowStub = {
    innerHeight: overrides?.windowInnerHeight ?? 1000,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      frameCallbacks.push(cb);
      return frameCallbacks.length;
    },
    scrollTo: (left: number, top: number) => {
      scrollCalls.push([left, top]);
    },
    localStorage: storage,
    getComputedStyle: () => ({
      minHeight: overrides?.focusSessionNotesMinHeight ?? "96px",
      maxHeight: overrides?.focusSessionNotesMaxHeight ?? "220px",
    }),
    addEventListener: (type: string, handler: EventListener) => windowTarget.addEventListener(type, handler),
    removeEventListener: (type: string, handler: EventListener) => windowTarget.removeEventListener(type, handler),
    dispatchEvent: (event: Event) => windowTarget.dispatchEvent(event),
  };
  documentStub.defaultView = windowStub;
  vi.stubGlobal("document", documentStub);
  vi.stubGlobal("window", windowStub);

  const focusSessionNotesInput = createElementStub();
  focusSessionNotesInput.scrollHeight = overrides?.focusSessionNotesScrollHeight ?? 0;
  const focusSessionNotesSection = createElementStub();
  const focusSessionNotesSavedText = createElementStub();
  const focusModeScreen = createElementStub();
  const focusModeParent = createElementStub();
  const focusModeGrandparent = createElementStub();
  const focusTaskName = createElementStub();
  const focusTimerDays = createElementStub();
  const focusTimerClock = createElementStub();
  const focusDialHint = createElementStub();
  const focusModeBackBtn = createElementStub();
  const focusDial = createElementStub();
  const focusResetBtn = createElementStub();
  focusSessionNotesInput.ownerDocument = documentStub;
  focusSessionNotesSection.ownerDocument = documentStub;
  focusModeScreen.ownerDocument = documentStub;
  focusModeScreen.parentElement = focusModeParent;
  focusModeParent.parentElement = focusModeGrandparent;
  focusModeGrandparent.parentElement = null;

  const calls: string[] = [];
  const tasks = [overrides?.task || task()];
  let drafts = overrides?.drafts || {};
  let focusModeTaskId = overrides?.focusModeTaskId ?? null;
  const liveSessionsByTaskId = overrides?.liveSessionsByTaskId || {};
  let focusSessionNoteSaveTimer: number | null = null;

  const session = createTaskTimerSession({
    els: {
      focusSessionNotesInput: focusSessionNotesInput as unknown as HTMLTextAreaElement,
      focusSessionNotesSection: focusSessionNotesSection as unknown as HTMLElement,
      focusSessionNotesSavedText: focusSessionNotesSavedText as unknown as HTMLElement,
      focusModeScreen: focusModeScreen as unknown as HTMLElement,
      focusTaskName: focusTaskName as unknown as HTMLElement,
      focusTimerDays: focusTimerDays as unknown as HTMLElement,
      focusTimerClock: focusTimerClock as unknown as HTMLElement,
      focusDialHint: focusDialHint as unknown as HTMLElement,
      focusModeBackBtn: focusModeBackBtn as unknown as HTMLButtonElement,
      focusDial: focusDial as unknown as HTMLButtonElement,
      focusResetBtn: focusResetBtn as unknown as HTMLButtonElement,
      taskList: null,
      footerTasksBtn: null,
      openAddTaskBtn: null,
      focusCheckpointRing: null,
      focusCheckpointToggle: null,
      focusCheckpointLog: null,
      focusCheckpointLogEmpty: null,
      focusCheckpointLogList: null,
      focusInsightTodayDelta: null,
      focusInsightWeekDelta: null,
      focusInsightBest: null,
      focusInsightWeekday: null,
      focusInsightProductivityPeriod: null,
      timeGoalCompleteOverlay: null,
      timeGoalCompleteSaveNoteOverlay: null,
      timeGoalCompleteNoteOverlay: null,
      timeGoalCompleteLaunchNextBtn: null,
      timeGoalCompleteNextTasks: null,
      timeGoalCompleteNextTaskGrid: null,
      timeGoalCompleteConfettiStage: null,
      timeGoalCompleteCloseBtn: null,
      checkpointToastHost: null,
      timeGoalCompleteNoteInput: null,
    },
    runtime: { destroyed: false, tickRaf: null, tickTimeout: null } as unknown as TaskTimerRuntime,
    storageKeys: {
      FOCUS_SESSION_NOTES_KEY: "tasktimer:focus-session-notes",
      TIME_GOAL_PENDING_FLOW_KEY: "tasktimer:time-goal",
    },
    sharedTasks: {
      milestoneUnitSec: () => 3600,
    } as unknown as TaskTimerSharedTaskApi,
    getTasks: () => tasks,
    getCheckpointToastQueue: () => [],
    getActiveCheckpointToast: () => null,
    setActiveCheckpointToast: () => {},
    getCheckpointAutoResetDirty: () => false,
    setCheckpointAutoResetDirty: () => {},
    getFocusModeTaskId: () => focusModeTaskId,
    setFocusModeTaskId: (value: string | null) => {
      focusModeTaskId = value;
    },
    getFocusModeTaskName: () => "",
    setFocusModeTaskName: () => {},
    getCurrentAppPage: () => "tasks",
    renderDashboardLiveWidgets: () => {},
    render: () => {},
    save: () => {},
    syncRewardSessionTrackerForTask: () => {},
    syncLiveSessionForTask: () => {},
    formatMainTaskElapsedHtml: () => "",
    getDynamicColorsEnabled: () => false,
    fillBackgroundForPct: () => "#00ffff",
    getModeColor: () => "#00ffff",
    sortMilestones: (milestones: Task["milestones"]) => milestones,
    getCheckpointBaselineSecByTaskId: () => ({}),
    getCheckpointFiredKeysByTaskId: () => ({}),
    getCheckpointAlertSoundEnabled: () => false,
    getCheckpointAlertToastEnabled: () => false,
    getCheckpointAlertSoundMode: () => "once",
    getCheckpointAlertToastMode: () => "auto5s",
    getCheckpointRepeatStopAtMs: () => 0,
    setCheckpointRepeatStopAtMs: () => {},
    getCheckpointRepeatCycleTimer: () => null,
    setCheckpointRepeatCycleTimer: () => {},
    setCheckpointRepeatActiveTaskId: () => {},
    getCheckpointRepeatActiveTaskId: () => null,
    getCheckpointToastAutoCloseTimer: () => null,
    setCheckpointToastAutoCloseTimer: () => {},
    getCheckpointToastCountdownRefreshTimer: () => null,
    setCheckpointToastCountdownRefreshTimer: () => {},
    getCheckpointBeepAudio: () => null,
    setCheckpointBeepAudio: () => {},
    getCheckpointBeepQueueCount: () => 0,
    setCheckpointBeepQueueCount: () => {},
    getCheckpointBeepQueueTimer: () => null,
    setCheckpointBeepQueueTimer: () => {},
    broadcastCheckpointAlertMute: () => {},
    hasEntitlement: () => false,
    on: (target: EventTarget | null | undefined, type: string, handler: EventListenerOrEventListenerObject) =>
      target?.addEventListener?.(type, handler as EventListener),
    openOverlay: () => {},
    closeOverlay: () => {},
    navigateToAppRoute: () => {},
    normalizedPathname: () => "/tasklaunch",
    savePendingTaskJump: () => {},
    jumpToTaskById: () => {},
    escapeHtmlUI: (value: unknown) => String(value),
    formatTime: (value: number) => String(value),
    formatMainTaskElapsed: () => "",
    normalizeHistoryTimestampMs: () => 0,
    getHistoryEntryNote: () => "",
    getHistoryByTaskId: () => ({}),
    getWeekStarting: () => "mon",
    syncSharedTaskSummariesForTask: async () => {},
    startTask: () => {},
    stopTask: () => {},
    resetTask: () => {},
    resetTaskStateImmediate: () => {},
    clearFocusSessionDraft: () => {},
    setFocusSessionDraft: () => {},
    syncFocusSessionNotesInput: () => {},
    syncFocusSessionNotesAccordion: () => {},
    getFocusSessionNotesByTaskId: () => drafts,
    setFocusSessionNotesByTaskId: (value: Record<string, string>) => {
      drafts = value;
    },
    getFocusSessionNoteSaveTimer: () => focusSessionNoteSaveTimer,
    setFocusSessionNoteSaveTimer: (value: number | null) => {
      focusSessionNoteSaveTimer = value;
    },
    getDeferredFocusModeTimeGoalModals: () => [],
    setDeferredFocusModeTimeGoalModals: () => {},
    getTimeGoalModalTaskId: () => null,
    setTimeGoalModalTaskId: () => {},
    getTimeGoalModalFrozenElapsedMs: () => 0,
    setTimeGoalModalFrozenElapsedMs: () => {},
    getLiveSessionsByTaskId: () => liveSessionsByTaskId,
    getTaskTimeGoalAction: () => "confirmModal",
    getFocusShowCheckpoints: () => false,
    setFocusShowCheckpoints: () => {},
    setFocusCheckpointSig: () => {},
    getInteractionHapticsEnabled: () => false,
    getInteractionHapticsIntensity: () => "medium",
    getOptimalProductivityStartTime: () => "09:00",
    getOptimalProductivityEndTime: () => "17:00",
    getOptimalProductivityDays: () => ({ mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false }),
    renderDashboardWidgets: () => {},
    upsertLiveSession: (entry: Task, opts?: { note?: string }) => calls.push(`upsert:${String(entry.id || "")}:${String(opts?.note || "").trim()}`),
    getTaskElapsedMs: (entry: Task) => Math.max(0, Number(entry.accumulatedMs || 0) || 0),
    closeTopOverlayIfOpen: () => false,
    getTimeGoalReminderAtMsByTaskId: () => ({}),
  } as unknown as TaskTimerSessionContext);

  return {
    session,
    calls,
    documentStub,
    focusSessionNotesInput,
    focusModeScreen,
    focusModeParent,
    focusModeGrandparent,
    windowStub,
    scrollCalls,
    getDrafts: () => drafts,
    getBodyClassList: () => body.classList,
    runNextAnimationFrame: () => frameCallbacks.shift()?.(0),
  };
}

describe("task timer session focus notes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks the session note attachment block as uploading with a real status row", () => {
    const container = createAttachmentContainerStub();

    expect(showSessionNoteAttachmentUploadStatus(container as unknown as HTMLElement)).toBe(true);

    expect(container.getAttribute("data-uploading")).toBe("true");
    expect(container.getAttribute("data-empty")).toBe("false");
    expect(container.prepend).toHaveBeenCalledTimes(1);
    expect(container.getStatusNode()?.className).toBe("sessionNoteAttachmentStatus");
    expect(container.getStatusNode()?.role).toBe("status");
    expect(container.getStatusNode()?.textContent).toBe("Uploading...");
  });

  it("clears the upload status row without reopening an overlay", () => {
    const container = createAttachmentContainerStub();
    const openOverlay = vi.fn();

    showSessionNoteAttachmentUploadStatus(container as unknown as HTMLElement);
    expect(clearSessionNoteAttachmentUploadStatus(container as unknown as HTMLElement)).toBe(true);

    expect(container.getAttribute("data-uploading")).toBeNull();
    expect(container.getStatusNode()).toBeNull();
    expect(openOverlay).not.toHaveBeenCalled();
  });

  it("replaces the upload status with an attachment error row after a failed upload", () => {
    const container = createAttachmentContainerStub();

    showSessionNoteAttachmentUploadStatus(container as unknown as HTMLElement);
    expect(showSessionNoteAttachmentUploadError(container as unknown as HTMLElement, "Upload failed")).toBe(true);

    expect(container.getAttribute("data-uploading")).toBeNull();
    expect(container.getAttribute("data-empty")).toBe("false");
    expect(container.getStatusNode()).toBeNull();
    expect(container.getErrorNode()?.className).toBe("sessionNoteAttachmentError");
    expect(container.getErrorNode()?.textContent).toBe("Upload failed");
  });

  it("detects session summary attachment editors without treating unrelated editors as modal editors", () => {
    const overlay = { id: "historyEntryNoteOverlay" } as HTMLElement;
    const historyEditor = {
      closest: vi.fn((selector: string) => (selector === "#historyEntryNoteOverlay" ? overlay : null)),
    } as unknown as HTMLElement;
    const unrelatedEditor = {
      closest: vi.fn(() => null),
    } as unknown as HTMLElement;

    expect(isHistoryEntryNoteOverlayEditor(historyEditor)).toBe(true);
    expect(isHistoryEntryNoteOverlayEditor(unrelatedEditor)).toBe(false);
  });

  it("places temporary file inputs inside the active overlay when attaching from a modal editor", () => {
    const overlay = { id: "historyEntryNoteOverlay" } as HTMLElement;
    const body = { id: "body" } as unknown as HTMLElement;
    const editor = {
      closest: vi.fn((selector: string) => (selector === ".overlay" ? overlay : null)),
    } as unknown as HTMLElement;

    expect(resolveRichNoteFileInputHost(editor, { body })).toBe(overlay);
    expect(resolveRichNoteFileInputHost(null, { body })).toBe(body);
  });

  it("autosaves running focus notes locally and to the live session", () => {
    const harness = createHarness({
      task: task({ running: true, accumulatedMs: 12_000 }),
      focusModeTaskId: "task-1",
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = " synced note ";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(250);

    expect(harness.getDrafts()).toEqual({ "task-1": "synced note" });
    expect(harness.calls).toContain("upsert:task-1:synced note");

    harness.focusSessionNotesInput.value = "";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(250);

    expect(harness.getDrafts()).toEqual({});
    expect(harness.calls).toContain("upsert:task-1:");
  });

  it("autosizes focus notes to the typed content height", () => {
    const harness = createHarness({
      focusModeTaskId: "task-1",
      focusSessionNotesScrollHeight: 120,
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = "line 1\nline 2\nline 3";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));

    const style = harness.focusSessionNotesInput.style as Record<string, string>;
    expect(style.height).toBe("120px");
    expect(style.overflowY).toBe("hidden");
  });

  it("shrinks focus notes back to the compact height when content is deleted", () => {
    const harness = createHarness({
      focusModeTaskId: "task-1",
      focusSessionNotesScrollHeight: 96,
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = "line 1\nline 2\nline 3";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));
    harness.focusSessionNotesInput.scrollHeight = 12;
    harness.focusSessionNotesInput.value = "";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));

    const style = harness.focusSessionNotesInput.style as Record<string, string>;
    expect(style.height).toBe("96px");
    expect(style.overflowY).toBe("hidden");
  });

  it("uses the responsive focus notes minimum height when CSS lowers it", () => {
    const harness = createHarness({
      focusModeTaskId: "task-1",
      focusSessionNotesMinHeight: "76px",
      focusSessionNotesScrollHeight: 12,
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = "";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));

    const style = harness.focusSessionNotesInput.style as Record<string, string>;
    expect(style.height).toBe("76px");
    expect(style.overflowY).toBe("hidden");
  });

  it("prefers the live-session note over a local draft when focus mode opens", () => {
    const harness = createHarness({
      task: task({ running: true }),
      drafts: { "task-1": "local draft" },
      liveSessionsByTaskId: { "task-1": { note: "cloud note" } },
      focusSessionNotesScrollHeight: 84,
    });

    harness.session.openFocusMode(0);

    expect(harness.getBodyClassList().contains("isFocusModeOpen")).toBe(true);
    expect(harness.focusSessionNotesInput.value).toBe("cloud note");
    expect((harness.focusSessionNotesInput.style as Record<string, string>).height).toBe("96px");
  });

  it("snaps running task focus mode to the top after open frames", () => {
    const harness = createHarness({
      task: task({ running: true }),
      focusModeTaskId: null,
    });
    harness.focusModeScreen.scrollTop = 320;
    harness.focusModeScreen.scrollLeft = 18;
    harness.focusModeParent.scrollTop = 410;
    harness.focusModeParent.scrollLeft = 22;
    harness.focusModeGrandparent.scrollTop = 275;
    harness.focusModeGrandparent.scrollLeft = 12;
    harness.documentStub.documentElement.scrollTop = 250;
    harness.documentStub.documentElement.scrollLeft = 9;
    harness.documentStub.body.scrollTop = 140;
    harness.documentStub.body.scrollLeft = 4;

    harness.session.openFocusMode(0);

    expect(harness.focusModeScreen.scrollTop).toBe(0);
    expect(harness.focusModeScreen.scrollLeft).toBe(0);
    expect(harness.focusModeParent.scrollTop).toBe(0);
    expect(harness.focusModeParent.scrollLeft).toBe(0);
    expect(harness.focusModeGrandparent.scrollTop).toBe(0);
    expect(harness.focusModeGrandparent.scrollLeft).toBe(0);
    expect(harness.documentStub.documentElement.scrollTop).toBe(0);
    expect(harness.documentStub.documentElement.scrollLeft).toBe(0);
    expect(harness.documentStub.body.scrollTop).toBe(0);
    expect(harness.documentStub.body.scrollLeft).toBe(0);
    expect(harness.scrollCalls).toEqual([[0, 0]]);

    harness.focusModeScreen.scrollTop = 75;
    harness.focusModeParent.scrollTop = 95;
    harness.focusModeGrandparent.scrollTop = 115;
    harness.documentStub.documentElement.scrollTop = 60;
    harness.documentStub.body.scrollTop = 45;
    harness.runNextAnimationFrame();

    expect(harness.focusModeScreen.scrollTop).toBe(0);
    expect(harness.focusModeParent.scrollTop).toBe(0);
    expect(harness.focusModeGrandparent.scrollTop).toBe(0);
    expect(harness.documentStub.documentElement.scrollTop).toBe(0);
    expect(harness.documentStub.body.scrollTop).toBe(0);

    harness.focusModeScreen.scrollTop = 35;
    harness.focusModeParent.scrollTop = 55;
    harness.focusModeGrandparent.scrollTop = 65;
    harness.documentStub.documentElement.scrollTop = 25;
    harness.documentStub.body.scrollTop = 15;
    harness.runNextAnimationFrame();

    expect(harness.focusModeScreen.scrollTop).toBe(0);
    expect(harness.focusModeParent.scrollTop).toBe(0);
    expect(harness.focusModeGrandparent.scrollTop).toBe(0);
    expect(harness.documentStub.documentElement.scrollTop).toBe(0);
    expect(harness.documentStub.body.scrollTop).toBe(0);
    expect(harness.scrollCalls).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it("falls back to the local draft when no live-session note exists", () => {
    const harness = createHarness({
      drafts: { "task-1": "local draft" },
    });

    harness.session.openFocusMode(0);

    expect(harness.focusSessionNotesInput.value).toBe("local draft");
  });

  it("caps long focus notes and enables textarea scrolling", () => {
    const harness = createHarness({
      focusModeTaskId: "task-1",
      focusSessionNotesScrollHeight: 420,
      focusSessionNotesMaxHeight: "160px",
      windowInnerHeight: 1000,
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = "long note";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));

    const style = harness.focusSessionNotesInput.style as Record<string, string>;
    expect(style.height).toBe("160px");
    expect(style.overflowY).toBe("auto");
  });

  it("uses half the viewport as the fallback cap when CSS allows taller focus notes", () => {
    const harness = createHarness({
      focusModeTaskId: "task-1",
      focusSessionNotesScrollHeight: 800,
      focusSessionNotesMaxHeight: "620px",
      windowInnerHeight: 1000,
    });

    harness.session.registerSessionEvents();
    harness.focusSessionNotesInput.value = "long note";
    harness.focusSessionNotesInput.dispatchEvent(new Event("input"));

    const style = harness.focusSessionNotesInput.style as Record<string, string>;
    expect(style.height).toBe("500px");
    expect(style.overflowY).toBe("auto");
  });
});
