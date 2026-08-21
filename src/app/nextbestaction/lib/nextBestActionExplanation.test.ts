import { describe, expect, it } from "vitest";

import { buildNextBestActionExplanation } from "./nextBestActionExplanation";

describe("Next Best Action explanation", () => {
  it("includes the scheduled task fit inside productivity days and hours", () => {
    expect(
      buildNextBestActionExplanation(["MATCHES_FOCUS_WINDOW"], {
        productivityWindow: {
          plannedDay: "tue",
          plannedStartTime: "09:30",
          days: ["tue", "thu"],
          startTime: "09:00",
          endTime: "12:00",
          matched: true,
        },
      }),
    ).toBe(
      "Recommended because it is within your current focus window. It is scheduled for Tuesday at 9:30 AM, which is inside your productivity days (Tuesday, Thursday) and productivity hours (9:00 AM-12:00 PM).",
    );
  });
});
