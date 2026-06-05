import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HoldingSpacePageContent from "./HoldingSpacePageContent";

describe("HoldingSpacePageContent", () => {
  it("renders the notebook description, rich editor hook, and file controls", () => {
    const html = renderToStaticMarkup(createElement(HoldingSpacePageContent, { active: true }));

    expect(html).toContain("Holding Space");
    expect(html).toContain("A space to save notes, files, and ideas for later.");
    expect(html).toContain('id="appPageHoldingSpace"');
    expect(html).toContain('data-rich-note-editor="true"');
    expect(html).toContain("Add File");
    expect(html).toContain("No files saved yet.");
  });
});
