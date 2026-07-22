import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TimeGoalCompleteOverlay reward badge", () => {
  const source = readFileSync(resolve(__dirname, "TimeGoalCompleteOverlay.tsx"), "utf8");
  const overlaysCss = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8");

  it("renders a decorative gold star arc around the completion badge", () => {
    expect(source).toContain('className="timeGoalCompleteTickWrap" aria-hidden="true"');
    expect(source).toContain('className="timeGoalCompleteStarArc"');
    expect(source.match(/className="timeGoalCompleteArcStar"/g)).toHaveLength(4);
    expect(source.indexOf('className="timeGoalCompleteStarArc"')).toBeLessThan(source.indexOf('className="timeGoalCompleteTickBadge"'));
    expect(source).not.toContain("timeGoalCompleteRewardEyebrows");
    expect(source).not.toContain("Task Reward");
  });

  it("scopes the star arc styling to the task-complete overlay", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteStarArc");
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteArcStar");
    expect(overlaysCss).toContain("width: 280px;");
    expect(overlaysCss).toContain("--star-size: 36px;");
    expect(overlaysCss).toContain("--star-size: 43.5px;");
    expect(overlaysCss).not.toContain("--star-size: 66px;");
    expect(overlaysCss).not.toContain("--star-x: 0px;");
    expect(overlaysCss).toContain("--star-x: -86px;");
    expect(overlaysCss).toContain("--star-x: 86px;");
    expect(overlaysCss).toContain("transform-origin: 50% calc(50% + 220px);");
    expect(overlaysCss).toContain("animation: timeGoalCompleteStarArcIn 2200ms");
    expect(overlaysCss).toContain("760ms both;");
    expect(overlaysCss).toContain("transform: translateX(-50%) rotate(-34deg);");
    expect(overlaysCss).toContain("transform: translateX(-50%) rotate(0deg);");
    expect(overlaysCss).not.toContain("rotate(-24deg)");
    expect(overlaysCss).not.toContain("rotate(2deg)");
    expect(overlaysCss).not.toContain("--star-start-x:");
    expect(overlaysCss).not.toContain("--star-start-y:");
    expect(overlaysCss).not.toContain("--star-mid-x:");
    expect(overlaysCss).not.toContain("--star-sweep-x:");
    expect(overlaysCss).not.toContain("--star-delay:");
    expect(overlaysCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteStarArc{\n    animation: none;");
  });

  it("adds a subtle radial burst behind the task-complete modal content", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .timeGoalCompletePrimitiveModal::after");
    expect(overlaysCss).toContain("repeating-conic-gradient(");
    expect(overlaysCss).toContain("from -5deg at 50% 46%");
    expect(overlaysCss).toContain("rgba(201, 255, 36, .055) 0deg 7deg");
    expect(overlaysCss).toContain("mix-blend-mode: screen;");
  });

  it("animates the circled tick with a rubber scale-in effect", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteTickBadge");
    expect(overlaysCss).toContain("animation: timeGoalCompleteTickRubberIn 620ms");
    expect(overlaysCss).toContain("@keyframes timeGoalCompleteTickRubberIn");
    expect(overlaysCss).toContain("transform: scale(.22);");
    expect(overlaysCss).toContain("transform: scale(1.24);");
    expect(overlaysCss).toContain("transform: scale(.92);");
    expect(overlaysCss).toContain("transform: scale(1.07);");
    expect(overlaysCss).toContain("transform: scale(1);");
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteTickBadge{\n    animation: none;");
  });

  it("reveals awarded XP with a drop and subtle landing bounce", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay #timeGoalCompleteText.isXpRevealDropping");
    expect(overlaysCss).toContain("animation: timeGoalXpSubtextDropIn 680ms");
    expect(overlaysCss).toContain("@keyframes timeGoalXpSubtextDropIn");
    expect(overlaysCss).toContain("transform: scale(2.65);");
    expect(overlaysCss).toContain("transform: scale(.9);");
    expect(overlaysCss).toContain("transform: scaleX(1.08) scaleY(.9);");
    expect(overlaysCss).toContain("transform: scaleX(.98) scaleY(1.04);");
    expect(overlaysCss).toContain("transform: scale(1);");
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay #timeGoalCompleteText.isXpRevealDropping,");
    expect(overlaysCss).toContain("@keyframes timeGoalXpSplashText");
    expect(overlaysCss).toContain("@keyframes timeGoalXpSplashTextHold");
    expect(overlaysCss).toContain("transform: translateY(-72px) scale(.82);");
    expect(overlaysCss).toContain("transform: translateY(9px) scale(1.04);");
    expect(overlaysCss).toContain("transform: translateY(-5px) scale(.99);");
    expect(overlaysCss).toContain("transform: translateY(0) scale(1);");
    expect(overlaysCss).toContain("transform: translateY(9px) scale(1.92);");
    expect(overlaysCss).toContain("transform: translateY(0) scale(1.82);");
  });

  it("varies confetti motion and uses a slower falling path", () => {
    expect(source).toContain('className="timeGoalCompleteConfettiCanvas"');
    expect(source).toContain("const className = `timeGoalConfettiPiece");
    expect(source).toContain("className={piece.className}");
    expect(source).toContain("const width = 3 + rand() * 22;");
    expect(source).toContain("const height = 4 + rand() * 26;");
    expect(source).toContain("const duration = 3.45 + rand() * 1.85 + scale * 0.34;");
    expect(source).toContain('"--sway-c"');
    expect(source).toContain('"--drift-a"');
    expect(overlaysCss).toContain("animation: timeGoalConfettiFall var(--dur, 4.2s)");
    expect(overlaysCss).toContain(".timeGoalCompleteConfettiStage.hasCanvasConfetti .timeGoalConfettiPiece");
    expect(overlaysCss).toContain("24%{ top:14%;");
    expect(overlaysCss).toContain("74%{ top:78%;");
  });
});
