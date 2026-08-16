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

  it("renders one compact Executive Summary and removes permanent executive cards", () => {
    const html = renderDashboardMarkup();

    expect(html).toContain('id="dashboardExecutiveSummary"');
    expect(html).toContain('class="dashboardPanelLabelRow dashboardExecutiveSummaryTitleRow"');
    expect(html).toContain('class="dashboardCardTitle dashboardPanelTitle dashboardExecutiveSummaryTitle" id="dashboardExecutiveSummaryHeading"');
    expect(html).toContain('class="dashboardPanelTitleDot dashboardPanelTitleDotExecutive"');
    expect(html).toContain(">Executive Summary<");
    expect(html).toContain(">NEXT BEST ACTION<");
    expect(html).toContain('id="dashboardExecutiveSummaryStart"');
    expect(html).toContain('class="dashboardExecutiveSummaryDivider"');
    expect(html.indexOf('id="dashboardExecutiveSummaryStart"')).toBeGreaterThan(html.indexOf('id="dashboardExecutiveSummaryNext"'));
    expect(html).not.toContain('href="/executive"');
    expect(html).not.toContain(">Open Executive<");
    expect(html).not.toContain('class="dashboardExecutiveSummaryActions"');
    expect(html).not.toContain('class="dashboardExecutiveSummaryFacts"');
    expect(html).not.toContain('id="dashboardDailyCapacityCard"');
    expect(html).not.toContain('id="dashboardNextBestActionCard"');
    expect(html).not.toContain('id="dashboardScheduleRepairCard"');
    expect(html).not.toContain('id="dashboardRecoveryCard"');
  });

  it("keeps the Executive Summary on the shared dashboard panel baseline", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const referenceCss = css.slice(css.indexOf("/* Activity Overview and Momentum reference redesign. */"));
    const sharedPanelRule =
      referenceCss.match(
        /body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardExecutiveSummary,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard\{[\s\S]*?\n\}/
      )?.[0] || "";
    const sharedPanelTopLineRule =
      referenceCss.match(
        /body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardExecutiveSummary::before,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard::before\{[\s\S]*?\n\}/
      )?.[0] || "";
    const executivePanelRule =
      referenceCss.match(
        /body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardExecutiveSummary\{[\s\S]*?\n\}/
      )?.[0] || "";
    const mobileSharedPanelRule =
      referenceCss.match(
        /@media \(max-width: 640px\)\{\n\s+body\[data-app-page="dashboard"\] #app\[aria-label="TaskLaunch App"\] #appPageDashboard \.dashboardIntegratedPanel > \.dashboardExecutiveSummary,\n[\s\S]*?\.dashboardSupportGrid > \.dashboardHeatCard\{[\s\S]*?\n  \}/
      )?.[0] || "";

    expect(sharedPanelRule).toContain(".dashboardIntegratedPanel > .dashboardExecutiveSummary,");
    expect(sharedPanelRule).toContain("border-radius:18px !important;");
    expect(sharedPanelRule).toContain("background:linear-gradient(180deg, var(--dashboard-reference-panel-bg-top), var(--dashboard-reference-panel-bg-bottom)) !important;");
    expect(sharedPanelTopLineRule).toContain(".dashboardIntegratedPanel > .dashboardExecutiveSummary::before,");
    expect(sharedPanelTopLineRule).toContain("background:linear-gradient(90deg, transparent, var(--dashboard-reference-border-strong), transparent) !important;");
    expect(executivePanelRule).toContain("padding:26px 28px !important;");
    expect(referenceCss).toContain(".dashboardExecutiveSummaryStatus[data-plan-health]{");
    expect(referenceCss).toContain("border-radius:999px !important;");
    expect(referenceCss).toContain("color:#ff7462 !important;");
    expect(mobileSharedPanelRule).toContain("border-radius:16px !important;");
  });

  it("keeps the Executive Summary launch action at the shared primitive button size on mobile", () => {
    const css = readFileSync("src/app/tasktimer/styles/03-dashboard.css", "utf8").replace(/\r\n/g, "\n");
    const mobileExecutiveStyles = css.slice(css.lastIndexOf("@media (max-width: 640px){"));
    const mobileLaunchRule =
      mobileExecutiveStyles.match(/\.dashboardExecutiveSummaryNext \.btn\{[\s\S]*?\n  \}/)?.[0] || "";

    expect(mobileLaunchRule).toContain("flex:0 0 auto !important;");
    expect(mobileLaunchRule).toContain("align-self:flex-start !important;");
    expect(mobileLaunchRule).toContain("min-height:48px !important;");
    expect(mobileLaunchRule).not.toContain("flex:1 1 140px !important;");
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
