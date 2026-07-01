import { describe, expect, it, vi } from "vitest";

import { buildDeleteTaskConfirmOptions } from "./confirm-actions";

describe("buildDeleteTaskConfirmOptions", () => {
  it("shows delete task history impact without requiring a checkbox", () => {
    const config = buildDeleteTaskConfirmOptions({
      taskName: "Focus",
      onDelete: vi.fn(),
      onArchive: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(config.text).toBe(
      "History entries associated with this task will also be permanently deleted (your awarded XP will be preserved). To keep history entries and just remove the task, choose Archive.",
    );
    expect(config.options.altLabel).toBe("Archive");
    expect(config.options.altButtonClassName).toBe("btn btn-ghost");
    expect(config.options.onAlt).toBeTypeOf("function");
    expect(config.options.checkboxLabel).toBeUndefined();
    expect(config.options.checkboxChecked).toBeUndefined();
  });

  it("omits the archive option when no archive action is provided", () => {
    const config = buildDeleteTaskConfirmOptions({
      taskName: "Focus",
      onDelete: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(config.options.altLabel).toBeNull();
    expect(config.options.onAlt).toBeNull();
  });
});
