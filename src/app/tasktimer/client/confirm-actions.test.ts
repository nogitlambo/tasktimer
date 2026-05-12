import { describe, expect, it, vi } from "vitest";

import { buildDeleteTaskConfirmOptions } from "./confirm-actions";

describe("buildDeleteTaskConfirmOptions", () => {
  it("preserves task history by default unless the user opts into deleting it", () => {
    const config = buildDeleteTaskConfirmOptions({
      taskName: "Focus",
      onDelete: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(config.options.checkboxLabel).toBe("Delete history entries");
    expect(config.options.checkboxChecked).toBe(false);
  });
});
