import { describe, expect, it } from "vitest";

import { findTaskTimerHistoryEntryIndexByIdentity } from "./history-inline";

describe("history inline session identity lookup", () => {
  it("matches a history entry by ts, ms, and name", () => {
    const entries = [
      { ts: 100, ms: 300000, name: "Task A" },
      { ts: 200, ms: 600000, name: "Task B" },
    ];

    expect(findTaskTimerHistoryEntryIndexByIdentity(entries, { ts: 200, ms: 600000, name: "Task B" })).toBe(1);
  });

  it("does not match when only one identity field overlaps", () => {
    const entries = [
      { ts: 100, ms: 300000, name: "Task A" },
      { ts: 100, ms: 600000, name: "Task B" },
      { ts: 200, ms: 300000, name: "Task A" },
    ];

    expect(findTaskTimerHistoryEntryIndexByIdentity(entries, { ts: 100, ms: 300000, name: "Task B" })).toBe(-1);
  });

  it("trims entry names during matching", () => {
    const entries = [{ ts: 100, ms: 300000, name: " Task A " }];

    expect(findTaskTimerHistoryEntryIndexByIdentity(entries, { ts: 100, ms: 300000, name: "Task A" })).toBe(0);
  });
});
