import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SessionNotesPageContent from "./SessionNotesPageContent";

describe("SessionNotesPageContent", () => {
  it("renders the Session Notes shell and runtime list hook", () => {
    const html = renderToStaticMarkup(createElement(SessionNotesPageContent, { active: true }));

    expect(html).toContain("Session Notes");
    expect(html).toContain('id="appPageSessionNotes"');
    expect(html).toContain('id="sessionNotesList"');
  });
});
