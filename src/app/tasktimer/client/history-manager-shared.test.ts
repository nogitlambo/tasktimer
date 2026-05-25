import { describe, expect, it } from "vitest";
import {
  createDefaultHistoryManagerManualDraft,
  parseHistoryManagerManualDraft,
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
