import { describe, expect, it } from "vitest";
import { renderSessionNotesHtml } from "./session-notes-render";

describe("renderSessionNotesHtml", () => {
  it("renders history and live notes grouped by task and date", () => {
    const html = renderSessionNotesHtml({
      tasks: [{ id: "task-1", name: "Deep Work" } as never],
      deletedTaskMeta: {},
      liveSessionsByTaskId: {
        "task-1": {
          taskId: "task-1",
          sessionId: "live-1",
          name: "Deep Work",
          startedAtMs: new Date("2026-01-02T10:00:00").getTime(),
          elapsedMs: 120000,
          updatedAtMs: new Date("2026-01-02T10:02:00").getTime(),
          note: "<strong>Live</strong> note",
          status: "running",
        },
      },
      historyByTaskId: {
        "task-1": [
          { ts: new Date("2026-01-01T09:00:00").getTime(), name: "Deep Work", ms: 60000, note: "<b>Saved</b> note" },
          { ts: new Date("2026-01-01T08:00:00").getTime(), name: "Deep Work", ms: 60000, note: "" },
        ],
      },
    });

    expect(html).toContain("Deep Work");
    expect(html).toContain("<strong>Live</strong> note");
    expect(html).toContain("<b>Saved</b> note");
    expect(html).toContain("Live");
    expect(html).not.toContain("08:00");
  });

  it("omits deleted task groups and sanitizes rich note markup", () => {
    const html = renderSessionNotesHtml({
      tasks: [],
      deletedTaskMeta: {
        "archived-task": { name: "Archived Task", color: null, deletedAt: 1, state: "archived" },
        "deleted-task": { name: "Deleted Task", color: null, deletedAt: 1, state: "deleted" },
      },
      liveSessionsByTaskId: {},
      historyByTaskId: {
        "archived-task": [{ ts: 1000, name: "Archived Task", ms: 1000, note: '<a href="https://example.com">ok</a>' }],
        "deleted-task": [{ ts: 2000, name: "Deleted Task", ms: 1000, note: '<script>alert(1)</script>gone' }],
      },
    });

    expect(html).toContain("Archived Task");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("Deleted Task");
    expect(html).not.toContain("<script");
  });
});
