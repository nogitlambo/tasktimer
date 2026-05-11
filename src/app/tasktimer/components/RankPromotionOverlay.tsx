import type { CSSProperties } from "react";

type RankPromotionOverlayProps = {
  rankLabel: string;
  onClose: () => void;
};

type ConfettiPiece = {
  className: string;
  style: CSSProperties;
};

function formatCssNumber(value: number, digits = 3): string {
  return Number(value.toFixed(digits)).toString();
}

function buildConfettiPieces(): ConfettiPiece[] {
  const colors = ["#ff3b72", "#ffd21e", "#1e90ff", "#00bcd4", "#8e44ad", "#ff8c00", "#22c55e", "#e11d48", "#14b8a6"];
  let seed = 37;
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

export default function RankPromotionOverlay({ rankLabel, onClose }: RankPromotionOverlayProps) {
  return (
    <div className="overlay" id="rankPromotionOverlay" style={{ display: "flex" }} onClick={onClose}>
      <div className="timeGoalCompleteConfettiStage" id="rankPromotionConfettiStage" aria-hidden="true">
        {CONFETTI_PIECES.map((piece, index) => (
          <i className={piece.className} key={index} style={piece.style} />
        ))}
      </div>
      <div className="modal rankPromotionModal" role="dialog" aria-modal="true" aria-label="Rank promotion" onClick={(event) => event.stopPropagation()}>
        <h2>Promotion!</h2>
        <p className="modalSubtext confirmText" id="rankPromotionText">
          You have been promoted to {rankLabel}!
        </p>
        <div className="confirmBtns">
          <button className="btn btn-accent" id="rankPromotionCloseBtn" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
