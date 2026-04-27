import { describe, expect, it, vi } from "vitest";

import { createTaskTimerHistoryManager } from "./history-manager";

function createElementStub() {
  return {
    style: { display: "none" },
    hidden: true,
    innerHTML: "",
    textContent: "",
    children: [],
    dataset: {},
    classList: {
      toggle: vi.fn(),
    },
    setAttribute: vi.fn(function (this: { style: { display: string }; hidden?: boolean; ariaHidden?: string }, key: string, value: string) {
      if (key === "aria-hidden") (this as { ariaHidden?: string }).ariaHidden = value;
    }),
    getAttribute: vi.fn(function (this: { ariaHidden?: string }, key: string) {
      if (key === "aria-hidden") return this.ariaHidden ?? null;
      return null;
    }),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
  };
}

function deferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("history manager", () => {
  it("renders immediately while cloud refresh continues in the background", async () => {
    const screenEl = createElementStub();
    const loadingEl = createElementStub();
    const generateBtnEl = createElementStub();
    const listEl = createElementStub();
    const refreshDeferred = deferredPromise<Record<string, never>>();

    vi.stubGlobal("window", {
      location: { search: "" },
      clearTimeout: vi.fn(),
      setTimeout: vi.fn(),
    });
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) => (id === "hmList" ? listEl : null)),
    });

    const expandedTaskGroups = new Set<string>();
    const expandedDateGroups = new Set<string>();

    const manager = createTaskTimerHistoryManager({
      els: {
        historyManagerScreen: screenEl,
        historyManagerLoadingOverlay: loadingEl,
        historyManagerGenerateBtn: generateBtnEl,
        hmList: listEl,
      },
      runtime: { destroyed: false },
      on: vi.fn(),
      getTasks: () => [{ id: "task-1", name: "Task 1", order: 0 }],
      getRewardProgress: () => ({}) as never,
      setTasks: vi.fn(),
      getHistoryByTaskId: () => ({
        "task-1": [{ ts: Date.UTC(2026, 3, 22, 1), ms: 60_000, name: "Task 1" }],
      }),
      setHistoryByTaskId: vi.fn(),
      getDeletedTaskMeta: () => ({}),
      setDeletedTaskMeta: vi.fn(),
      getHmExpandedTaskGroups: () => expandedTaskGroups,
      setHmExpandedTaskGroups: vi.fn((value: Set<string>) => {
        expandedTaskGroups.clear();
        value.forEach((entry) => expandedTaskGroups.add(entry));
      }),
      getHmExpandedDateGroups: () => expandedDateGroups,
      setHmExpandedDateGroups: vi.fn((value: Set<string>) => {
        expandedDateGroups.clear();
        value.forEach((entry) => expandedDateGroups.add(entry));
      }),
      getHmSortKey: () => "ts",
      setHmSortKey: vi.fn(),
      getHmSortDir: () => "desc",
      setHmSortDir: vi.fn(),
      getHmBulkEditMode: () => false,
      setHmBulkEditMode: vi.fn(),
      getHmBulkSelectedRows: () => new Set<string>(),
      setHmBulkSelectedRows: vi.fn(),
      getHmRowsByTask: () => ({}),
      setHmRowsByTask: vi.fn(),
      getHmRowsByTaskDate: () => ({}),
      setHmRowsByTaskDate: vi.fn(),
      getHistoryManagerRefreshInFlight: () => null,
      setHistoryManagerRefreshInFlight: vi.fn(),
      isArchitectUser: () => false,
      getHistoryEntryNote: () => "",
      csvEscape: (value: unknown) => String(value ?? ""),
      parseCsvRows: () => [],
      downloadCsvFile: vi.fn(),
      formatTwo: (value: number) => String(value).padStart(2, "0"),
      formatDateTime: (value: number) => new Date(value).toISOString(),
      sortMilestones: (milestones: never) => milestones,
      sessionColorForTaskMs: () => "#00ffaa",
      save: vi.fn(),
      saveHistory: vi.fn(),
      saveHistoryAndWait: vi.fn(async () => {}),
      loadHistory: () => ({ "task-1": [] }),
      refreshHistoryFromCloud: () => refreshDeferred.promise as never,
      saveDeletedMeta: vi.fn(),
      loadDeletedMeta: () => ({}),
      load: vi.fn(),
      render: vi.fn(),
      navigateToAppRoute: vi.fn(),
      openOverlay: vi.fn(),
      confirm: vi.fn(),
      closeConfirm: vi.fn(),
      escapeHtmlUI: (value: unknown) => String(value ?? ""),
      syncSharedTaskSummariesForTasks: vi.fn(async () => {}),
      syncSharedTaskSummariesForTask: vi.fn(async () => {}),
      hasEntitlement: () => true,
      getCurrentPlan: () => "pro",
      showUpgradePrompt: vi.fn(),
    } as never);

    manager.openHistoryManager();

    expect(screenEl.style.display).toBe("block");
    expect(listEl.innerHTML).toContain("Task 1");
    expect(loadingEl.hidden).toBe(true);

    refreshDeferred.resolve({});
    await refreshDeferred.promise;
  });
});
