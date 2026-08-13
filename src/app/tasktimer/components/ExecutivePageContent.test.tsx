import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ExecutivePageContent from "./ExecutivePageContent";

describe("ExecutivePageContent", () => {
  it("renders the decision-support hierarchy and keeps existing feature hooks", () => {
    const html = renderToStaticMarkup(createElement(ExecutivePageContent, { active: true }));

    expect(html).toContain('id="appPageExecutive"');
    expect(html).toContain("<h1>Executive Function</h1>");
    expect(html).not.toContain('<p class="executiveEyebrow">Executive</p>');
    expect(html).toContain("Next best action");
    expect(html).toContain("Today");
    expect(html).toContain("Capacity confidence");
    expect(html).toContain('id="executiveCapacityConfidence"');
    expect(html).toContain('data-executive-metric-helper-card="plan-health"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("Plan health compares your remaining estimated work with today&#x27;s capacity.");
    expect(html).toContain("Significantly overloaded:");
    expect(html).toContain('class="executivePlanHealthRealistic"');
    expect(html).toContain('class="executivePlanHealthSlightlyOverloaded"');
    expect(html).toContain('class="executivePlanHealthSignificantlyOverloaded"');
    expect(html).toContain('class="executiveCapacityConfidenceHigh"');
    expect(html).toContain('class="executiveCapacityConfidenceMedium"');
    expect(html).toContain('class="executiveCapacityConfidenceLow"');
    expect(html).toContain("TaskLaunch starts with your manual capacity setting or recent focus history");
    expect(html).toContain("at least 14 valid history days with stable results.");
    expect(html).toContain("Executive tools");
    expect(html).toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain('id="dashboardDailyCapacityCard"');
    expect(html).toContain("executiveCapacityServiceHost");
    expect(html).toContain('id="dashboardScheduleRepairOverlay"');
    expect(html).toContain('id="dashboardRecoveryOverlay"');
    expect(html).toContain('href="/brain-dump"');
  });

  it("removes the duplicated Today's Plan card and keeps adjustment hooks", () => {
    const html = renderToStaticMarkup(createElement(ExecutivePageContent, { active: true }));

    expect(html).not.toContain('id="dashboardDailyExecutiveBriefCard"');
    expect(html).not.toContain("executivePlanCard");
    expect(html).not.toContain("Today&apos;s plan");
    expect(html).not.toContain("What today looks like");
    expect(html).toContain("executiveCapacityServiceHost");
    expect(html).toContain('data-daily-capacity="adjust"');
    expect(html).toContain('id="dashboardDailyCapacityAdjustOverlay"');
    expect(html).toContain('class="executiveAttentionStack"');
    expect(html).not.toContain("Recovery Mode is available whenever your plan needs a reset.");
    expect(html).not.toContain("schedule does not need repair");
  });
});
