import { readFileSync } from "node:fs";
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
  it("does not render a duplicate Dashboard Brain Dump entry", () => {
    const html = renderDashboardMarkup();

    expect(html).not.toContain('href="/brain-dump"');
    expect(html).not.toContain('aria-label="Brain Dump"');
    expect(html).not.toContain('data-brain-dump-entry="dashboard"');
    expect(html).not.toContain(">Brain Dump<");
  });

  it("omits Executive Summary and preserves activity summaries", () => {
    const html = renderDashboardMarkup();

    expect(html).not.toContain(">Time Tracked<");
    expect(html).not.toContain("dashboardActivityOverviewTitleRow");
    expect(html).not.toContain('id="dashboardExecutiveSummary"');
    expect(html).toContain('id="dashboardActivityTodayHoursValue"');
    expect(html).toContain('id="dashboardActivityWeeklyGoalsValue"');
    expect(html).not.toContain('aria-label="Executive summary"');
    expect(html).not.toContain('class="dashboardExecutiveSummaryStatusRow"');
    expect(html).not.toContain('class="dashboardExecutiveSummaryStatusLabel">Workload Assessment<');
    expect(html).not.toContain('id="dashboardExecutiveSummaryHeading"');
    expect(html).not.toContain(">Executive Summary<");
    expect(html).not.toContain(">NEXT BEST ACTION<");
    expect(html).not.toContain('id="dashboardExecutiveSummaryNext"');
    expect(html).not.toContain('id="dashboardExecutiveSummaryStart"');
    expect(html).not.toContain('class="dashboardExecutiveSummaryDivider"');
    expect(html).not.toContain('href="/executive"');
    expect(html).not.toContain(">Open Executive<");
    expect(html).not.toContain('class="dashboardExecutiveSummaryActions"');
    expect(html).not.toContain('class="dashboardExecutiveSummaryFacts"');
    expect(html).not.toContain('id="dashboardDailyCapacityCard"');
    expect(html).not.toContain('id="dashboardNextBestActionCard"');
    expect(html).not.toContain('id="dashboardScheduleRepairCard"');
    expect(html).not.toContain('id="dashboardRecoveryCard"');
  });

  it("places Time Tracked across two desktop columns and moves Momentum to the second row", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const desktopOrderCss = css.slice(css.indexOf("/* Desktop dashboard panel order: Time Tracked spans two columns, Momentum starts row two. */"));
    const activityRule =
      desktopOrderCss.match(/\.dashboardIntegratedPanel > \.dashboardActivityOverviewCard\{[\s\S]*?\n  \}/)?.[0] || "";
    const momentumRule =
      desktopOrderCss.match(/\.dashboardSupportGrid > \.dashboardMomentumCard\{[\s\S]*?\n  \}/)?.[0] || "";
    const tasksRule =
      desktopOrderCss.match(/\.dashboardSupportGrid > \.dashboardTasksCompletedCard\{[\s\S]*?\n  \}/)?.[0] || "";
    const activityHeadRule =
      desktopOrderCss.match(/\.dashboardIntegratedPanel \.dashboardActivityOverviewHead\{[\s\S]*?\n  \}/)?.[0] || "";
    const activityBodyRule =
      desktopOrderCss.match(/\.dashboardIntegratedPanel \.dashboardActivityOverviewBody\{[\s\S]*?\n  \}/)?.[0] || "";

    expect(activityRule).toContain("grid-column:1 / span 2 !important;");
    expect(activityRule).toContain("grid-row:1 !important;");
    expect(activityHeadRule).toContain("grid-column:1 / -1 !important;");
    expect(activityHeadRule).toContain("grid-row:1 !important;");
    expect(activityBodyRule).toContain("grid-column:1 / -1 !important;");
    expect(activityBodyRule).toContain("grid-row:2 !important;");
    expect(momentumRule).toContain("grid-column:2 !important;");
    expect(momentumRule).toContain("grid-row:2 !important;");
    expect(tasksRule).toContain("grid-column:3 !important;");
    expect(tasksRule).toContain("grid-row:1 !important;");
  });

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
