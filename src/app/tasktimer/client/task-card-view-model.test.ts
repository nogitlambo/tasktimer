import { describe, expect, it } from "vitest";
import { buildTaskProgressModel, renderTaskProgressHtml } from "./task-card-view-model";

describe("task-card-view-model", () => {
  it("returns null when there are no milestones or time goal", () => {
    expect(
      buildTaskProgressModel({
        milestones: [],
        elapsedSec: 0,
        milestoneUnitSec: 3600,
        unitSuffix: "h",
        timeGoalSec: 0,
      })
    ).toBeNull();
  });

  it("builds progress markers with a single visible pending milestone label", () => {
    const model = buildTaskProgressModel({
      milestones: [
        { hours: 1, description: "Warmup" },
        { hours: 2, description: "Deep work" },
      ],
      elapsedSec: 1800,
      milestoneUnitSec: 3600,
      unitSuffix: "h",
      timeGoalSec: 0,
    });

    expect(model).not.toBeNull();
    expect(model?.markers[0]).toMatchObject({ kind: "baseline", label: "0h" });
    const milestoneMarkers = model?.markers.filter((marker) => marker.kind === "milestone") || [];
    expect(milestoneMarkers).toHaveLength(2);
    expect(milestoneMarkers[0]).toMatchObject({ showLabel: true, label: "1h", reached: false });
    expect(milestoneMarkers[1]).toMatchObject({ showLabel: false, label: "2h", reached: false });
  });

  it("caps progress at 100 and includes a goal marker", () => {
    const model = buildTaskProgressModel({
      milestones: [{ hours: 1, description: "" }],
      elapsedSec: 10800,
      milestoneUnitSec: 3600,
      unitSuffix: "h",
      timeGoalSec: 7200,
    });

    expect(model?.pct).toBe(100);
    expect(model?.markers.some((marker) => marker.kind === "goal")).toBe(true);
  });

  it("renders escaped labels and descriptions", () => {
    const model = buildTaskProgressModel({
      milestones: [{ hours: 1, description: "<unsafe>" }],
      elapsedSec: 0,
      milestoneUnitSec: 3600,
      unitSuffix: "h",
      timeGoalSec: 0,
    });

    const html = renderTaskProgressHtml(model, {
      fillColor: "#fff",
      escapeHtml: (value) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    });

    expect(html).toContain("&lt;unsafe&gt;");
    expect(html).toContain("progressFill");
  });
});
