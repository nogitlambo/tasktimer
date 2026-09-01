import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DashboardPageContent from "./DashboardPageContent";
import ExecutivePageContent from "./ExecutivePageContent";

describe("Dashboard Next Best Action card", () => {
  it("keeps the Dashboard compact and renders accessible action hooks on Executive", () => {
    const dashboardHtml = renderToStaticMarkup(
      createElement(DashboardPageContent, { active: true }),
    );
    const html = renderToStaticMarkup(
      createElement(ExecutivePageContent, { active: true }),
    );

    expect(dashboardHtml).toContain('id="dashboardExecutiveSummary"');
    expect(dashboardHtml).not.toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain('id="dashboardNextBestActionDailyProgress"');
    expect(html).toContain('aria-label="Next best action"');
    expect(html).not.toContain("Move the plan forward");
    expect(html).not.toContain("Available time");
    expect(html).not.toContain("data-next-best-action-time");
    expect(html).toContain('data-next-best-action="start"');
    expect(html).toContain('data-next-best-action="alternative"');
    expect(html).toContain('data-next-best-action="dismiss"');
    expect(html).not.toContain('data-next-best-action="why"');
    expect(html).toContain("Why this?");
    expect(html).not.toContain('id="dashboardNextBestActionWhy"');
    expect(html).not.toContain("data-next-best-action-rank");
    expect(html).not.toContain('id="dashboardDailyExecutiveBriefCard"');
    expect(html).not.toContain("executivePlanCard");
    expect(html).toContain('id="executiveCapacityConfidence"');
    expect(html).toContain('id="dashboardDailyCapacityCard"');
    expect(html).toContain("executiveCapacityServiceHost");
    expect(html).toContain('id="dashboardDailyCapacityRange"');
    expect(html).toContain('id="dashboardDailyCapacityStatus"');
    expect(html).toContain('data-daily-capacity="adjust"');
    expect(html).toContain('id="dashboardDailyCapacityAdjustOverlay"');
    expect(html).toContain(
      'class="overlay primitiveSciFiModalOverlay dashboardDailyCapacityAdjustPrimitiveOverlay"',
    );
    expect(html).toContain(
      'class="modal dashboardDailyCapacityAdjustPrimitiveModal modalConfirmation"',
    );
    expect(html).toContain(
      'aria-describedby="dashboardDailyCapacityAdjustDescription"',
    );
    expect(html).toContain('data-daily-capacity="close"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('data-daily-capacity-state-option="LIGHT"');
    expect(html).toContain('id="dashboardDailyCapacityCustomMinutesInput"');
    expect(html).toContain('data-daily-capacity="clear"');
    expect(html).toContain("dashboardDailyCapacityAdjustPrimitiveFooter");
    expect(html).toContain("primitiveSciFiModalPrimaryAction");
    const executiveSource = readFileSync(
      "src/app/tasktimer/components/ExecutivePageContent.tsx",
      "utf8",
    );
    expect(executiveSource).toContain(
      'import { createPortal } from "react-dom";',
    );
    expect(executiveSource).toContain(
      "createPortal(<DailyCapacityAdjustOverlay />, overlayPortalHost)",
    );
    expect(executiveSource).toContain(
      "createPortal(<ScheduleRepairOverlay />, overlayPortalHost)",
    );
    const css = readFileSync(
      "src/app/tasktimer/styles/04-overlays.css",
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(css).toContain(
      "#dashboardDailyCapacityAdjustOverlay.dashboardDailyCapacityAdjustPrimitiveOverlay{",
    );
    expect(css).toContain("z-index:1400 !important;");
    expect(css).toContain(
      "padding:max(18px, var(--safe-top)) 14px max(18px, var(--safe-bottom)) !important;",
    );
    expect(css).toContain("#dashboardScheduleRepairOverlay{");
    expect(css).toContain(
      "#dashboardDailyCapacityAdjustOverlay.dashboardDailyCapacityAdjustPrimitiveOverlay .dashboardDailyCapacityAdjustStates{",
    );
    expect(css).toContain(
      "grid-template-columns:repeat(4, minmax(0, 1fr)) !important;",
    );
    expect(css).toContain(
      "#dashboardDailyCapacityAdjustOverlay.dashboardDailyCapacityAdjustPrimitiveOverlay .dashboardDailyCapacityAdjustPrimitiveFooter{",
    );
    expect(css).toContain(
      "grid-template-columns:repeat(3, minmax(0, 1fr)) !important;",
    );
    expect(css).toContain("min-width:0 !important;");
  });
});
