import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DashboardPageContent from "./DashboardPageContent";

function renderDashboardMarkup() {
  return renderToStaticMarkup(createElement(DashboardPageContent, { active: true }));
}

function formatSvgNumber(value: number) {
  return String(value);
}

describe("DashboardPageContent momentum dial markers", () => {
  it("renders multiplier threshold markers at 40, 70, and 90", () => {
    const html = renderDashboardMarkup();

    expect(html).toContain('data-momentum-multiplier-threshold="40"');
    expect(html).toContain('data-momentum-multiplier-threshold="70"');
    expect(html).toContain('data-momentum-multiplier-threshold="90"');
    expect(html).not.toContain('data-momentum-multiplier-threshold="30"');
    expect(html).not.toContain('data-momentum-multiplier-threshold="60"');
  });

  it("draws the 90 marker from the inner arc line to the outer arc line", () => {
    const html = renderDashboardMarkup();
    const arcStartX = 22;
    const arcEndX = 165;
    const arcBaseY = 79;
    const arcRadius = 72;
    const centerX = (arcStartX + arcEndX) / 2;
    const centerY = arcBaseY + Math.sqrt(arcRadius * arcRadius - Math.pow((arcEndX - arcStartX) / 2, 2));
    const arcStartAngleDeg = (Math.acos((arcStartX - centerX) / arcRadius) * 180) / Math.PI;
    const arcEndAngleDeg = (Math.acos((arcEndX - centerX) / arcRadius) * 180) / Math.PI;
    const angleRad = ((arcStartAngleDeg - 0.9 * (arcStartAngleDeg - arcEndAngleDeg)) * Math.PI) / 180;
    const markerInnerRadius = 63.5;
    const markerOuterRadius = 80.5;
    const x1 = centerX + Math.cos(angleRad) * markerInnerRadius;
    const y1 = centerY - Math.sin(angleRad) * markerInnerRadius;
    const x2 = centerX + Math.cos(angleRad) * markerOuterRadius;
    const y2 = centerY - Math.sin(angleRad) * markerOuterRadius;

    expect(html).toContain(
      `<line x1="${formatSvgNumber(x1)}" y1="${formatSvgNumber(y1)}" x2="${formatSvgNumber(x2)}" y2="${formatSvgNumber(
        y2
      )}" stroke="rgba(0, 0, 0, 0.92)" stroke-width="1.35" stroke-linecap="butt"`
    );
  });
});
