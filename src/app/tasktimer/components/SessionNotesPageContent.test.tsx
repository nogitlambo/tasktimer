import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionNotesPageContent from "./SessionNotesPageContent";

describe("SessionNotesPageContent", () => {
  it("renders the Notes shell and runtime list hook", () => {
    const html = renderToStaticMarkup(createElement(SessionNotesPageContent, { active: true }));

    expect(html).toContain("Notes");
    expect(html).toContain("No notes yet.");
    expect(html).toContain('id="appPageSessionNotes"');
    expect(html).toContain('data-session-notes-filter="active"');
    expect(html).toContain('aria-label="Task note filter"');
    expect(html).toContain("Active");
    expect(html).toContain("Archived");
    expect(html).toContain('id="sessionNotesList"');
  });
});
