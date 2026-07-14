import { afterEach, describe, expect, it, vi } from "vitest";
import { createTaskTimerHistoryManager } from "./history-manager";
import { buildHistoryManagerRowKey } from "./history-manager-shared";

type ConfirmOptions = {
  onOk: () => void | Promise<void>;
  onCancel: () => void;
};

function createSummaryDeleteHarness(
  initialEntries: Array<Record<string, unknown>>,
  options?: { bulkSelectedRowIds?: string[]; summaryTargetKey?: string }
) {
  let historyByTaskId: Record<string, Array<Record<string, unknown>>> = {
    "task-1": initialEntries,
  };
  let confirmOptions: ConfirmOptions | null = null;
  let confirmMessage = "";
  let bulkSelectedRows = new Set(options?.bulkSelectedRowIds || []);
  const documentStub = {
    getElementById: vi.fn(() => null),
  };
  vi.stubGlobal("document", documentStub);

  const overlay = {
    dataset: {
      historyEntryOwner: "manager",
      historyEntryEditing: "false",
    } as Record<string, string>,
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  };
  const bulkDeleteButton = {};
  const documentClickHandlers: Array<(event: Event) => void> = [];
  const bulkDeleteHandlers: Array<() => void> = [];
  const saveHistoryAndWait = vi.fn(async () => {});
  const saveHistory = vi.fn();
  const closeOverlay = vi.fn();
  const closeConfirm = vi.fn();
  const setHistoryByTaskId = vi.fn((next: typeof historyByTaskId) => {
    historyByTaskId = next;
  });

  const ctx = {
    els: {
      historyEntryNoteOverlay: overlay,
      historyManagerBulkDeleteBtn: bulkDeleteButton,
    },
    runtime: { destroyed: false },
    on: vi.fn((target: unknown, eventName: string, handler: (event: Event) => void) => {
      if (target === documentStub && eventName === "click") documentClickHandlers.push(handler);
      if (target === bulkDeleteButton && eventName === "click") bulkDeleteHandlers.push(handler as () => void);
    }),
    confirm: vi.fn((_title: string, message: string, nextOptions: ConfirmOptions) => {
      confirmMessage = message;
      confirmOptions = nextOptions;
    }),
    closeConfirm,
    closeOverlay,
    loadHistory: vi.fn(() => historyByTaskId),
    setHistoryByTaskId,
    saveHistoryAndWait,
    saveHistory,
    syncSharedTaskSummariesForTask: vi.fn(async () => {}),
    syncSharedTaskSummariesForTasks: vi.fn(async () => {}),
    getDeletedTaskMeta: vi.fn(() => ({})),
    setDeletedTaskMeta: vi.fn(),
    saveDeletedMeta: vi.fn(),
    getTasks: vi.fn(() => []),
    getWeekStarting: vi.fn(() => 1),
    save: vi.fn(),
    render: vi.fn(),
    renderDashboardWidgets: vi.fn(),
    getHmBulkSelectedRows: vi.fn(() => bulkSelectedRows),
    setHmBulkSelectedRows: vi.fn((next: Set<string>) => {
      bulkSelectedRows = next;
    }),
    getHmBulkEditMode: vi.fn(() => false),
    getHmSortKey: vi.fn(() => "ts"),
    getHmSortDir: vi.fn(() => "desc"),
    getHmExpandedTaskGroups: vi.fn(() => new Set<string>()),
    setHmExpandedTaskGroups: vi.fn(),
    setHmRowsByTask: vi.fn(),
    setHmRowsByTaskDate: vi.fn(),
    getHistoryByTaskId: vi.fn(() => historyByTaskId),
    getDeletedTaskMetaForTask: vi.fn(),
    getHistoryEntryNote: vi.fn((entry: Record<string, unknown>) => String(entry.note || "")),
    getRewardProgress: vi.fn(() => null),
    escapeHtmlUI: vi.fn((value: unknown) => String(value || "")),
    formatDateTime: vi.fn((value: number) => String(value)),
    formatTwo: vi.fn((value: number) => String(value).padStart(2, "0")),
    refreshHistoryFromCloud: vi.fn(async () => historyByTaskId),
  };

  const manager = createTaskTimerHistoryManager(ctx as never);
  manager.registerHistoryManagerEvents();

  function clickSummaryDelete() {
    const attributes: Record<string, string> = {
      "data-history-summary-task-id": "task-1",
      "data-history-summary-ts": "1000",
      "data-history-summary-ms": "60000",
      "data-history-summary-name": "Focus",
      "data-history-summary-target-key":
        options?.summaryTargetKey || (initialEntries[0] ? buildHistoryManagerRowKey(initialEntries[0] as never) : ""),
    };
    const deleteButton = {
      getAttribute: vi.fn((name: string) => attributes[name] ?? null),
    };
    const target = {
      closest: vi.fn((selector: string) =>
        selector === '[data-history-summary-action="delete-session"]' ? deleteButton : null
      ),
    };
    const event = {
      target,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;
    documentClickHandlers.forEach((handler) => handler(event));
  }

  function clickBulkDelete() {
    bulkDeleteHandlers.forEach((handler) => handler());
  }

  return {
    clickSummaryDelete,
    clickBulkDelete,
    getConfirmOptions: () => confirmOptions,
    getConfirmMessage: () => confirmMessage,
    getHistory: () => historyByTaskId,
    setHistory: (entries: Array<Record<string, unknown>>) => {
      historyByTaskId = { "task-1": entries };
    },
    saveHistoryAndWait,
    saveHistory,
    closeOverlay,
    closeConfirm,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("History Manager summary deletion", () => {
  it("deletes a uniquely resolvable entry and closes its summary", async () => {
    const target = { sessionId: "session-a", ts: 1000, ms: 60_000, name: "Focus" };
    const other = { sessionId: "session-b", ts: 2000, ms: 30_000, name: "Focus" };
    const h = createSummaryDeleteHarness([target, other]);

    h.clickSummaryDelete();
    expect(h.getConfirmOptions()).not.toBeNull();
    await h.getConfirmOptions()?.onOk();

    expect(h.getHistory()["task-1"]).toEqual([other]);
    expect(h.saveHistoryAndWait).toHaveBeenCalledTimes(1);
    expect(h.closeOverlay).toHaveBeenCalledTimes(1);
    expect(h.closeConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not offer deletion for an already ambiguous target", () => {
    const first = { ts: 1000, ms: 60_000, name: "Focus" };
    const second = { ...first, note: "duplicate legacy row" };
    const h = createSummaryDeleteHarness([first, second]);

    h.clickSummaryDelete();

    expect(h.getConfirmOptions()).toBeNull();
    expect(h.saveHistoryAndWait).not.toHaveBeenCalled();
    expect(h.getHistory()["task-1"]).toEqual([first, second]);
  });

  it.each([
    ["missing", []],
    [
      "replaced",
      [
        { sessionId: "session-b", ts: 1000, ms: 60_000, name: "Focus" },
      ],
    ],
  ])("deletes nothing when a confirmed target is %s", async (_state, currentEntries) => {
    const target = { sessionId: "session-a", ts: 1000, ms: 60_000, name: "Focus" };
    const h = createSummaryDeleteHarness([target], {
      summaryTargetKey: buildHistoryManagerRowKey(target),
    });
    h.clickSummaryDelete();
    const confirmation = h.getConfirmOptions();
    expect(confirmation).not.toBeNull();

    h.setHistory(currentEntries as Array<Record<string, unknown>>);
    await confirmation?.onOk();

    expect(h.getHistory()["task-1"]).toEqual(currentEntries);
    expect(h.saveHistoryAndWait).not.toHaveBeenCalled();
    expect(h.closeOverlay).not.toHaveBeenCalled();
    expect(h.closeConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("History Manager bulk deletion", () => {
  it("does not confirm or delete a selected duplicate tuple", () => {
    const first = { ts: 1000, ms: 60_000, name: "Focus" };
    const second = { ...first, note: "duplicate legacy row" };
    const rowKey = buildHistoryManagerRowKey(first);
    const h = createSummaryDeleteHarness([first, second], {
      bulkSelectedRowIds: [`task-1|${rowKey}`],
    });

    h.clickBulkDelete();

    expect(h.getConfirmOptions()).toBeNull();
    expect(h.getHistory()["task-1"]).toEqual([first, second]);
    expect(h.saveHistory).not.toHaveBeenCalled();
  });

  it("confirms and deletes only initially unique selected targets", async () => {
    const firstDuplicate = { ts: 1000, ms: 60_000, name: "Focus" };
    const secondDuplicate = { ...firstDuplicate, note: "duplicate legacy row" };
    const unique = { sessionId: "session-c", ts: 2000, ms: 30_000, name: "Focus" };
    const h = createSummaryDeleteHarness([firstDuplicate, secondDuplicate, unique], {
      bulkSelectedRowIds: [
        `task-1|${buildHistoryManagerRowKey(firstDuplicate)}`,
        `task-1|${buildHistoryManagerRowKey(unique)}`,
      ],
    });

    h.clickBulkDelete();
    expect(h.getConfirmMessage()).toContain("1 entry across 1 task");
    await h.getConfirmOptions()?.onOk();

    expect(h.getHistory()["task-1"]).toEqual([firstDuplicate, secondDuplicate]);
    expect(h.saveHistory).toHaveBeenCalledTimes(1);
  });

  it("deletes nothing when a selected bulk target is replaced under the same tuple", async () => {
    const target = { sessionId: "session-a", ts: 1000, ms: 60_000, name: "Focus" };
    const lateDuplicate = { ...target, sessionId: "session-b" };
    const h = createSummaryDeleteHarness([target], {
      bulkSelectedRowIds: [`task-1|${buildHistoryManagerRowKey(target)}`],
    });

    h.clickBulkDelete();
    const confirmation = h.getConfirmOptions();
    expect(confirmation).not.toBeNull();
    h.setHistory([lateDuplicate]);
    await confirmation?.onOk();

    expect(h.getHistory()["task-1"]).toEqual([lateDuplicate]);
    expect(h.saveHistory).not.toHaveBeenCalled();
  });
});
