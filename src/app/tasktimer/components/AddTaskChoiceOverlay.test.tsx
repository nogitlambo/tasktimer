import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AddTaskChoiceOverlay from "./AddTaskChoiceOverlay";

function renderAddTaskChoiceOverlayMarkup() {
  return renderToStaticMarkup(createElement(AddTaskChoiceOverlay));
}

describe("AddTaskChoiceOverlay", () => {
  it("renders manual and Brain Dump task creation choices", () => {
    const html = renderAddTaskChoiceOverlayMarkup();

    expect(html).toContain('id="addTaskChoiceOverlay"');
    expect(html).toContain('aria-label="Choose task creation method"');
    expect(html).toContain('data-add-task-choice="manual"');
    expect(html).toContain("Manual Task Creation");
    expect(html).toContain('href="/executive?view=brain-dump"');
    expect(html).toContain('data-add-task-choice="brain-dump"');
    expect(html).toContain('data-brain-dump-entry="add-task-choice"');
    expect(html).toContain("Brain Dump");
  });
});
