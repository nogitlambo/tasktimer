import type { CSSProperties } from "react";
import AppImg from "@/components/AppImg";

type GoldFragment = {
  style: CSSProperties;
};

const CELEBRATION_RIBBONS = Array.from({ length: 5 });

function formatCssNumber(value: number, digits = 3): string {
  return Number(value.toFixed(digits)).toString();
}

function buildGoldFragments(): GoldFragment[] {
  let seed = 71;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 4294967296;
  };

  return Array.from({ length: 34 }, () => {
    const angle = rand() * Math.PI * 2;
    const dist = 58 + rand() * 138;
    const width = 3 + rand() * 14;
    const height = 2 + rand() * 9;
    return {
      style: {
        "--fx": `${formatCssNumber(Math.cos(angle) * dist)}px`,
        "--fy": `${formatCssNumber(Math.sin(angle) * dist)}px`,
        "--fw": `${formatCssNumber(width)}px`,
        "--fh": `${formatCssNumber(height)}px`,
        "--fr": `${Math.floor(rand() * 360)}deg`,
        "--fs": `${Math.floor(rand() * 540 - 270)}deg`,
        "--fd": `${formatCssNumber(rand() * 0.12, 4)}s`,
      } as CSSProperties,
    };
  });
}

const GOLD_FRAGMENTS = buildGoldFragments();

export default function DailyRewardOverlay() {
  return (
    <div className="overlay primitiveSciFiModalOverlay timeGoalCompletePrimitiveOverlay dailyRewardPrimitiveOverlay" id="dailyRewardOverlay" style={{ display: "none" }}>
      <div className="modal timeGoalCompletePrimitiveModal dailyRewardPrimitiveModal" role="dialog" aria-modal="true" aria-label="Daily Reward">
        <div className="timeGoalCompletePrimitiveBody dailyRewardPrimitiveBody">
          <div className="timeGoalCompleteRewardCard dailyRewardCard">
            <span className="timeGoalCompleteRibbonRail dailyRewardRibbonRail" aria-hidden="true">
              {CELEBRATION_RIBBONS.map((_, index) => (
                <span className="timeGoalCompleteRibbon dailyRewardRibbon" key={index} />
              ))}
            </span>
            <div className="timeGoalCompleteTickWrap dailyRewardTickWrap" aria-hidden="true">
              <span className="timeGoalCompleteStarArc dailyRewardStarArc">
                <span className="timeGoalCompleteArcStar dailyRewardArcStar" />
                <span className="timeGoalCompleteArcStar dailyRewardArcStar" />
                <span className="timeGoalCompleteArcStar dailyRewardArcStar" />
                <span className="timeGoalCompleteArcStar dailyRewardArcStar" />
              </span>
              <AppImg className="dailyRewardBoxImage" src="/icons/achievement/daily-reward-box.png" alt="" aria-hidden="true" />
            </div>
            <h2 id="dailyRewardTitle">Daily Reward!</h2>
            <p className="timeGoalCompleteRewardMessage dailyRewardMessage">Welcome back. Here&apos;s your daily reward for showing up.</p>
            <div className="timeGoalCompleteXpFx dailyRewardXpFx" aria-live="polite">
              <p className="modalSubtext XPRewardText" id="dailyRewardText">
                <span id="dailyRewardXpValue">10</span> XP
              </p>
              <span className="timeGoalCompleteGoldFragments dailyRewardGoldFragments" aria-hidden="true">
                {GOLD_FRAGMENTS.map((fragment, index) => (
                  <i className="timeGoalCompleteGoldFragment dailyRewardGoldFragment" key={index} style={fragment.style} />
                ))}
              </span>
            </div>
          </div>
        </div>
        <div className="confirmBtns timeGoalCompleteActionGrid timeGoalCompletePrimitiveFooter dailyRewardActionGrid dailyRewardPrimitiveFooter">
          <button
            className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction timeGoalCompletePrimitiveAction timeGoalCompletePrimitivePrimaryAction dailyRewardPrimitiveAction dailyRewardPrimitivePrimaryAction"
            id="dailyRewardClaimBtn"
            type="button"
          >
            Claim
          </button>
        </div>
      </div>
    </div>
  );
}
