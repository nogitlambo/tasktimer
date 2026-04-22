import { describe, expect, it } from "vitest";

import {
  createDefaultHistoryManagerManualDraft,
  formatHistoryManagerDraftDateTimeValue,
  parseHistoryManagerManualDraft,
} from "./history-manager-shared";

describe("history manager manual draft helpers", () => {
  it("formats datetime-local values in local calendar format", () => {
    expect(formatHistoryManagerDraftDateTimeValue(new Date(2026, 3, 22, 9, 5).getTime())).toBe("2026-04-22T09:05");
  });

  it("creates a default draft with zero elapsed and empty note", () => {
    expect(createDefaultHistoryManagerManualDraft(new Date(2026, 3, 22, 9, 5).getTime())).toEqual({
      dateTimeValue: "2026-04-22T09:05",
      hoursValue: "",
      minutesValue: "",
      completionDifficulty: "",
      noteValue: "",
      errorMessage: "",
    });
  });

  it("parses a valid draft into a history entry", () => {
    const result = parseHistoryManagerManualDraft({
      draft: {
        dateTimeValue: "2026-04-22T09:05",
        hoursValue: "1",
        minutesValue: "30",
        completionDifficulty: 4,
        noteValue: "Manual note",
        errorMessage: "",
      },
      taskName: "Deep Work",
      taskColor: "#00ffaa",
    });

    expect("entry" in result).toBe(true);
    if ("entry" in result && result.entry) {
      expect(result.entry.ts).toBe(new Date("2026-04-22T09:05").getTime());
      expect(result.entry.ms).toBe(90 * 60 * 1000);
      expect(result.entry.name).toBe("Deep Work");
      expect(result.entry.completionDifficulty).toBe(4);
      expect(result.entry.note).toBe("Manual note");
      expect(result.entry.color).toBe("#00ffaa");
    }
  });

  it("rejects zero elapsed time", () => {
    const result = parseHistoryManagerManualDraft({
      draft: {
        dateTimeValue: "2026-04-22T09:05",
        hoursValue: "0",
        minutesValue: "0",
        completionDifficulty: 3,
        noteValue: "",
        errorMessage: "",
      },
      taskName: "Deep Work",
      taskColor: null,
    });

    expect(result).toEqual({ error: "Elapsed time must be greater than 0." });
  });

  it("rejects minute values above 59", () => {
    const result = parseHistoryManagerManualDraft({
      draft: {
        dateTimeValue: "2026-04-22T09:05",
        hoursValue: "0",
        minutesValue: "60",
        completionDifficulty: 3,
        noteValue: "",
        errorMessage: "",
      },
      taskName: "Deep Work",
      taskColor: null,
    });

    expect(result).toEqual({ error: "Elapsed minutes must be between 0 and 59." });
  });

  it("rejects drafts without sentiment", () => {
    const result = parseHistoryManagerManualDraft({
      draft: {
        dateTimeValue: "2026-04-22T09:05",
        hoursValue: "0",
        minutesValue: "45",
        completionDifficulty: "",
        noteValue: "",
        errorMessage: "",
      },
      taskName: "Deep Work",
      taskColor: null,
    });

    expect(result).toEqual({ error: "Choose a sentiment before saving this entry." });
  });
});
