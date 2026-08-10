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
    expect(html).toContain("Executive tools");
    expect(html).toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain('id="dashboardDailyCapacityCard"');
    expect(html).toContain('id="dashboardScheduleRepairOverlay"');
    expect(html).toContain('id="dashboardRecoveryOverlay"');
    expect(html).toContain('href="/brain-dump"');
  });

  it("keeps capacity inside Today's Plan and omits normal-state recovery copy", () => {
    const html = renderToStaticMarkup(createElement(ExecutivePageContent, { active: true }));

    expect(html.indexOf('id="dashboardDailyExecutiveBriefCard"')).toBeLessThan(html.indexOf('id="dashboardDailyCapacityCard"'));
    expect(html.indexOf('id="dashboardDailyCapacityCard"')).toBeLessThan(html.indexOf('id="dashboardScheduleRepairCard"'));
    expect(html).toContain('class="executivePlanBody"');
    expect(html).toContain('class="executiveAttentionStack"');
    expect(html).not.toContain("Recovery Mode is available whenever your plan needs a reset.");
    expect(html).not.toContain("schedule does not need repair");
  });
});
