import { describe, expect, it } from "vitest";
import {
  getTaskTimerHistoryEntryIdentity,
  getTaskTimerHistorySummaryRemainingEntriesAfterDelete,
} from "./history-inline";

function dayKey(entry: { ts?: unknown }) {
  const ts = Number(entry?.ts || 0);
  if (!Number.isFinite(ts) || ts <= 0) return "";
  return new Date(ts).toISOString().slice(0, 10);
}

describe("history inline session summary delete reopen", () => {
  it("returns the remaining selected entry when one of two entry-mode sessions is deleted", () => {
    const first = { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus" };
    const second = { taskId: "task-1", ts: 2000, ms: 120000, name: "Focus" };

    const remaining = getTaskTimerHistorySummaryRemainingEntriesAfterDelete({
      allEntries: [second],
      snapshot: {
        rangeMode: "entries",
        selectedEntries: [first, second],
        selectedDayKeys: [],
      },
      deletedIdentity: getTaskTimerHistoryEntryIdentity(first),
      getDateKey: dayKey,
    });

    expect(remaining).toEqual([second]);
  });

  it("keeps entry-mode selected sessions in their existing order after deleting the middle one", () => {
    const first = { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus" };
    const second = { taskId: "task-1", ts: 2000, ms: 120000, name: "Focus" };
    const third = { taskId: "task-1", ts: 3000, ms: 180000, name: "Focus" };

    const remaining = getTaskTimerHistorySummaryRemainingEntriesAfterDelete({
      allEntries: [first, third],
      snapshot: {
        rangeMode: "entries",
        selectedEntries: [first, second, third],
        selectedDayKeys: [],
      },
      deletedIdentity: getTaskTimerHistoryEntryIdentity(second),
      getDateKey: dayKey,
    });

    expect(remaining).toEqual([first, third]);
  });

  it("rebuilds a day-mode selected summary from remaining sessions on the selected day", () => {
    const selectedDay = "2026-06-18";
    const first = { taskId: "task-1", ts: Date.UTC(2026, 5, 18, 9), ms: 60000, name: "Focus" };
    const second = { taskId: "task-1", ts: Date.UTC(2026, 5, 18, 10), ms: 120000, name: "Focus" };
    const otherDay = { taskId: "task-1", ts: Date.UTC(2026, 5, 19, 9), ms: 180000, name: "Focus" };

    const remaining = getTaskTimerHistorySummaryRemainingEntriesAfterDelete({
      allEntries: [second, otherDay],
      snapshot: {
        rangeMode: "day",
        selectedEntries: [first, second],
        selectedDayKeys: [selectedDay],
      },
      deletedIdentity: getTaskTimerHistoryEntryIdentity(first),
      getDateKey: dayKey,
    });

    expect(remaining).toEqual([second]);
  });

  it("returns no entries when the deleted session was the last selected summary entry", () => {
    const only = { taskId: "task-1", ts: 1000, ms: 60000, name: "Focus" };

    const remaining = getTaskTimerHistorySummaryRemainingEntriesAfterDelete({
      allEntries: [],
      snapshot: {
        rangeMode: "entries",
        selectedEntries: [only],
        selectedDayKeys: [],
      },
      deletedIdentity: getTaskTimerHistoryEntryIdentity(only),
      getDateKey: dayKey,
    });

    expect(remaining).toEqual([]);
  });
});
