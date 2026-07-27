import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("DailyRewardOverlay", () => {
  const source = readFileSync(resolve(__dirname, "DailyRewardOverlay.tsx"), "utf8");
  const taskCompleteSource = readFileSync(resolve(__dirname, "TimeGoalCompleteOverlay.tsx"), "utf8");
  const alertsSource = readFileSync(resolve(__dirname, "GlobalTaskAlerts.tsx"), "utf8");
  const overlaysCss = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8");

  it("uses separate modal IDs from task completion", () => {
    expect(source).toContain('id="dailyRewardOverlay"');
    expect(source).toContain('id="dailyRewardTitle"');
    expect(source).toContain('id="dailyRewardText"');
    expect(source).toContain('id="dailyRewardXpValue"');
    expect(source).toContain('className="modalSubtext XPRewardText"');
    expect(source).not.toContain('className="modalSubtext confirmText"');
    expect(source).toContain('<span id="dailyRewardXpValue">10</span> XP');
    expect(source).not.toContain("XP Awarded:");
    expect(source).toContain('id="dailyRewardClaimBtn"');
    expect(source).not.toContain('id="timeGoalCompleteOverlay"');
    expect(source).not.toContain('id="timeGoalCompleteXpValue"');
    expect(source).not.toContain('id="timeGoalCompleteCloseBtn"');
  });

  it("does not alter task-complete modal IDs", () => {
    expect(taskCompleteSource).toContain('id="timeGoalCompleteOverlay"');
    expect(taskCompleteSource).toContain('id="timeGoalCompleteXpValue"');
    expect(taskCompleteSource).toContain('id="timeGoalCompleteCloseBtn"');
    expect(taskCompleteSource).not.toContain('id="dailyRewardOverlay"');
  });

  it("renders with global task alerts", () => {
    expect(alertsSource).toContain('import DailyRewardOverlay from "./DailyRewardOverlay";');
    expect(alertsSource).toContain("<DailyRewardOverlay />");
  });

  it("shares the task-complete visual structure while preserving daily reward hooks", () => {
    expect(source).toContain('import AppImg from "@/components/AppImg";');
    expect(source).toContain("timeGoalCompletePrimitiveOverlay dailyRewardPrimitiveOverlay");
    expect(source).toContain("timeGoalCompletePrimitiveModal dailyRewardPrimitiveModal");
    expect(source).toContain("timeGoalCompleteRewardCard dailyRewardCard");
    expect(source).toContain('className="dailyRewardBoxImage"');
    expect(source).toContain('src="/icons/achievement/daily-reward-box.png"');
    expect(source).toContain('alt="" aria-hidden="true"');
    expect(source).toContain("timeGoalCompleteActionGrid timeGoalCompletePrimitiveFooter dailyRewardActionGrid dailyRewardPrimitiveFooter");
    expect(source).toContain('id="dailyRewardClaimBtn"');
    expect(source).not.toContain("dailyRewardBadge");
    expect(source).not.toContain("dailyRewardTickMark");
    expect(source).not.toContain("dailyRewardConfettiStage");
    expect(source).not.toContain("dailyRewardConfettiCanvas");
    expect(source).not.toContain("timeGoalCompleteNextTasks");
  });

  it("uses a daily reward purple radial burst and reduced-motion treatment", () => {
    expect(overlaysCss).toContain("#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .timeGoalCompletePrimitiveModal::after{");
    expect(overlaysCss).toContain("radial-gradient(circle at 50% 50%, rgba(219, 178, 255, .28) 0 12%");
    expect(overlaysCss).toContain("rgba(176, 73, 255, .16) 0deg 7deg");
    expect(overlaysCss).toContain("rgba(180, 145, 255, .09)");
    expect(overlaysCss).toMatch(
      /#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after,\s*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\{[\s\S]*width: max\(140%, 560px\);[\s\S]*aspect-ratio: 1;[\s\S]*translate: -50% -46%;[\s\S]*border-radius: 50%;[\s\S]*clip-path: circle\(50% at 50% 50%\);/,
    );
    expect(overlaysCss).toContain("opacity: .88;");
    expect(overlaysCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\s*\{[\s\S]*animation: none;/,
    );
  });

  it("inherits task-complete reward card, XP, and action grid styling", () => {
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay \.timeGoalCompleteRewardCard,\s*#dailyRewardOverlay \.timeGoalCompleteRewardCard\{/);
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteTickBadge{");
    expect(overlaysCss).not.toContain("#dailyRewardOverlay .timeGoalCompleteTickBadge");
    expect(overlaysCss).toContain("#dailyRewardOverlay .dailyRewardBoxImage{");
    expect(overlaysCss).toContain("#dailyRewardOverlay .timeGoalCompleteTickWrap{");
    expect(overlaysCss).toContain("margin: 2px 0 14px;");
    expect(overlaysCss).toContain("top: -24px;");
    expect(overlaysCss).toContain("width: 144px;");
    expect(overlaysCss).toContain("animation: timeGoalCompleteTickRubberIn 620ms");
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay #timeGoalCompleteText,\s*#dailyRewardOverlay #dailyRewardText\{/);
    expect(overlaysCss).toContain("#dailyRewardOverlay .timeGoalCompleteRewardCard #dailyRewardText.XPRewardText{");
    expect(overlaysCss).toContain("color: gold !important;");
    expect(overlaysCss).toContain("font-size: 32px !important;");
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay \.timeGoalCompleteActionGrid,\s*#dailyRewardOverlay \.timeGoalCompleteActionGrid\{/);
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveFooter,\s*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveFooter\{/);
  });
});
