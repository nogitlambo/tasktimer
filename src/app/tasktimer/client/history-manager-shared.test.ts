import { describe, expect, it } from "vitest";
import {
  buildHistoryManagerRowKey,
  createDefaultHistoryManagerManualDraft,
  parseHistoryManagerManualDraft,
  removeUniqueHistoryManagerRow,
  resolveHistoryManagerRowTarget,
} from "./history-manager-shared";

describe("parseHistoryManagerManualDraft", () => {
  it("saves a valid manual entry without completion difficulty", () => {
    const draft = {
      ...createDefaultHistoryManagerManualDraft(Date.now()),
      dateTimeValue: "2026-05-03T06:30",
      hoursValue: "1",
      minutesValue: "25",
      noteValue: "Retrospective note",
    };

    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: "Focus",
      historyEntryColor: "#ff8a3d",
    });

    expect(parsed).toEqual({
      entry: {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 85 * 60 * 1000,
        name: "Focus",
        note: "Retrospective note",
        color: "#ff8a3d",
      },
    });
  });

  it("normalizes and saves completion difficulty when provided", () => {
    const draft = {
      ...createDefaultHistoryManagerManualDraft(Date.now()),
      dateTimeValue: "2026-05-03T06:30",
      hoursValue: "0",
      minutesValue: "30",
      completionDifficulty: 4 as const,
    };

    const parsed = parseHistoryManagerManualDraft({
      draft,
      taskName: "Focus",
    });

    expect(parsed).toEqual({
      entry: {
        ts: new Date("2026-05-03T06:30").getTime(),
        ms: 30 * 60 * 1000,
        name: "Focus",
        completionDifficulty: 4,
      },
    });
  });

  it("blocks invalid date/time values", () => {
    const draft = {
      ...createDefaultHistoryManagerManualDraft(Date.now()),
      dateTimeValue: "",
      minutesValue: "30",
    };

    expect(parseHistoryManagerManualDraft({ draft, taskName: "Focus" })).toEqual({
      error: "Enter a valid date and time.",
    });
  });

  it("blocks invalid elapsed values", () => {
    const draft = {
      ...createDefaultHistoryManagerManualDraft(Date.now()),
      dateTimeValue: "2026-05-03T06:30",
      hoursValue: "0",
      minutesValue: "0",
    };

    expect(parseHistoryManagerManualDraft({ draft, taskName: "Focus" })).toEqual({
      error: "Elapsed time must be greater than 0.",
    });
  });
});

describe("History Manager row target resolution", () => {
  it("resolves and removes a unique finalized row", () => {
    const target = { ts: 1000, ms: 60_000, name: "Focus", sessionId: "session-a" };
    const other = { ts: 2000, ms: 30_000, name: "Focus", sessionId: "session-b" };
    const key = buildHistoryManagerRowKey(target);

    expect(resolveHistoryManagerRowTarget([target, other], key)).toEqual({
      kind: "resolved",
      index: 0,
      entry: target,
    });
    expect(removeUniqueHistoryManagerRow([target, other], key)).toEqual({
      entries: [other],
      removedEntry: target,
    });
  });

  it("independently resolves same-tuple rows with distinct session IDs", () => {
    const first = { ts: 1000, ms: 60_000, name: "Focus", sessionId: "session-a" };
    const second = { ts: 1000, ms: 60_000, name: "Focus", sessionId: "session-b" };
    const firstKey = buildHistoryManagerRowKey(first);
    const secondKey = buildHistoryManagerRowKey(second);

    expect(firstKey).not.toBe(secondKey);
    expect(resolveHistoryManagerRowTarget([first, second], firstKey)).toEqual({
      kind: "resolved",
      index: 0,
      entry: first,
    });
    expect(resolveHistoryManagerRowTarget([first, second], secondKey)).toEqual({
      kind: "resolved",
      index: 1,
      entry: second,
    });
  });

  it("fails closed for duplicate legacy tuple rows", () => {
    const first = { ts: 1000, ms: 60_000, name: "Focus" };
    const second = { ...first, note: "duplicate" };
    const key = buildHistoryManagerRowKey(first);

    expect(resolveHistoryManagerRowTarget([first, second], key)).toEqual({ kind: "ambiguous" });
    expect(removeUniqueHistoryManagerRow([first, second], key)).toBeNull();
  });

  it("does not resolve a same-tuple replacement with a different session ID", () => {
    const original = { ts: 1000, ms: 60_000, name: "Focus", sessionId: "session-a" };
    const replacement = { ...original, sessionId: "session-b" };
    const key = buildHistoryManagerRowKey(original);

    expect(removeUniqueHistoryManagerRow([], key)).toBeNull();
    expect(resolveHistoryManagerRowTarget([replacement], key)).toEqual({ kind: "missing" });
    expect(removeUniqueHistoryManagerRow([replacement], key)).toBeNull();
  });
});
