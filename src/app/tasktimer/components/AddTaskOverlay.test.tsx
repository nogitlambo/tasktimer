import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import AddTaskOverlay from "./AddTaskOverlay";

function renderAddTaskOverlayMarkup() {
  return renderToStaticMarkup(createElement(AddTaskOverlay));
}

describe("AddTaskOverlay", () => {
  it("renders a Brain Dump entry without replacing Cancel or Create", () => {
    const html = renderAddTaskOverlayMarkup();

    expect(html).toContain('href="/brain-dump"');
    expect(html).toContain('aria-label="Brain Dump"');
    expect(html).toContain('data-brain-dump-entry="add-task-overlay"');
    expect(html).toContain('id="addTaskCancelBtn"');
    expect(html).toContain('id="addTaskConfirmBtn"');
  });
});
