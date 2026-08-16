import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import ExecutivePageContent, {
  EXECUTIVE_PAGE_REFRESH_COOLDOWN_MS,
  getExecutivePageRefreshRemainingMs,
} from "./ExecutivePageContent";

describe("ExecutivePageContent", () => {
  it("rate limits a full-page refresh to once per minute", () => {
    expect(getExecutivePageRefreshRemainingMs(1_000, 1_000)).toBe(
      EXECUTIVE_PAGE_REFRESH_COOLDOWN_MS,
    );
    expect(getExecutivePageRefreshRemainingMs(1_000, 60_999)).toBe(1);
    expect(getExecutivePageRefreshRemainingMs(1_000, 61_000)).toBe(0);
  });

  it("lets the embedded Brain Dump use the full Executive panel width", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/tasktimer/styles/03-dashboard.css"),
      "utf8",
    );

    expect(css).toContain(
      '#app[aria-label="TaskLaunch App"] #appPageExecutive .brainDumpEmbeddedShell{width:100%;max-width:none;margin:0}',
    );
    expect(css).toContain(
      ".brainDumpEmbeddedPanel{width:100%;max-width:none;",
    );
  });

  it("uses the Next Best Action Alternative primitive for all four Executive tools", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/app/tasktimer/styles/03-dashboard.css"),
      "utf8",
    );
    const html = renderToStaticMarkup(
      createElement(ExecutivePageContent, { active: true }),
    );

    expect(
      html.match(
        /<button class="btn btn-ghost" type="button" data-(?:schedule-repair="review"|recovery="open"|daily-capacity="adjust"|executive-brain-dump-open)/g,
      ),
    ).toHaveLength(4);
    expect(html).not.toContain("executiveToolButton");
    expect(html).not.toContain("executiveToolActionButton");
    expect(css).toContain(
      '#app[aria-label="TaskLaunch App"] #appPageExecutive .executiveToolLinks>.btn .executiveToolLabel{font-family:Orbitron,"Bahnschrift","Segoe UI Variable","Segoe UI",Arial,sans-serif!important}',
    );
    expect(css).toContain(
      '#app[aria-label="TaskLaunch App"] #appPageExecutive .executiveToolLinks>.btn,#app[aria-label="TaskLaunch App"] #appPageExecutive .executiveToolLinks>.btn:hover:not(:disabled),#app[aria-label="TaskLaunch App"] #appPageExecutive .executiveToolLinks>.btn:focus-visible{border-color:#1a1b20!important;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012) 48%,rgba(0,0,0,.08)),#111216!important}',
    );
    expect(css).toContain(
      "background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.012) 48%,rgba(0,0,0,.08)),#111216 !important",
    );
    expect(css).toContain(
      ".executiveHeader{padding:2px 2px 18px;border-bottom:0}",
    );
    expect(css).toContain(
      ".executiveToolIcon{box-sizing:content-box;flex:0 0 26px;width:26px;height:26px;padding-inline:8px",
    );
    expect(css).toContain(
      ".executiveToolCopy small{color:#aeb6c7;font-family:var(--font-readable)",
    );
    expect(css).toContain(".dashboardNextBestActionTimeGoal{");
    expect(css).toContain(".dashboardNextBestActionTimeGoal[hidden]{");
  });

  it("renders the decision-support hierarchy and keeps existing feature hooks", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutivePageContent, { active: true }),
    );

    expect(html).toContain('id="appPageExecutive"');
    expect(html).toContain("<h1>Executive Function</h1>");
    expect(html).not.toContain('<p class="executiveEyebrow">Executive</p>');
    expect(html).toContain("Next best action");
    expect(html).toContain("Today");
    expect(html).toContain('id="executiveTodayLocalTime"');
    expect(html).toContain("Local time");
    expect(html).toContain('id="executivePageRefreshBtn"');
    expect(html).toContain("Refresh");
    expect(html).toContain("Remaining capacity");
    expect(html).toContain('src="/icons/icons_default/capacity_full.webp"');
    expect(html).toContain("Capacity confidence");
    expect(html).toContain('id="executiveCapacityConfidence"');
    expect(html.match(/data-executive-metric-loading="true"/g)).toHaveLength(4);
    expect(html).toContain('data-executive-metric-helper-card="plan-health"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain(
      "Plan health compares your remaining estimated work with today&#x27;s capacity.",
    );
    expect(html).toContain("Significantly overloaded:");
    expect(html).toContain('class="executivePlanHealthRealistic"');
    expect(html).toContain('class="executivePlanHealthSlightlyOverloaded"');
    expect(html).toContain(
      'class="executivePlanHealthSignificantlyOverloaded"',
    );
    expect(html).toContain('class="executiveCapacityConfidenceHigh"');
    expect(html).toContain('class="executiveCapacityConfidenceMedium"');
    expect(html).toContain('class="executiveCapacityConfidenceLow"');
    expect(html).toContain(
      "TaskLaunch starts with your manual capacity setting or recent focus history",
    );
    expect(html).toContain(
      "at least 14 valid history days with stable results.",
    );
    expect(html).toContain('aria-label="Executive tools"');
    expect(html).not.toContain('id="executiveToolsHeading"');
    expect(html).not.toContain("Adjust the plan");
    expect(html).not.toContain(
      "Powerful actions to optimize your plan and performance.",
    );
    expect(html).toContain("Repair today&#x27;s plan");
    expect(html).toContain('id="dashboardScheduleRepairToolStatus"');
    expect(html).toContain(
      'class="executiveToolIcon executiveToolRepairIcon" src="/icons/icons_default/repair.webp"',
    );
    expect(html).toContain("Recovery Mode");
    expect(html).toContain("Adjust capacity");
    expect(html).toContain("Brain Dump");
    expect(html).toContain(
      "Review today&#x27;s workload, suggested changes, and rebalance tasks.",
    );
    expect(html).toContain(
      "Reset priorities, defer flexible work, and rebuild a manageable plan when today is no longer working.",
    );
    expect(html).toContain(
      "Set how much focused work you can realistically handle today without changing your task history.",
    );
    expect(html).toContain(
      "Capture unstructured thoughts, extract potential tasks, and review them before anything is created.",
    );
    expect(html).toContain('class="executiveToolLabel"');
    expect(html).toContain('id="dashboardNextBestActionCard"');
    expect(html).toContain(
      'class="dashboardNextBestActionTimeGoal" id="dashboardNextBestActionTimeGoal" hidden="" aria-hidden="true"',
    );
    expect(html).toContain('id="dashboardDailyCapacityCard"');
    expect(html).toContain("executiveCapacityServiceHost");
    expect(html).toContain('id="dashboardScheduleRepairOverlay"');
    expect(html).toContain('id="dashboardRecoveryCard"');
    expect(html).toContain('data-executive-brain-dump-open="true"');
    expect(html).toContain('data-brain-dump-entry="executive"');
    expect(html).toContain('class="executiveFlipScene"');
    expect(html).toContain('id="brainDumpTitle"');
  });

  it("removes the duplicated Today's Plan card and keeps adjustment hooks", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutivePageContent, { active: true }),
    );

    expect(html).not.toContain('id="dashboardDailyExecutiveBriefCard"');
    expect(html).not.toContain("executivePlanCard");
    expect(html).not.toContain("Today&apos;s plan");
    expect(html).not.toContain("What today looks like");
    expect(html).toContain("executiveCapacityServiceHost");
    expect(html).toContain('data-daily-capacity="adjust"');
    expect(html).toContain('id="dashboardDailyCapacityAdjustOverlay"');
    expect(html).toContain('class="executiveAttentionStack"');
    expect(html).not.toContain(
      "Recovery Mode is available whenever your plan needs a reset.",
    );
    expect(html).not.toContain("schedule does not need repair");
  });

  it("uses the simplified Schedule Repair review actions", () => {
    const html = renderToStaticMarkup(
      createElement(ExecutivePageContent, { active: true }),
    );
    const scheduleRepairOverlay = html.slice(
      html.indexOf('id="dashboardScheduleRepairOverlay"'),
    );

    expect(html).toContain("dashboardScheduleRepairPrimitiveOverlay");
    expect(scheduleRepairOverlay).toContain("dashboardScheduleRepairPrimitiveModal");
    expect(scheduleRepairOverlay).toContain("dashboardScheduleRepairPrimitiveFooter");
    expect(scheduleRepairOverlay).toContain('id="dashboardScheduleRepairFooterStatus"');
    expect(scheduleRepairOverlay).toContain('data-schedule-repair="close">Cancel');
    expect(scheduleRepairOverlay).toContain('data-schedule-repair="dismiss">Dismiss');
    expect(scheduleRepairOverlay).toContain('data-schedule-repair="apply">Accept');
    expect(scheduleRepairOverlay).not.toContain('data-schedule-repair="refresh"');
    expect(scheduleRepairOverlay).not.toContain("Refresh proposal");
  });
});
