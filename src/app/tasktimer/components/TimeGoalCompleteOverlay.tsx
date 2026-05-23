import type { CSSProperties } from "react";

type ConfettiPiece = {
  className: string;
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
    const angle = rand() * Math.PI * 2;
    const dist = 150 + rand() * 360;
    const gravity = rand() * 110;
    const width = 6 + rand() * 24;
    const height = 6 + rand() * 18;
    const className = `timeGoalConfettiPiece${index % 11 === 0 ? " timeGoalConfettiStar" : index % 5 === 0 ? " timeGoalConfettiDot" : ""}`;
    return {
      className,
      style: {
        "--x": `${formatCssNumber(Math.cos(angle) * dist)}px`,
        "--y": `${formatCssNumber(Math.sin(angle) * dist + gravity)}px`,
        "--w": `${formatCssNumber(width)}px`,
        "--h": `${formatCssNumber(height)}px`,
        "--c": colors[Math.floor(rand() * colors.length)],
        "--rot": `${Math.floor(rand() * 360)}deg`,
        "--spin": `${Math.floor(rand() * 720 - 360)}deg`,
        "--d": `${formatCssNumber(rand() * 0.22, 4)}s`,
      } as CSSProperties,
    };
  });
}

const CONFETTI_PIECES = buildConfettiPieces();

export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="timeGoalCompleteConfettiStage" id="timeGoalCompleteConfettiStage" aria-hidden="true">
        {CONFETTI_PIECES.map((piece, index) => (
          <i className={piece.className} key={index} style={piece.style} />
        ))}
      </div>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <h2 id="timeGoalCompleteTitle">Task Complete!</h2>
        <p className="modalSubtext confirmText" id="timeGoalCompleteText">
          You got 0 XP!
        </p>
        <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
        <div className="timeGoalCompleteDivider" aria-hidden="true" />
        <div className="timeGoalCompleteNextTasks" id="timeGoalCompleteNextTasks" hidden>
          <div
            className="timeGoalCompleteNextTaskGrid"
            id="timeGoalCompleteNextTaskGrid"
            aria-label="Incomplete tasks for today"
          />
        </div>
        <div className="confirmBtns timeGoalCompleteActionGrid">
          <button className="btn btn-accent" id="timeGoalCompleteCloseBtn" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
