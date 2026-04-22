import { describe, expect, it } from "vitest";
import { fillBackgroundForPct, pctToEndColor, sessionColorForTaskMs } from "./colors";
import type { Task } from "./types";

describe("colors", () => {
  it("clamps low progress to red", () => {
    expect(pctToEndColor(-25)).toBe("rgb(255,59,48)");
    expect(fillBackgroundForPct(0)).toBe("rgb(255,59,48)");
  });

  it("moves through orange at mid progress", () => {
    expect(fillBackgroundForPct(50)).toBe("rgb(255,140,0)");
  });

  it("stays yellow near completion instead of turning green early", () => {
    expect(fillBackgroundForPct(99)).toBe("rgb(255,213,10)");
  });

  it("returns green only at completion and clamps values above 100", () => {
    expect(fillBackgroundForPct(100)).toBe("rgb(12,245,127)");
    expect(fillBackgroundForPct(135)).toBe("rgb(12,245,127)");
  });

  it("applies the same shared mapping to session colors", () => {
    const task = {
      milestonesEnabled: true,
      milestones: [{ hours: 1, description: "Goal" }],
      milestoneTimeUnit: "hour",
    } as Task;

    expect(sessionColorForTaskMs(task, 0)).toBe("rgb(255,59,48)");
    expect(sessionColorForTaskMs(task, 30 * 60 * 1000)).toBe("rgb(255,140,0)");
    expect(sessionColorForTaskMs(task, 59.4 * 60 * 1000)).toBe("rgb(255,213,10)");
    expect(sessionColorForTaskMs(task, 60 * 60 * 1000)).toBe("rgb(12,245,127)");
  });
});
