import { describe, expect, it } from "vitest";
import {
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

  it("distributes labels evenly around the chart curve even when they would not collide", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "top", sliceStartPct: 0, slicePct: 10 },
      { key: "upper-right", sliceStartPct: 8, slicePct: 10 },
      { key: "right", sliceStartPct: 20, slicePct: 10 },
      { key: "lower-right", sliceStartPct: 35, slicePct: 10 },
    ]);
    const center = { x: 190, y: 190 };
    const angles = layouts
      .map((layout) => {
        const angleDeg = (Math.atan2(layout.labelY - center.y, layout.labelX - center.x) * 180) / Math.PI;
        return angleDeg < -90 ? angleDeg + 360 : angleDeg;
      })
      .sort((a, b) => a - b);
    const gaps = angles.slice(1).map((angle, index) => Math.round(angle - angles[index]));

    expect(layouts.every((layout) => layout.isExternal)).toBe(true);
    expect(layouts.every((layout) => !!layout.connectorPath)).toBe(true);
    expect(new Set(gaps)).toHaveLength(1);
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

  it("uses a global rotation compromise when that keeps connectors shorter overall", () => {
    const layouts = buildDashboardTasksCompletedLabelLayout([
      { key: "a", sliceStartPct: 19, slicePct: 6 },
      { key: "b", sliceStartPct: 45, slicePct: 6 },
      { key: "c", sliceStartPct: 69, slicePct: 6 },
      { key: "d", sliceStartPct: 95, slicePct: 6 },
    ]);

    expect(labelPct(layouts.find((layout) => layout.key === "a") as (typeof layouts)[number])).toBeCloseTo(22.5, 1);
    expect(labelPct(layouts.find((layout) => layout.key === "b") as (typeof layouts)[number])).toBeCloseTo(47.5, 1);
    expect(labelPct(layouts.find((layout) => layout.key === "c") as (typeof layouts)[number])).toBeCloseTo(72.5, 1);
    expect(labelPct(layouts.find((layout) => layout.key === "d") as (typeof layouts)[number])).toBeCloseTo(97.5, 1);
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
});
