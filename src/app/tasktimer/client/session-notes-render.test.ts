import { describe, expect, it } from "vitest";
import { renderSessionNotesHtml } from "./session-notes-render";

describe("renderSessionNotesHtml", () => {
  it("renders history and live notes as task-level selectable tiles", () => {
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
    expect(html).toContain('class="sessionNotesTaskGroup is-active"');
    expect(html).toContain('class="sessionNotesDateList sessionNotesTileGrid"');
    expect(html).toContain('data-session-note-task-id="task-1"');
    expect(html).toContain('data-session-note-ts="1767308400000"');
    expect(html).toContain("2 Jan 2026");
    expect(html).toContain("Live");
    expect(html).not.toContain("08:00");
    expect(html).not.toContain("sessionNotesDateGroup");
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
    expect(html).toContain('class="sessionNotesTaskGroup is-archived"');
    expect(html).not.toContain("Deleted Task");
    expect(html).not.toContain("<script");
  });

  it("renders attachment-only notes as selectable tiles", () => {
    const html = renderSessionNotesHtml({
      tasks: [{ id: "task-1", name: "Deep Work" } as never],
      deletedTaskMeta: {},
      liveSessionsByTaskId: {},
      historyByTaskId: {
        "task-1": [
          {
            ts: new Date("2026-01-01T09:00:00").getTime(),
            name: "Deep Work",
            ms: 60000,
            note: "",
            attachments: [
              {
                id: "file-1",
                name: "<report>.pdf",
                contentType: "application/pdf",
                size: 2048,
                storagePath: "users/uid/session-notes/file-1/report.pdf",
                downloadUrl: "https://example.test/report.pdf",
                createdAtMs: 1,
              },
              {
                id: "file-2",
                name: "image.jpeg",
                contentType: "image/jpeg",
                size: 1153434,
                storagePath: "users/uid/session-notes/file-2/image.jpeg",
                downloadUrl: "https://example.test/image.jpeg",
                createdAtMs: 2,
              },
            ],
          },
        ],
      },
    });

    expect(html).toContain('data-session-note-task-id="task-1"');
    expect(html).toContain('aria-label="Deep Work, 1 Jan 2026');
    expect(html).toContain('src="/icons/icons_default/notes.webp"');
  });

  it("adds a task color custom property to active task headers", () => {
    const html = renderSessionNotesHtml({
      tasks: [{ id: "task-1", name: "Deep Work", color: "#ff5252" } as never],
      deletedTaskMeta: {},
      liveSessionsByTaskId: {},
      historyByTaskId: {
        "task-1": [{ ts: 1000, name: "Deep Work", ms: 60000, note: "Saved note" }],
      },
    });

    expect(html).toContain('<header class="sessionNotesTaskHeader" style="--session-notes-task-color-rgb:255 82 82;">');
  });

  it("uses archived task metadata color for archived task headers", () => {
    const html = renderSessionNotesHtml({
      tasks: [],
      deletedTaskMeta: {
        "archived-task": { name: "Archived Task", color: "#00bfa5", deletedAt: 1, state: "archived" },
      },
      liveSessionsByTaskId: {},
      historyByTaskId: {
        "archived-task": [{ ts: 1000, name: "Archived Task", ms: 60000, note: "Archived note" }],
      },
    });

    expect(html).toContain('<header class="sessionNotesTaskHeader" style="--session-notes-task-color-rgb:0 191 165;">');
    expect(html).toContain("Archived");
  });

  it("omits the task color custom property when the task color is invalid or missing", () => {
    const html = renderSessionNotesHtml({
      tasks: [
        { id: "invalid-task", name: "Invalid Color", color: "not-a-color" },
        { id: "missing-task", name: "Missing Color" },
      ] as never,
      deletedTaskMeta: {},
      liveSessionsByTaskId: {},
      historyByTaskId: {
        "invalid-task": [{ ts: 2000, name: "Invalid Color", ms: 60000, note: "Invalid color note" }],
        "missing-task": [{ ts: 1000, name: "Missing Color", ms: 60000, note: "Missing color note" }],
      },
    });

    expect(html).toContain('<header class="sessionNotesTaskHeader">');
    expect(html).not.toContain("--session-notes-task-color-rgb");
  });
});
