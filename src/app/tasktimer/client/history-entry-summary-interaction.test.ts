import { describe, expect, it, vi } from "vitest";
import { DEFAULT_REWARD_PROGRESS, type RewardLedgerEntry, type RewardProgressV1 } from "../lib/rewards";
import type { Task } from "../lib/types";
import { createHistoryEntrySummaryInteraction } from "./history-entry-summary-interaction";
import { TASKTIMER_PENDING_XP_AWARD_EVENT } from "./xp-award-events";

function classListStub() {
  const values = new Set<string>();
  return {
    add: (name: string) => values.add(name),
    remove: (name: string) => values.delete(name),
    toggle: (name: string, force?: boolean) => {
      const next = force ?? !values.has(name);
      if (next) values.add(name);
      else values.delete(name);
      return next;
    },
    contains: (name: string) => values.has(name),
  };
}

function elementStub(id = "") {
  const classList = classListStub();
  return {
    id,
    dataset: {} as Record<string, string>,
    style: { display: "" },
    textContent: "",
    innerHTML: "",
    classList,
    querySelector: vi.fn((selector: string): unknown => {
      void selector;
      return null;
    }),
    querySelectorAll: vi.fn((selector: string): unknown[] => {
      void selector;
      return [];
    }),
    getAttribute: vi.fn(),
    focus: vi.fn(),
  };
}

function inputStub() {
  return {
    ...elementStub(),
    value: "",
    placeholder: "",
    readOnly: true,
    rows: 2,
  };
}

function rewardLedgerEntry(overrides: Partial<RewardLedgerEntry>): RewardLedgerEntry {
  const ts = Math.max(0, Math.floor(Number(overrides.ts || 0)));
  const xp = Math.max(0, Math.floor(Number(overrides.xp || 0)));
  return {
    ts,
    dayKey: "2026-05-12",
    taskId: null,
    xp,
    baseXp: xp,
    multiplier: 1,
    eligibleMs: 60_000,
    reason: "session",
    sourceKey: `test:${ts}`,
    ...overrides,
  };
}

function createHarness(overrides?: {
  owner?: "inline" | "manager";
  entries?: Array<Record<string, unknown>>;
  isMobileLayout?: () => boolean;
  rewardProgress?: RewardProgressV1;
}) {
  const overlay = elementStub("historyEntryNoteOverlay");
  const closeBtn = elementStub();
  const cardInput = inputStub();
  const editorInput = inputStub();
  const title = elementStub("historyEntryNoteTitle");
  const meta = elementStub("historyEntryNoteMeta");
  const body = elementStub("historyEntryNoteBody");
  const editor = elementStub("historyEntryNoteEditor");
  const editBtn = elementStub("historyEntryNoteEditBtn");
  const cancelBtn = elementStub("historyEntryNoteCancelBtn");
  const saveBtn = elementStub("historyEntryNoteSaveBtn");
  const entries = overrides?.entries ?? [
    { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" },
  ];
  overlay.querySelector.mockImplementation((selector: string) => {
    if (selector === ".closePopup") return closeBtn;
    if (selector === ".historyEntrySummaryNoteInput.isEditing" && cardInput.classList.contains("isEditing")) return cardInput;
    return null;
  });
  overlay.querySelectorAll.mockImplementation((selector: string) => {
    if (selector === "[data-history-summary-note-input]") return [cardInput];
    return [];
  });
  const opened: unknown[] = [];
  const closed: unknown[] = [];
  const interaction = createHistoryEntrySummaryInteraction({
    owner: overrides?.owner ?? "inline",
    elements: {
      overlay: overlay as unknown as HTMLElement,
      title: title as unknown as HTMLElement,
      meta: meta as unknown as HTMLElement,
      body: body as unknown as HTMLElement,
      editor: editor as unknown as HTMLElement,
      input: editorInput as unknown as HTMLTextAreaElement,
      editBtn: editBtn as unknown as HTMLButtonElement,
      cancelBtn: cancelBtn as unknown as HTMLButtonElement,
      saveBtn: saveBtn as unknown as HTMLButtonElement,
    },
    escapeHtml: (value) => String(value ?? ""),
    formatDateTime: (value) => String(value),
    formatTwo: (value) => String(value).padStart(2, "0"),
    getEntryNote: (entry) => String(entry.note || "").trim(),
    getTaskById: (taskId) =>
      ({
        id: taskId,
        name: "Focus",
        color: "#00CFC8",
        timeGoalEnabled: true,
        timeGoalMinutes: 1,
        timeGoalUnit: "minute",
        timeGoalPeriod: "day",
        timeGoalValue: 1,
      }) as Task,
    getEntriesForTask: () => entries,
    getRewardProgress: () => overrides?.rewardProgress ?? DEFAULT_REWARD_PROGRESS,
    openOverlay: (node) => opened.push(node),
    closeOverlay: (node) => closed.push(node),
    isMobileLayout: overrides?.isMobileLayout ?? (() => false),
  });
  return {
    interaction,
    overlay,
    closeBtn,
    cardInput,
    editorInput,
    title,
    meta,
    body,
    editor,
    editBtn,
    cancelBtn,
    saveBtn,
    opened,
    closed,
  };
}

function triggerStub() {
  const input = inputStub();
  const attrs: Record<string, string> = {
    "data-history-summary-task-id": "task-1",
    "data-history-summary-ts": "1000",
    "data-history-summary-ms": "60000",
    "data-history-summary-name": "Focus",
  };
  return {
    input,
    trigger: {
      getAttribute: vi.fn((name: string) => attrs[name] ?? null),
      querySelector: vi.fn((selector: string) => selector === "[data-history-summary-note-input]" ? input : null),
    } as unknown as HTMLElement,
  };
}

describe("createHistoryEntrySummaryInteraction", () => {
  it("renders a summary into the shared overlay and opens it", () => {
    const h = createHarness();

    expect(h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }])).toBe(true);

    expect(h.title.textContent).toBe("Focus");
    expect(h.meta.textContent).toBe("Session Summary");
    expect(h.body.innerHTML).toContain("Session note");
    expect(h.opened).toEqual([h.overlay]);
  });

  it("renders dev XP replay buttons for aggregate and session XP values when XP is tracked", () => {
    const rewardProgress = {
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 120,
      awardLedger: [
        rewardLedgerEntry({ ts: 1000, xp: 12, taskId: "task-1" }),
        rewardLedgerEntry({ ts: 2000, xp: 8, taskId: "task-1" }),
      ],
    };
    const h = createHarness({
      rewardProgress,
      entries: [
        { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "A" },
        { taskId: "task-1", ts: 2000, ms: 30000, name: "Focus", note: "B" },
      ],
    });

    h.interaction.openSummary("task-1", [
      { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "A" },
      { taskId: "task-1", ts: 2000, ms: 30000, name: "Focus", note: "B" },
    ]);

    expect(h.body.innerHTML.match(/data-history-summary-action="trigger-xp-award"/g)).toHaveLength(3);
    expect(h.body.innerHTML.match(/data-history-summary-xp-source="true"/g)).toHaveLength(3);
    expect(h.body.innerHTML).toContain('data-history-summary-xp="20"');
    expect(h.body.innerHTML).toContain('data-history-summary-xp="12"');
    expect(h.body.innerHTML).toContain('data-history-summary-xp="8"');
  });

  it("sets editable target dataset for a single entry", () => {
    const h = createHarness();

    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);

    expect(h.overlay.dataset.historyEntryOwner).toBe("inline");
    expect(h.overlay.dataset.historyEntryTaskId).toBe("task-1");
    expect(h.overlay.dataset.historyEntryEditable).toBe("true");
    expect(h.overlay.dataset.historyEntryNote).toBe("Original note");
    expect(h.editorInput.value).toBe("Original note");
    expect(h.editBtn.textContent).toBe("Edit Note");
  });

  it("marks multi-entry summaries as non-editable", () => {
    const h = createHarness();

    h.interaction.openSummary("task-1", [
      { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "A" },
      { taskId: "task-1", ts: 2000, ms: 30000, name: "Focus", note: "B" },
    ]);

    expect(h.overlay.dataset.historyEntryEditable).toBe("false");
    expect(h.editBtn.style.display).toBe("none");
  });

  it("renders multiple selected sessions from earliest logged time to latest", () => {
    const h = createHarness();

    h.interaction.openSummary("task-1", [
      { taskId: "task-1", ts: 3000, ms: 60000, name: "Focus", note: "Latest" },
      { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Earliest" },
      { taskId: "task-1", ts: 2000, ms: 60000, name: "Focus", note: "Middle" },
    ]);

    const html = h.body.innerHTML;
    expect(html.indexOf('data-history-summary-ts="1000"')).toBeLessThan(html.indexOf('data-history-summary-ts="2000"'));
    expect(html.indexOf('data-history-summary-ts="2000"')).toBeLessThan(html.indexOf('data-history-summary-ts="3000"'));
  });

  it("syncs note placeholders for mobile and desktop layouts", () => {
    const desktop = createHarness({ isMobileLayout: () => false });
    desktop.cardInput.dataset.emptyNotePlaceholderDesktop = "Click to add note";
    desktop.cardInput.dataset.emptyNotePlaceholderMobile = "Tap to add note";

    desktop.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus" }]);
    expect(desktop.cardInput.placeholder).toBe("Click to add note");

    const mobile = createHarness({ isMobileLayout: () => true });
    mobile.cardInput.dataset.emptyNotePlaceholderDesktop = "Click to add note";
    mobile.cardInput.dataset.emptyNotePlaceholderMobile = "Tap to add note";
    mobile.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus" }]);
    expect(mobile.cardInput.placeholder).toBe("Tap to add note");
  });

  it("begins card note editing and syncs the save-and-close label", () => {
    const h = createHarness();
    const { trigger, input } = triggerStub();
    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);
    h.overlay.querySelector.mockImplementation((selector: string) => {
      if (selector === ".closePopup") return h.closeBtn;
      if (selector === ".historyEntrySummaryNoteInput.isEditing") return input.classList.contains("isEditing") ? input : null;
      return null;
    });

    expect(h.interaction.beginEdit(trigger)).toBe(true);

    expect(h.overlay.dataset.historyEntryEditing).toBe("true");
    expect(input.readOnly).toBe(false);
    expect(input.value).toBe("Original note");
    expect(input.focus).toHaveBeenCalledTimes(1);
    expect(h.closeBtn.textContent).toBe("Save & Close");
    expect(h.closeBtn.classList.contains("isSaveAndClose")).toBe(true);
  });

  it("mirrors input changes into the hidden editor input and close label", () => {
    const h = createHarness();
    h.overlay.dataset.historyEntryEditing = "true";

    h.interaction.syncInputMirror("Updated note");

    expect(h.editorInput.value).toBe("Updated note");
    expect(h.closeBtn.textContent).toBe("Save & Close");
  });

  it("cancels editing and restores the stored dataset note", () => {
    const h = createHarness();
    const { trigger, input } = triggerStub();
    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);
    h.overlay.querySelector.mockImplementation((selector: string) => {
      if (selector === ".closePopup") return h.closeBtn;
      if (selector === ".historyEntrySummaryNoteInput.isEditing") return input.classList.contains("isEditing") ? input : null;
      return null;
    });
    h.interaction.beginEdit(trigger);
    input.value = "Draft note";
    h.editorInput.value = "Draft note";

    h.interaction.cancelEdit();

    expect(h.editorInput.value).toBe("Original note");
    expect(input.value).toBe("Original note");
    expect(input.readOnly).toBe(true);
    expect(input.classList.contains("isEditing")).toBe(false);
    expect(h.overlay.dataset.historyEntryEditing).toBe("false");
  });

  it("clears target state", () => {
    const h = createHarness();
    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);

    h.interaction.clearTarget();

    expect(h.overlay.dataset.historyEntryOwner).toBe("");
    expect(h.overlay.dataset.historyEntryTaskId).toBe("");
    expect(h.overlay.dataset.historyEntryEditable).toBe("false");
    expect(h.overlay.dataset.historyEntryNote).toBe("");
    expect(h.editorInput.value).toBe("");
  });

  it("dispatches a representative dev XP replay award from the visible XP value and closes the overlay", () => {
    const dispatchEvent = vi.fn();
    class CustomEventStub<T = unknown> {
      type: string;
      detail: T;

      constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    }
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", CustomEventStub);
    const rewardProgress = {
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 120,
      awardLedger: [rewardLedgerEntry({ ts: 1000, xp: 12, taskId: "task-1" })],
    };
    const h = createHarness({ rewardProgress });
    const sourceElement = {
      getBoundingClientRect: vi.fn(() => ({ left: 40, top: 50, width: 70, height: 18 })),
    } as unknown as HTMLElement;
    const field = {
      querySelector: vi.fn((selector: string) => (selector === "[data-history-summary-xp-source]" ? sourceElement : null)),
    };
    const trigger = {
      getAttribute: vi.fn((name: string) => {
        if (name === "data-history-summary-xp") return "12";
        if (name === "data-history-summary-task-id") return "task-1";
        return null;
      }),
      closest: vi.fn((selector: string) => (selector === ".historyEntrySummaryField" ? field : null)),
      getBoundingClientRect: vi.fn(() => ({ left: 10, top: 20, width: 30, height: 12 })),
    } as unknown as HTMLElement;

    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);

    expect(h.interaction.triggerDevXpAward(trigger)).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const queuedEvent = dispatchEvent.mock.calls[0]?.[0] as CustomEventStub | undefined;
    expect(queuedEvent?.type).toBe(TASKTIMER_PENDING_XP_AWARD_EVENT);
    expect(queuedEvent?.detail).toMatchObject({
      fromXp: 108,
      toXp: 120,
      awardedXp: 12,
      sourceModal: "historyEntrySummaryTest",
      sourceTaskId: "task-1",
      sourceOverlayId: "historyEntryNoteOverlay",
      sourceElementKey: "historyEntrySummaryXpValue",
      sourceRect: { left: 40, top: 50, width: 70, height: 18 },
    });
    expect(h.closed).toEqual([h.overlay]);
    vi.unstubAllGlobals();
  });

  it("uses the XP value as the dev replay animation source when it is available", () => {
    const dispatchEvent = vi.fn();
    class CustomEventStub<T = unknown> {
      type: string;
      detail: T;

      constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    }
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", CustomEventStub);
    const rewardProgress = {
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 120,
      awardLedger: [rewardLedgerEntry({ ts: 1000, xp: 12, taskId: "task-1" })],
    };
    const h = createHarness({ rewardProgress });
    const sourceElement = {
      getBoundingClientRect: vi.fn(() => ({ left: 40, top: 50, width: 70, height: 18 })),
    } as unknown as HTMLElement;
    const field = {
      querySelector: vi.fn((selector: string) => (selector === "[data-history-summary-xp-source]" ? sourceElement : null)),
    };
    const trigger = {
      getAttribute: vi.fn((name: string) => {
        if (name === "data-history-summary-xp") return "12";
        if (name === "data-history-summary-task-id") return "task-1";
        return null;
      }),
      closest: vi.fn((selector: string) => (selector === ".historyEntrySummaryField" ? field : null)),
      getBoundingClientRect: vi.fn(() => ({ left: 10, top: 20, width: 30, height: 12 })),
    } as unknown as HTMLElement;

    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);

    expect(h.interaction.triggerDevXpAward(trigger)).toBe(true);
    const queuedEvent = dispatchEvent.mock.calls[0]?.[0] as CustomEventStub | undefined;
    expect(queuedEvent?.detail).toMatchObject({
      sourceElementKey: "historyEntrySummaryXpValue",
      sourceRect: { left: 40, top: 50, width: 70, height: 18 },
    });
    vi.unstubAllGlobals();
  });

  it("falls back to the replay trigger as a source only when no XP value is available", () => {
    const dispatchEvent = vi.fn();
    class CustomEventStub<T = unknown> {
      type: string;
      detail: T;

      constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = init?.detail as T;
      }
    }
    vi.stubGlobal("window", { dispatchEvent });
    vi.stubGlobal("CustomEvent", CustomEventStub);
    const rewardProgress = {
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 120,
      awardLedger: [rewardLedgerEntry({ ts: 1000, xp: 12, taskId: "task-1" })],
    };
    const h = createHarness({ rewardProgress });
    const trigger = {
      getAttribute: vi.fn((name: string) => {
        if (name === "data-history-summary-xp") return "12";
        if (name === "data-history-summary-task-id") return "task-1";
        return null;
      }),
      getBoundingClientRect: vi.fn(() => ({ left: 10, top: 20, width: 30, height: 12 })),
    } as unknown as HTMLElement;

    h.interaction.openSummary("task-1", [{ taskId: "task-1", ts: 1000, ms: 60000, name: "Focus", note: "Original note" }]);

    expect(h.interaction.triggerDevXpAward(trigger)).toBe(true);
    const queuedEvent = dispatchEvent.mock.calls[0]?.[0] as CustomEventStub | undefined;
    expect(queuedEvent?.detail).toMatchObject({
      sourceElementKey: "historyEntrySummaryXpReplayFallback",
      sourceRect: { left: 10, top: 20, width: 30, height: 12 },
    });
    vi.unstubAllGlobals();
  });
});
