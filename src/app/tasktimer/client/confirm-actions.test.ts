import { describe, expect, it, vi } from "vitest";

import { buildDeleteTaskConfirmOptions } from "./confirm-actions";

describe("buildDeleteTaskConfirmOptions", () => {
  it("shows delete task history impact without requiring a checkbox", () => {
    const config = buildDeleteTaskConfirmOptions({
      taskName: "Focus",
      onDelete: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(config.text).toBe(
      "History entries associated with this task will also be permanently deleted (your awarded XP will be preserved). To keep history entries and just remove the task, choose Archive.",
    );
    expect(config.options.checkboxLabel).toBeUndefined();
    expect(config.options.checkboxChecked).toBeUndefined();
  });
});
