import { describe, expect, it } from "vitest";
import {
  areDashboardTasksCompletedLabelsSafe,
  buildDashboardTasksCompletedLabelLayout,
  dashboardTasksCompletedPathIntersectsRect,
  dashboardTasksCompletedRectsIntersect,
  type DashboardTasksCompletedPoint,
} from "./dashboard-card-tasks-completed-layout";

function expectNoRectOverlaps(layouts: ReturnType<typeof buildDashboardTasksCompletedLabelLayout>) {
  layouts.forEach((layout, index) => {
    layouts.slice(index + 1).forEach((other) => {
      expect(dashboardTasksCompletedRectsIntersect(layout.rect, other.rect, 1)).toBe(false);
    });
  });
}

function parseConnectorPath(path: string) {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  expect(numbers.length).toBeGreaterThanOrEqual(4);
  expect(numbers.length % 2).toBe(0);
  const toPoint = (offset: number): DashboardTasksCompletedPoint => ({ x: numbers[offset], y: numbers[offset + 1] });
  return {
    start: toPoint(0),
    points: Array.from({ length: numbers.length / 2 - 1 }, (_, index) => toPoint(2 + index * 2)),
  };
}

function labelPct(layout: ReturnType<typeof buildDashboardTasksCompletedLabelLayout>[number]) {
  const center = { x: 190, y: 190 };
  const angleDeg = (Math.atan2(layout.labelY - center.y, layout.labelX - center.x) * 180) / Math.PI;
  return ((angleDeg + 90) / 3.6 + 100) % 100;
}

function pointOnDefaultRing(pct: number, radius: number) {
  const angleRad = ((-90 + pct * 3.6) * Math.PI) / 180;
  return {
    x: 190 + Math.cos(angleRad) * radius,
    y: 190 + Math.sin(angleRad) * radius,
  };
}

function distanceFromCenter(point: DashboardTasksCompletedPoint) {
  return Math.hypot(point.x - 190, point.y - 190);
}

describe("dashboard task overview label layout", () => {
  it("places every label in outside lanes with connector paths", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "quick-1", sliceStartPct: 0.6, slicePct: 1.4 },
      { key: "quick-2", sliceStartPct: 2.2, slicePct: 1.4 },
      { key: "quick-3", sliceStartPct: 3.8, slicePct: 1.4 },
      { key: "quick-4", sliceStartPct: 5.4, slicePct: 1.4 },
      { key: "long", sliceStartPct: 35, slicePct: 20 },
    ]);

    expect(layouts.every((layout) => layout.isExternal)).toBe(true);
    expect(layouts.every((layout) => !!layout.connectorPath)).toBe(true);
    expectNoRectOverlaps(layouts);
  });

  it("places non-overlapping labels at their slice midpoints", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
      { key: "right", sliceStartPct: 25, slicePct: 10 },
      { key: "bottom", sliceStartPct: 50, slicePct: 10 },
      { key: "left", sliceStartPct: 75, slicePct: 10 },
    ]);

    expect(layouts.every((layout) => layout.isExternal)).toBe(true);
    expect(layouts.every((layout) => !!layout.connectorPath)).toBe(true);
    expect(labelPct(layouts.find((layout) => layout.key === "top") as (typeof layouts)[number])).toBeCloseTo(5, 5);
    expect(labelPct(layouts.find((layout) => layout.key === "right") as (typeof layouts)[number])).toBeCloseTo(30, 5);
    expect(labelPct(layouts.find((layout) => layout.key === "bottom") as (typeof layouts)[number])).toBeCloseTo(55, 5);
    expect(labelPct(layouts.find((layout) => layout.key === "left") as (typeof layouts)[number])).toBeCloseTo(80, 5);
    expectNoRectOverlaps(layouts);
  });

  it("rotates the circular label slots toward their owned slice midpoints", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "a", sliceStartPct: 17, slicePct: 6 },
      { key: "b", sliceStartPct: 42, slicePct: 6 },
      { key: "c", sliceStartPct: 67, slicePct: 6 },
      { key: "d", sliceStartPct: 92, slicePct: 6 },
    ]);

    expect(Math.round(labelPct(layouts.find((layout) => layout.key === "a") as (typeof layouts)[number]))).toBe(20);
    expect(Math.round(labelPct(layouts.find((layout) => layout.key === "b") as (typeof layouts)[number]))).toBe(45);
    expect(Math.round(labelPct(layouts.find((layout) => layout.key === "c") as (typeof layouts)[number]))).toBe(70);
    expect(Math.round(labelPct(layouts.find((layout) => layout.key === "d") as (typeof layouts)[number]))).toBe(95);
    expectNoRectOverlaps(layouts);
  });

  it("nudges overlapping neighboring labels while preserving non-colliding midpoint labels", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "a", sliceStartPct: 0, slicePct: 2 },
      { key: "b", sliceStartPct: 1.2, slicePct: 2 },
      { key: "c", sliceStartPct: 48, slicePct: 8 },
    ]);
    const a = layouts.find((layout) => layout.key === "a") as (typeof layouts)[number];
    const b = layouts.find((layout) => layout.key === "b") as (typeof layouts)[number];
    const c = layouts.find((layout) => layout.key === "c") as (typeof layouts)[number];

    expect(labelPct(a)).not.toBeCloseTo(1, 1);
    expect(labelPct(b)).not.toBeCloseTo(2.2, 1);
    expect(labelPct(c)).toBeCloseTo(52, 5);
    expectNoRectOverlaps(layouts);
  });

  it("leaves non-overlapping neighboring labels at their own progress midpoints", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 6 },
      { key: "upper-right", sliceStartPct: 12, slicePct: 6 },
      { key: "right", sliceStartPct: 25, slicePct: 6 },
    ]);

    expect(labelPct(layouts.find((layout) => layout.key === "top") as (typeof layouts)[number])).toBeCloseTo(3, 5);
    expect(labelPct(layouts.find((layout) => layout.key === "upper-right") as (typeof layouts)[number])).toBeCloseTo(15, 5);
    expect(labelPct(layouts.find((layout) => layout.key === "right") as (typeof layouts)[number])).toBeCloseTo(28, 5);
    expectNoRectOverlaps(layouts);
  });

  it("keeps connector starts anchored to the slice midpoint after labels are nudged", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "a", sliceStartPct: 0, slicePct: 2 },
      { key: "b", sliceStartPct: 1.2, slicePct: 2 },
    ]);
    const a = layouts.find((layout) => layout.key === "a") as (typeof layouts)[number];
    const path = parseConnectorPath(a.connectorPath as string);
    const expectedStart = pointOnDefaultRing(1, 104);

    expect(path.start.x).toBeCloseTo(expectedStart.x, 2);
    expect(path.start.y).toBeCloseTo(expectedStart.y, 2);
    expect(path.points.length).toBeGreaterThanOrEqual(1);
    expectNoRectOverlaps(layouts);
  });

  it("routes angled connector lines without passing through task labels", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "quick-1", sliceStartPct: 0.6, slicePct: 1.4 },
      { key: "quick-2", sliceStartPct: 2.2, slicePct: 1.4 },
      { key: "quick-3", sliceStartPct: 3.8, slicePct: 1.4 },
      { key: "quick-4", sliceStartPct: 5.4, slicePct: 1.4 },
      { key: "long", sliceStartPct: 35, slicePct: 20 },
    ]);

    layouts
      .filter((layout) => layout.connectorPath)
      .forEach((layout) => {
        const path = parseConnectorPath(layout.connectorPath as string);
        layouts.forEach((other) => {
          expect(dashboardTasksCompletedPathIntersectsRect(path, other.rect, 0)).toBe(false);
        });
      });
  });

  it("uses at most one outward bend and then connects directly to the task label edge", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
      { key: "right", sliceStartPct: 25, slicePct: 10 },
      { key: "bottom", sliceStartPct: 50, slicePct: 10 },
      { key: "left", sliceStartPct: 75, slicePct: 10 },
    ]);

    layouts.forEach((layout) => {
      const path = parseConnectorPath(layout.connectorPath as string);
      const labelPoint = path.points[1];
      if (!labelPoint) {
        expect(path.points).toHaveLength(1);
        return;
      }
      const onVerticalEdge = Math.abs(labelPoint.x - layout.rect.x) < 0.02 ||
        Math.abs(labelPoint.x - (layout.rect.x + layout.rect.width)) < 0.02;
      const onHorizontalEdge = Math.abs(labelPoint.y - layout.rect.y) < 0.02 ||
        Math.abs(labelPoint.y - (layout.rect.y + layout.rect.height)) < 0.02;

      expect(path.points).toHaveLength(2);
      expect(onVerticalEdge || onHorizontalEdge).toBe(true);
    });
  });

  it("draws a direct connector when the label is within 45 degrees of the slice origin", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
    ]);
    const path = parseConnectorPath(layouts[0]?.connectorPath as string);

    expect(path.points).toHaveLength(1);
  });

  it("targets the provided visible label width instead of a fixed maximum label box", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "short", sliceStartPct: 25, slicePct: 10, labelWidth: 34 },
    ]);
    const path = parseConnectorPath(layouts[0]?.connectorPath as string);
    const endpoint = path.points[path.points.length - 1];
    const layout = layouts[0] as (typeof layouts)[number];

    expect(layout.rect.width).toBe(34);
    expect(Math.abs(endpoint.x - layout.rect.x) < 0.02 ||
      Math.abs(endpoint.x - (layout.rect.x + layout.rect.width)) < 0.02 ||
      Math.abs(endpoint.y - layout.rect.y) < 0.02 ||
      Math.abs(endpoint.y - (layout.rect.y + layout.rect.height)) < 0.02).toBe(true);
  });

  it("keeps dense micro labels from overlapping after local slot fallback", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "a", sliceStartPct: 0, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
      { key: "b", sliceStartPct: 1.6, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
      { key: "c", sliceStartPct: 3.2, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
      { key: "d", sliceStartPct: 4.8, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
      { key: "e", sliceStartPct: 6.4, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
      { key: "f", sliceStartPct: 8, slicePct: 1.4, labelWidth: 54, labelHeight: 24 },
    ]);

    expect(layouts).toHaveLength(6);
    expectNoRectOverlaps(layouts);
  });

  it("routes connector bends outside the donut ring before angling to labels", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
      { key: "right", sliceStartPct: 25, slicePct: 10 },
      { key: "bottom", sliceStartPct: 50, slicePct: 10 },
      { key: "left", sliceStartPct: 75, slicePct: 10 },
    ]);

    layouts.forEach((layout) => {
      const path = parseConnectorPath(layout.connectorPath as string);
      if (path.points.length === 1) return;
      expect(distanceFromCenter(path.points[0])).toBeGreaterThan(distanceFromCenter(path.start));
    });
  });

  it("sets side alignment from the circular label position", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
      { key: "right", sliceStartPct: 20, slicePct: 10 },
      { key: "bottom", sliceStartPct: 50, slicePct: 10 },
      { key: "left", sliceStartPct: 75, slicePct: 10 },
    ]);

    expect(layouts.find((layout) => layout.key === "right")?.isRightSide).toBe(true);
    expect(layouts.find((layout) => layout.key === "left")?.isRightSide).toBe(false);
  });

  it("marks labels unsafe when any label exceeds the chart bounds", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "right", sliceStartPct: 25, slicePct: 10, labelWidth: 96 },
    ]);

    expect(areDashboardTasksCompletedLabelsSafe(layouts, { viewportWidth: 300 })).toBe(false);
  });

  it("marks normal side labels safe when they fit outside the visible donut area", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "right", sliceStartPct: 25, slicePct: 10, labelWidth: 96 },
    ]);

    expect(areDashboardTasksCompletedLabelsSafe(layouts)).toBe(true);
  });

  it("marks labels unsafe when any label intersects the protected donut area", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "overlap", sliceStartPct: 25, slicePct: 10, labelWidth: 96 },
    ], { labelOrbitRadius: 108 });

    expect(areDashboardTasksCompletedLabelsSafe(layouts)).toBe(false);
  });

  it("marks short external labels safe when they fit outside the protected donut area", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "right", sliceStartPct: 25, slicePct: 10, labelWidth: 50 },
    ]);

    expect(areDashboardTasksCompletedLabelsSafe(layouts)).toBe(true);
  });
});
