import type { CSSProperties } from "react";

type ConfettiPiece = {
  className: string;
  style: CSSProperties;
};

type GoldFragment = {
  style: CSSProperties;
};

function formatCssNumber(value: number, digits = 3): string {
  return Number(value.toFixed(digits)).toString();
}

function buildConfettiPieces(): ConfettiPiece[] {
  const colors = ["#ff3b72", "#ffd21e", "#1e90ff", "#00bcd4", "#8e44ad", "#ff8c00", "#22c55e", "#e11d48", "#14b8a6"];
  let seed = 21;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return Array.from({ length: 120 }, (_, index) => {
    const startX = 5 + rand() * 90;
    const drift = -72 + rand() * 144;
    const fallTop = 112 + rand() * 18;
    const sway = 16 + rand() * 54;
    const spin = Math.floor(rand() * 900 - 450);
    const width = 3 + rand() * 22;
    const height = 4 + rand() * 26;
    const scale = 0.42 + rand() * 1.28;
    const opacity = 0.68 + rand() * 0.32;
    const duration = 3.45 + rand() * 1.85 + scale * 0.34;
    const className = `timeGoalConfettiPiece${index % 11 === 0 ? " timeGoalConfettiStar" : index % 5 === 0 ? " timeGoalConfettiDot" : ""}`;
    return {
      className,
      style: {
        "--start-x": `${formatCssNumber(startX)}%`,
        "--drift": `${formatCssNumber(drift)}px`,
        "--drift-a": `${formatCssNumber(drift * 0.72)}px`,
        "--fall-top": `${formatCssNumber(fallTop)}%`,
        "--sway-a": `${formatCssNumber(sway * (rand() > 0.5 ? 0.28 : -0.28))}px`,
        "--sway-b": `${formatCssNumber(sway * (rand() > 0.5 ? 0.64 : -0.64))}px`,
        "--sway-c": `${formatCssNumber(sway * (rand() > 0.5 ? -0.46 : 0.46))}px`,
        "--float-a": `${formatCssNumber(-9 - rand() * 16)}px`,
        "--float-b": `${formatCssNumber(-3 - rand() * 12)}px`,
        "--w": `${formatCssNumber(width)}px`,
        "--h": `${formatCssNumber(height)}px`,
        "--scale": formatCssNumber(scale),
        "--alpha": formatCssNumber(opacity),
        "--alpha-end": formatCssNumber(opacity * 0.72),
        "--c": colors[Math.floor(rand() * colors.length)],
        "--rot": `${Math.floor(rand() * 360)}deg`,
        "--spin": `${spin}deg`,
        "--spin-a": `${formatCssNumber(spin * 0.18)}deg`,
        "--spin-b": `${formatCssNumber(spin * 0.52)}deg`,
        "--spin-c": `${formatCssNumber(spin * 0.78)}deg`,
        "--spin-d": `${formatCssNumber(spin * 0.9)}deg`,
        "--d": `${formatCssNumber(rand() * 1.08, 4)}s`,
        "--dur": `${formatCssNumber(duration, 4)}s`,
      } as CSSProperties,
    };
  });
}

const CONFETTI_PIECES = buildConfettiPieces();

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

export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay primitiveSciFiModalOverlay timeGoalCompletePrimitiveOverlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="modal timeGoalCompletePrimitiveModal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <div className="timeGoalCompleteConfettiStage" id="timeGoalCompleteConfettiStage" aria-hidden="true">
          <canvas className="timeGoalCompleteConfettiCanvas" />
          {CONFETTI_PIECES.map((piece, index) => (
            <i className={piece.className} key={index} style={piece.style} />
          ))}
        </div>
        <div className="timeGoalCompletePrimitiveBody">
          <div className="timeGoalCompleteRewardCard">
            <div className="timeGoalCompleteTickWrap" aria-hidden="true">
              <span className="timeGoalCompleteStarArc">
                <span className="timeGoalCompleteArcStar" />
                <span className="timeGoalCompleteArcStar" />
                <span className="timeGoalCompleteArcStar" />
                <span className="timeGoalCompleteArcStar" />
              </span>
              <span className="timeGoalCompleteTickBadge">
                <span className="timeGoalCompleteTickMark" />
              </span>
            </div>
            <h2 id="timeGoalCompleteTitle">Task Complete!</h2>
            <p className="timeGoalCompleteRewardMessage">Congratulations! You completed your task goal.</p>
            <div className="timeGoalCompleteXpFx" aria-live="polite">
              <p className="modalSubtext confirmText" id="timeGoalCompleteText">
                XP Awarded: <span id="timeGoalCompleteXpValue">0</span>
              </p>
              <span className="timeGoalCompleteGoldFragments" aria-hidden="true">
                {GOLD_FRAGMENTS.map((fragment, index) => (
                  <i className="timeGoalCompleteGoldFragment" key={index} style={fragment.style} />
                ))}
              </span>
            </div>
          </div>
          <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
          <div className="timeGoalCompleteDivider" aria-hidden="true" />
          <div className="timeGoalCompleteNextTasks" id="timeGoalCompleteNextTasks" hidden>
            <div
              className="timeGoalCompleteNextTaskGrid"
              id="timeGoalCompleteNextTaskGrid"
              aria-label="Incomplete tasks for today"
            />
          </div>
        </div>
        <div className="confirmBtns timeGoalCompleteActionGrid timeGoalCompletePrimitiveFooter">
          <button
            className="btn btn-accent modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction timeGoalCompletePrimitiveAction timeGoalCompletePrimitivePrimaryAction"
            id="timeGoalCompleteCloseBtn"
            type="button"
            hidden
          >
            Claim
          </button>
        </div>
      </div>
    </div>
  );
}
