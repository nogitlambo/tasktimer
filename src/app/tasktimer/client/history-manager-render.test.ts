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

  it("renders archived and deleted tasks in separate sections", () => {
    const result = render();

    expect(result.html).toContain("Archived Tasks");
    expect(result.html).toContain("Deleted Tasks");
    expect(result.html).toContain(">Archived<");
    expect(result.html).toContain(">Deleted<");
    expect(result.html).toContain("hmUnarchiveBtn");
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
