import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TimeGoalCompleteOverlay reward badge", () => {
  const source = readFileSync(resolve(__dirname, "TimeGoalCompleteOverlay.tsx"), "utf8");
  const overlaysCss = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8");

  it("uses confirmation modal chrome while preserving task-complete hooks", () => {
    expect(source).toContain('className="modal modalConfirmation timeGoalCompletePrimitiveModal"');
    expect(source).toContain('id="timeGoalCompleteOverlay"');
    expect(source).toContain('id="timeGoalCompleteXpValue"');
    expect(source).toContain('id="timeGoalCompleteCloseBtn"');
    expect(source).toContain("primitiveConfirmationModalAction timeGoalCompletePrimitiveAction");
    expect(source).not.toContain("primitiveSciFiModalAction primitiveSciFiModalPrimaryAction timeGoalCompletePrimitiveAction");
    const confirmationChromeRule =
      overlaysCss.match(
        /#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.modal\.timeGoalCompletePrimitiveModal\.modalConfirmation,\s*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.modal\.timeGoalCompletePrimitiveModal\.modalConfirmation\{[\s\S]*?\n\}/,
      )?.[0] ?? "";
    expect(confirmationChromeRule).toContain("width: min(420px, 100%) !important;");
    expect(confirmationChromeRule).toContain("border: 1px solid rgba(86, 90, 98, .86) !important;");
    expect(confirmationChromeRule).toContain("border-radius: 8px !important;");
    expect(confirmationChromeRule).toContain("box-shadow: var(--modal-shadow) !important;");
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay:has(#timeGoalCompleteNextTasks:not([hidden])) .modal.timeGoalCompletePrimitiveModal.modalConfirmation{",
    );
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation,\n#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation{",
    );
    expect(overlaysCss).toContain("width: min(525px, 100%) !important;");
    expect(overlaysCss).toContain("max-width: min(525px, calc(100vw - 28px)) !important;");
    expect(overlaysCss).toContain("border: 0 !important;");
    expect(overlaysCss).toContain("overflow: hidden !important;");
    expect(overlaysCss).toContain("overflow-y: hidden !important;");
    expect(overlaysCss).toContain("inset 0 0 34px rgba(0, 0, 0, .42)");
    expect(overlaysCss).toContain("inset 0 0 86px rgba(0, 0, 0, .26) !important;");
    expect(overlaysCss).toContain("width: min(900px, 100%) !important;");
    expect(overlaysCss).toContain("max-width: min(900px, calc(100vw - 28px)) !important;");
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation::after,\n#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation::after{",
    );
    expect(overlaysCss).toContain("top: 50% !important;");
    expect(overlaysCss).toContain("translate: -50% -50% !important;");
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation > .timeGoalCompleteConfettiStage{",
    );
    expect(overlaysCss).toContain("position: absolute !important;");
    expect(overlaysCss).toContain("z-index: 30 !important;");
    expect(overlaysCss).toContain(".timeGoalCompleteConfettiCanvas,");
    expect(overlaysCss).toContain(".timeGoalConfettiPiece{");
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation .timeGoalCompleteRewardCard,\n#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .modal.timeGoalCompletePrimitiveModal.modalConfirmation .timeGoalCompleteRewardCard{",
    );
    expect(overlaysCss).toContain("background: transparent !important;");
    expect(overlaysCss).toContain("box-shadow: none !important;");
    expect(overlaysCss).toContain(
      "#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay.isClosing .modal.timeGoalCompletePrimitiveModal.modalConfirmation,",
    );
    expect(overlaysCss).toContain("animation: rewardConfirmationModalSlideDownOut 560ms");
    expect(overlaysCss).toContain("@keyframes rewardConfirmationModalSlideDownOut");
    expect(overlaysCss).toContain("63%{");
    expect(overlaysCss).toContain("transform: translateY(-12px) scale(1.01);");
    expect(overlaysCss).toContain("transform: translateY(calc(100dvh + 96px)) scale(.98);");
  });

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
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay \.timeGoalCompleteStarArc,\s*#dailyRewardOverlay \.timeGoalCompleteStarArc\s*\{\s*animation: none;/);
  });

  it("adds a visible radial burst behind the task-complete modal content", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay.timeGoalCompletePrimitiveOverlay .timeGoalCompletePrimitiveModal::after");
    expect(overlaysCss).not.toMatch(
      /#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after,\s*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\{\s*background:/,
    );
    expect(overlaysCss).toContain("repeating-conic-gradient(");
    expect(overlaysCss).toContain("from -5deg at 50% 50%");
    expect(overlaysCss).toContain("rgba(255, 246, 162, .18) 0 11%");
    expect(overlaysCss).toContain("rgba(201, 255, 36, .16)");
    expect(overlaysCss).toContain("rgba(201, 255, 36, .1) 0deg 7deg");
    expect(overlaysCss).toContain("#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .timeGoalCompletePrimitiveModal::after{");
    expect(overlaysCss).toContain("rgba(219, 178, 255, .18) 0 11%");
    const timeGoalBurstRule =
      Array.from(
        overlaysCss.matchAll(/#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\{[\s\S]*?\n\}/g),
      )
        .map((match) => match[0])
        .find((rule) => rule.includes("repeating-conic-gradient(")) ?? "";
    const dailyRewardBurstRule =
      Array.from(
        overlaysCss.matchAll(/#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\{[\s\S]*?\n\}/g),
      )
        .map((match) => match[0])
        .find((rule) => rule.includes("repeating-conic-gradient(")) ?? "";
    expect(overlaysCss).toMatch(
      /#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after,\s*#dailyRewardOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\{[\s\S]*top: 42%;[\s\S]*width: max\(170%, 440px\);[\s\S]*aspect-ratio: 1;[\s\S]*translate: -50% -42%;[\s\S]*border-radius: 50%;[\s\S]*-webkit-mask-image: radial-gradient\(circle at 50% 50%, #000 0 12%, rgba\(0, 0, 0, \.68\) 22%, rgba\(0, 0, 0, \.24\) 31%, rgba\(0, 0, 0, \.04\) 38%, transparent 41%\);/,
    );
    expect(overlaysCss).toContain("opacity: .82;");
    expect(overlaysCss).not.toContain("clip-path: circle(50% at 50% 50%);");
    expect(timeGoalBurstRule).not.toContain("mix-blend-mode:");
    expect(dailyRewardBurstRule).not.toContain("mix-blend-mode:");
    expect(overlaysCss).toContain("transform-origin: center;");
    expect(overlaysCss).toContain("animation: timeGoalCompleteWheelGlow 24s linear infinite;");
    expect(overlaysCss).toContain("backface-visibility: hidden;");
    expect(overlaysCss).toContain("contain: paint;");
    expect(timeGoalBurstRule).toContain("will-change: transform;");
    expect(dailyRewardBurstRule).toContain("will-change: transform;");
    expect(timeGoalBurstRule).not.toContain("will-change: transform, opacity, filter;");
    expect(dailyRewardBurstRule).not.toContain("will-change: transform, opacity, filter;");
    expect(overlaysCss).toContain("@keyframes timeGoalCompleteWheelGlow");
    expect(overlaysCss).toContain("transform: rotate(0deg);");
    expect(overlaysCss).toContain("transform: rotate(360deg);");
    const wheelGlowKeyframes = overlaysCss.match(/@keyframes timeGoalCompleteWheelGlow\{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(wheelGlowKeyframes).not.toContain("filter:");
    expect(wheelGlowKeyframes).not.toContain("opacity:");
    expect(overlaysCss).toContain("#dailyRewardOverlay.timeGoalCompletePrimitiveOverlay .timeGoalCompletePrimitiveModal::after{");
    expect(overlaysCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*#timeGoalCompleteOverlay\.timeGoalCompletePrimitiveOverlay \.timeGoalCompletePrimitiveModal::after\s*\{[\s\S]*animation: none;/);
  });

  it("lets the reward card block the outer radial beams without its own burst", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteRewardCard");
    expect(overlaysCss).not.toContain("#timeGoalCompleteOverlay .timeGoalCompleteRewardCard::before");
    expect(overlaysCss).not.toContain("repeating-conic-gradient(from -18deg at 50% 22%");
    expect(overlaysCss).toContain("linear-gradient(180deg, rgba(20, 28, 35, .48), rgba(12, 18, 24, .4))");
    expect(overlaysCss).toContain("#0d0f13;");
    expect(overlaysCss).toContain("box-shadow: 0 0 0 1px rgba(160, 190, 210, .08);");
  });

  it("animates the circled tick with a rubber scale-in effect", () => {
    expect(overlaysCss).toContain("#timeGoalCompleteOverlay .timeGoalCompleteTickBadge");
    expect(overlaysCss).not.toContain("#dailyRewardOverlay .timeGoalCompleteTickBadge");
    expect(overlaysCss).toContain("animation: timeGoalCompleteTickRubberIn 620ms");
    expect(overlaysCss).toContain("@keyframes timeGoalCompleteTickRubberIn");
    expect(overlaysCss).toContain("transform: scale(.22);");
    expect(overlaysCss).toContain("transform: scale(1.24);");
    expect(overlaysCss).toContain("transform: scale(.92);");
    expect(overlaysCss).toContain("transform: scale(1.07);");
    expect(overlaysCss).toContain("transform: scale(1);");
    expect(overlaysCss).toMatch(/#timeGoalCompleteOverlay \.timeGoalCompleteTickBadge,\s*#dailyRewardOverlay \.dailyRewardBoxImage\s*\{\s*animation: none;/);
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
    expect(source).toContain("Array.from({ length: 45 }, (_, index) => {");
    expect(source).not.toContain("Array.from({ length: 60 }, (_, index) => {");
    expect(source).toContain("className={piece.className}");
    expect(source).not.toContain("const direction = rand() > 0.5 ? 1 : -1;");
    expect(source).toContain("const angle = Math.PI * (0.16 + rand() * 0.68);");
    expect(source).toContain("const pressureBias = 1 - Math.abs(angle - Math.PI / 2) / (Math.PI / 2);");
    expect(source).toContain("const burstDistance = 230 + rand() * 190 + pressureBias * (60 + rand() * 90);");
    expect(source).toContain("const reentryX = burstX * 0.1");
    expect(source).toContain('"--start-y"');
    expect(source).toContain('"--burst-x"');
    expect(source).toContain('"--burst-y"');
    expect(source).toContain('"--reentry-x"');
    expect(source).toContain('"--reentry-y"');
    expect(source).toContain("const width = 3 + rand() * 22;");
    expect(source).toContain("const height = 4 + rand() * 26;");
    expect(source).toContain("const duration = 3.45 + rand() * 1.85 + scale * 0.34;");
    expect(source).toContain('"--sway-c"');
    expect(source).toContain('"--drift-a"');
    expect(overlaysCss).toContain("animation: timeGoalConfettiFall var(--dur, 4.2s)");
    expect(overlaysCss).toContain(".timeGoalCompleteConfettiStage.hasCanvasConfetti .timeGoalConfettiPiece");
    expect(overlaysCss).toContain("top: var(--start-y, 50%);");
    expect(overlaysCss).toContain("0%{ top:var(--start-y, 50%);");
    expect(overlaysCss).toContain("4%{ top:var(--start-y, 50%);");
    expect(overlaysCss).toContain("15%{ top:var(--start-y, 50%);");
    expect(overlaysCss).toContain("var(--burst-x-mid)");
    expect(overlaysCss).toContain("var(--burst-y-mid)");
    expect(overlaysCss).toContain("25%{ top:var(--start-y, 50%);");
    expect(overlaysCss).toContain("26%{ top:-18%; opacity:0;");
    expect(overlaysCss).toContain("var(--reentry-x)");
    expect(overlaysCss).toContain("var(--reentry-y, -96px)");
    expect(overlaysCss).toContain("31%{ top:-8%; opacity:var(--alpha, .9);");
    expect(overlaysCss).toContain("68%{ top:82%;");
    expect(overlaysCss).not.toContain("26%,39%");
  });
});
