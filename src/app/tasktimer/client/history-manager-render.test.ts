import { describe, expect, it } from "vitest";

import { renderHistoryManagerHtml } from "./history-manager-render";
import type { Task } from "../lib/types";

describe("renderHistoryManagerHtml", () => {
  function createListStub() {
    return {
      children: [],
      querySelectorAll: () => [],
    } as unknown as HTMLElement;
  }

  function buildArgs(
    tasks: Task[],
    historyByTaskId: Record<string, Array<{ ts: number; ms: number; name: string; note?: string }>>
  ) {
    return {
      existingListEl: createListStub(),
      historyByTaskId,
      tasks,
      taskIdFilter: null,
      hmBulkSelectedRows: new Set<string>(),
      hmBulkEditMode: false,
      hmSortKey: "ts" as const,
      hmSortDir: "desc" as const,
      hmExpandedTaskGroups: new Set<string>(["task-1", "task-2"]),
      hmExpandedDateGroups: new Set<string>(),
      formatTwo: (value: number) => String(value).padStart(2, "0"),
      formatDateTime: (value: number) => new Date(value).toISOString(),
      getTaskMetaForHistoryId: (taskId: string) =>
        taskId === "task-2"
          ? { name: "Deleted Task", color: null, deleted: true }
          : { name: "Active Task", color: "#00ffaa", deleted: false },
      getHistoryEntryNote: (entry: unknown) => {
        const note = typeof entry === "object" && entry && "note" in entry ? (entry as { note?: unknown }).note : "";
        return String(note || "");
      },
    };
  }

  it("shows add button for active task groups only", () => {
    const tasks = [
      { id: "task-1", name: "Active Task", order: 0 } as Task,
    ];
    const historyByTaskId = {
      "task-1": [{ ts: Date.UTC(2026, 3, 22, 1), ms: 60000, name: "Active Task" }],
      "task-2": [{ ts: Date.UTC(2026, 3, 21, 1), ms: 60000, name: "Deleted Task" }],
    };
    const result = renderHistoryManagerHtml(buildArgs(tasks, historyByTaskId));

    expect(result.html).toContain('class="iconBtn hmAddBtn" type="button" data-task="task-1"');
    expect(result.html).not.toContain('data-task="task-2" aria-label="Add manual history entry"');
  });

  it("keeps manual entry creation out of the list markup", () => {
    const tasks = [{ id: "task-1", name: "Active Task", order: 0 } as Task];
    const historyByTaskId = {
      "task-1": [{ ts: Date.UTC(2026, 3, 22, 1), ms: 60000, name: "Active Task" }],
    };
    const result = renderHistoryManagerHtml(buildArgs(tasks, historyByTaskId));

    expect(result.html).not.toContain("hmManualEntryWrap");
    expect(result.html).not.toContain("data-hm-manual-field");
    expect(result.html).not.toContain("data-hm-manual-action");
  });
});
