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
      formatTwo: (value) => String(value).padStart(2, "0"),
      formatDateTime: (value) => `dt-${value}`,
      getTaskMetaForHistoryId: (taskId) => {
        if (taskId === "active") return { name: "Active Task", color: null, deleted: false, state: "active" as const };
        if (taskId === "archived") return { name: "Archived Task", color: null, deleted: true, state: "archived" as const };
        return { name: "Deleted Task", color: null, deleted: true, state: "deleted" as const };
      },
      getHistoryEntryNote: () => "",
      ...overrides,
    });
  }

  it("renders active and archived task history by default and excludes deleted tasks", () => {
    const result = render();

    expect(result.html).toContain("Active Task");
    expect(result.html).toContain("Archived Task");
    expect(result.html).not.toContain("Deleted Task");
    expect(result.html).toContain(">Archived<");
    expect(result.html).toContain("hmUnarchiveBtn");
  });

  it("shows the combined empty state when no active or archived history exists", () => {
    const result = render({
      historyByTaskId: {
        deleted: [{ ts: 1, ms: 3_000, name: "Deleted Task" }],
      },
    });

    expect(result.emptyHtml).toContain("No task history entries found.");
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

  it("renders expanded task entries in a flat table without collapsible date groups", () => {
    const result = render({
      historyByTaskId: {
        active: [
          { ts: Date.UTC(2026, 0, 1, 9), ms: 1_000, name: "Active Task" },
          { ts: Date.UTC(2026, 0, 2, 9), ms: 2_000, name: "Active Task" },
        ],
      },
      hmExpandedTaskGroups: new Set<string>(["active"]),
    });

    expect(result.html).not.toContain("hmDateHeading");
    expect(result.html).not.toContain("hmDateGroup");
    expect(result.html).not.toContain("hmDateSectionRow");
    expect((result.html.match(/hmTable/g) || []).length).toBe(1);
    expect(result.rowIdsByTask.active).toHaveLength(2);
  });

  it("renders bracketed entry counts after the task name", () => {
    const single = render();
    const multiple = render({
      historyByTaskId: {
        active: [
          { ts: 3, ms: 1_000, name: "Active Task" },
          { ts: 4, ms: 2_000, name: "Active Task" },
        ],
      },
    });

    const taskNameIndex = single.html.indexOf('<div class="hmTaskName">Active Task</div>');
    const countIndex = single.html.indexOf('<div class="hmCount">(1)</div>');

    expect(taskNameIndex).toBeGreaterThanOrEqual(0);
    expect(countIndex).toBeGreaterThan(taskNameIndex);
    expect(single.html).toContain('<div class="hmCount">(1)</div>');
    expect(single.html).not.toContain("1 entry");
    expect(single.html).not.toContain("1 logs");
    expect(multiple.html).toContain('<div class="hmCount">(2)</div>');
    expect(multiple.html).not.toContain("2 entries");
    expect(multiple.html).not.toContain("2 logs");
  });

  it("does not render History Manager manual-entry actions", () => {
    const result = render();

    expect(result.html).not.toContain("hmAddBtn");
    expect(result.html).not.toContain("Add manual history entry");
  });

  it("sorts all task entries globally without date section rows", () => {
    const result = render({
      historyByTaskId: {
        active: [
          { ts: Date.UTC(2026, 0, 1, 9), ms: 2_000, name: "Active Task" },
          { ts: Date.UTC(2026, 0, 2, 9), ms: 1_000, name: "Active Task" },
          { ts: Date.UTC(2026, 0, 1, 10), ms: 3_000, name: "Active Task" },
        ],
      },
      hmSortKey: "ms",
      hmSortDir: "asc",
    });

    expect(result.rowIdsByTask.active).toEqual([
      `active|${Date.UTC(2026, 0, 2, 9)}|1000|Active Task`,
      `active|${Date.UTC(2026, 0, 1, 9)}|2000|Active Task`,
      `active|${Date.UTC(2026, 0, 1, 10)}|3000|Active Task`,
    ]);
    expect(result.html).not.toContain("hmDateSectionRow");
  });

  it("marks the task bulk checkbox checked when every rendered row is selected", () => {
    const firstRow = `active|${Date.UTC(2026, 0, 1, 9)}|1000|Active Task`;
    const secondRow = `active|${Date.UTC(2026, 0, 2, 9)}|2000|Active Task`;
    const result = render({
      historyByTaskId: {
        active: [
          { ts: Date.UTC(2026, 0, 1, 9), ms: 1_000, name: "Active Task" },
          { ts: Date.UTC(2026, 0, 2, 9), ms: 2_000, name: "Active Task" },
        ],
      },
      hmBulkEditMode: true,
      hmBulkSelectedRows: new Set<string>([firstRow, secondRow]),
    });

    expect(result.rowIdsByTask.active).toEqual([secondRow, firstRow]);
    expect(result.html).toContain('class="hmBulkCheckbox hmBulkTaskChk"');
    expect(result.html).toContain("checked");
    expect(result.html).not.toContain("hmBulkDateChk");
    expect(result.html).toContain("hmBulkSelectableRow");
  });
});
