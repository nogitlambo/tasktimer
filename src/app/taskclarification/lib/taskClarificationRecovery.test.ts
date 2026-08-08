import { describe, expect, it } from "vitest";

import { isTaskClarificationUndoWindowOpen } from "./taskClarificationRecovery";

describe("task clarification recovery", () => {
  it("keeps the undo window open before the deadline and closes it at the deadline", () => {
    const reversibleUntil = "2026-08-07T00:00:30.000Z";

    expect(isTaskClarificationUndoWindowOpen(reversibleUntil, Date.parse("2026-08-07T00:00:29.999Z"))).toBe(true);
    expect(isTaskClarificationUndoWindowOpen(reversibleUntil, Date.parse("2026-08-07T00:00:30.000Z"))).toBe(false);
  });
});
