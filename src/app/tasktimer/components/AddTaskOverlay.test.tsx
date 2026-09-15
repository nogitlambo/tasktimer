import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AddTaskOverlay from "./AddTaskOverlay";

function renderAddTaskOverlayMarkup() {
  return renderToStaticMarkup(createElement(AddTaskOverlay));
}

describe("AddTaskOverlay", () => {
  it("renders Cancel and Create without a Brain Dump button", () => {
    const html = renderAddTaskOverlayMarkup();

    expect(html).not.toContain('href="/executive?view=brain-dump"');
    expect(html).not.toContain('aria-label="Brain Dump"');
    expect(html).not.toContain('data-brain-dump-entry="add-task-overlay"');
    expect(html).toContain('id="addTaskCancelBtn"');
    expect(html).toContain('id="addTaskConfirmBtn"');
  });
});
