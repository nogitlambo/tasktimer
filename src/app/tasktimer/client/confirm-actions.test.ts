import { describe, expect, it, vi } from "vitest";

import { buildDeleteTaskConfirmOptions } from "./confirm-actions";

describe("buildDeleteTaskConfirmOptions", () => {
  it("shows a simple delete task confirmation without archive fallback", () => {
    const config = buildDeleteTaskConfirmOptions({
      taskName: "Focus",
      onDelete: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(config.title).toBe('Delete "Focus"?');
    expect(config.text).toBe("Delete this task? This action cannot be undone.");
    expect(config.options.okLabel).toBe("Delete");
    expect(config.options.altLabel).toBeNull();
    expect(config.options.altButtonClassName).toBeUndefined();
    expect(config.options.onAlt).toBeNull();
    expect(config.options.checkboxLabel).toBeUndefined();
    expect(config.options.checkboxChecked).toBeUndefined();
  });
});
