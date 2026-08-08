import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DashboardPageContent from "./DashboardPageContent";

describe("Dashboard Next Best Action card", () => {
  it("renders accessible loading and action hooks without a ranked list", () => {
    const html = renderToStaticMarkup(createElement(DashboardPageContent, { active: true }));

    expect(html).toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain('aria-label="Next Best Action"');
    expect(html).toContain('id="dashboardNextBestActionTimeSelect"');
    expect(html).toContain('<option value="10">10m</option>');
    expect(html).toContain('<option value="20">20m</option>');
    expect(html).toContain('<option value="30">30m</option>');
    expect(html).toContain('<option value="60">60m</option>');
    expect(html).toContain('<option value="any" selected="">Any</option>');
    expect(html).toContain('data-next-best-action="start"');
    expect(html).toContain('data-next-best-action="alternative"');
    expect(html).toContain('data-next-best-action="dismiss"');
    expect(html).toContain('data-next-best-action="why"');
    expect(html).not.toContain('data-next-best-action-rank');
    expect(html).toContain('id="dashboardDailyExecutiveBriefCard"');
    expect(html).toContain('aria-label="Daily Executive Brief"');
    expect(html).toContain('id="dashboardDailyExecutiveBriefToggle"');
    expect(html).toContain('id="dashboardDailyExecutiveBriefRefresh"');
    expect(html).toContain('id="dashboardDailyCapacityCard"');
    expect(html).toContain('aria-label="Today&#x27;s capacity"');
    expect(html).toContain('id="dashboardDailyCapacityRange"');
    expect(html).toContain('id="dashboardDailyCapacityStatus"');
    expect(html).toContain('id="dashboardDailyCapacityAdjust"');
    expect(html).toContain('id="dashboardDailyCapacityAdjustOverlay"');
    expect(html).toContain('aria-describedby="dashboardDailyCapacityAdjustDescription"');
    expect(html).toContain('data-daily-capacity="close"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-daily-capacity-state-option="LIGHT"');
    expect(html).toContain('id="dashboardDailyCapacityCustomMinutesInput"');
    expect(html).toContain('data-daily-capacity="clear"');
  });
});
