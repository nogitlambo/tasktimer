import { describe, expect, it, vi } from "vitest";
import type { HistoryEntry } from "../lib/types";
import { resolveHistoryEntryMutationTarget } from "./session";

function entry(sessionId: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    sessionId,
    ts: 1_717_200_000_000,
    ms: 120_000,
    name: "Deep Work",
    ...overrides,
  };
}

describe("resolveHistoryEntryMutationTarget", () => {
  it("uses an opaque target to distinguish entries that share the same display tuple", () => {
    const first = entry("session-a");
    const second = entry("session-b");
    const resolver = vi.fn(() => second);

    const result = resolveHistoryEntryMutationTarget(
      "task-1",
      [first, second],
      {
        owner: "inline",
        historyTargetKey: "history-target-2",
        ts: second.ts,
        ms: second.ms,
        name: second.name,
      },
      resolver
    );

    expect(result).toEqual({ index: 1, entry: second });
    expect(resolver).toHaveBeenCalledWith("task-1", "history-target-2", "inline");
  });

  it("routes manager capabilities through the manager target resolver", () => {
    const target = entry("session-a");
    const resolver = vi.fn(() => target);

    const result = resolveHistoryEntryMutationTarget(
      "task-1",
      [target],
      { owner: "manager", historyTargetKey: "1000|60000|Focus|session:session-a" },
      resolver
    );

    expect(result).toEqual({ index: 0, entry: target });
    expect(resolver).toHaveBeenCalledWith(
      "task-1",
      "1000|60000|Focus|session:session-a",
      "manager"
    );
  });

  it("fails safely when an unkeyed tuple is ambiguous", () => {
    const first = entry("session-a");
    const second = entry("session-b");

    const result = resolveHistoryEntryMutationTarget(
      "task-1",
      [first, second],
      { ts: first.ts, ms: first.ms, name: first.name },
      vi.fn()
    );

    expect(result).toBeNull();
  });

  it("refuses a stale capability whose resolved entry is no longer in current history", () => {
    const current = entry("session-a");
    const staleClone = { ...current };

    const result = resolveHistoryEntryMutationTarget(
      "task-1",
      [current],
      { historyTargetKey: "history-target-1" },
      () => staleClone
    );

    expect(result).toBeNull();
  });
});
