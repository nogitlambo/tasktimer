import { describe, expect, it } from "vitest";

import { normalizePendingPushActionId } from "./pushNotificationAction";

describe("normalizePendingPushActionId", () => {
  it("preserves supported push action ids", () => {
    expect(normalizePendingPushActionId("launchTask")).toBe("launchTask");
    expect(normalizePendingPushActionId("snooze10m")).toBe("snooze10m");
    expect(normalizePendingPushActionId("postponeNextGap")).toBe("postponeNextGap");
  });

  it("falls back to default for unsupported or empty action ids", () => {
    expect(normalizePendingPushActionId("tap")).toBe("default");
    expect(normalizePendingPushActionId("")).toBe("default");
    expect(normalizePendingPushActionId(null)).toBe("default");
  });
});
