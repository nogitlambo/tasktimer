import { describe, expect, it } from "vitest";
import { renderHistoryManagerHtml } from "./history-manager-render";

describe("history manager render", () => {
  function render(overrides: Partial<Parameters<typeof renderHistoryManagerHtml>[0]> = {}) {
    const existingListEl = {
      children: { length: 0 },
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
    return renderHistoryManagerHtml({
      existingListEl,
      historyByTaskId: {
        active: [{ ts: 3, ms: 1_000, name: "Active Task" }],
        archived: [{ ts: 2, ms: 2_000, name: "Archived Task" }],
        deleted: [{ ts: 1, ms: 3_000, name: "Deleted Task" }],
      },
      tasks: [{ id: "active", name: "Active Task", order: 1, accumulatedMs: 0, running: false, startMs: null, collapsed: false, milestonesEnabled: false, milestones: [], hasStarted: false }],
      taskIdFilter: null,
      hmBulkSelectedRows: new Set<string>(),
      hmBulkEditMode: false,
      hmSortKey: "ts",
      hmSortDir: "desc",
      taskView: "active",
      hmExpandedTaskGroups: new Set<string>(),
      hmExpandedDateGroups: new Set<string>(),
      formatTwo: (value) => String(value).padStart(2, "0"),
      formatDateTime: (value) => `dt-${value}`,
      getTaskMetaForHistoryId: (taskId) => {
        if (taskId === "active") return { name: "Active Task", color: null, deleted: false, state: "active" as const };
        if (taskId === "archived") return { name: "Archived Task", color: null, deleted: true, state: "archived" as const };
        return { name: "Deleted Task", color: null, deleted: true, state: "deleted" as const };
      },
      getHistoryEntryNote: () => "",
      canUseManualEntry: true,
      ...overrides,
    });
  }

  it("renders active task history by default and excludes archived and deleted tasks", () => {
    const result = render();

    expect(result.html).toContain("Active Task");
    expect(result.html).not.toContain("Archived Task");
    expect(result.html).not.toContain("Deleted Task");
    expect(result.html).not.toContain("hmUnarchiveBtn");
  });

  it("renders archived task history in the archived view and excludes active and deleted tasks", () => {
    const result = render({ taskView: "archived" });

    expect(result.html).not.toContain("Active Task");
    expect(result.html).toContain("Archived Task");
    expect(result.html).not.toContain("Deleted Task");
    expect(result.html).toContain(">Archived<");
    expect(result.html).toContain("hmUnarchiveBtn");
  });

  it("shows view-specific empty states", () => {
    const activeResult = render({
      historyByTaskId: {
        archived: [{ ts: 2, ms: 2_000, name: "Archived Task" }],
      },
    });
    const archivedResult = render({
      taskView: "archived",
      historyByTaskId: {
        active: [{ ts: 3, ms: 1_000, name: "Active Task" }],
      },
    });

    expect(activeResult.emptyHtml).toContain("No active task history entries found.");
    expect(archivedResult.emptyHtml).toContain("No archived task history entries found.");
  });

  it("treats filtered legacy preserved-history rows as deleted when no explicit state is provided", () => {
    const result = render({
      taskIdFilter: "deleted",
      getTaskMetaForHistoryId: () => ({ name: "Legacy Deleted", color: null, deleted: true, state: "deleted" as const }),
    });

    expect(result.html).toContain("Legacy Deleted");
    expect(result.html).not.toContain("Archived Tasks");
    expect(result.html).toContain(">Deleted<");
  });
});
