import { useEffect, useState, type CSSProperties } from "react";
import RankThumbnail from "./RankThumbnail";

type RankPromotionOverlayProps = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
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

const RANK_PROMOTION_INTRO_DELAY_MS = 3000;
const RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS = 1000;
const RANK_PROMOTION_SETTLE_MS = 200;
const RANK_PROMOTION_SMASH_DURATION_MS = RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + RANK_PROMOTION_SETTLE_MS;
const RANK_PROMOTION_IMPACT_AUDIO_SRC = "/promotion_impact.mp3";

type RankPromotionPhase = "intro" | "smashing" | "complete";

export default function RankPromotionOverlay({
  previousRankId,
  previousRankLabel,
  nextRankId,
  nextRankLabel,
  onClose,
}: RankPromotionOverlayProps) {
  const [phase, setPhase] = useState<RankPromotionPhase>("intro");
  const isComplete = phase === "complete";

  useEffect(() => {
    const smashTimer = window.setTimeout(() => {
      setPhase("smashing");
    }, RANK_PROMOTION_INTRO_DELAY_MS);
    const completeTimer = window.setTimeout(() => {
      setPhase("complete");
    }, RANK_PROMOTION_INTRO_DELAY_MS + RANK_PROMOTION_SMASH_DURATION_MS);

    return () => {
      window.clearTimeout(smashTimer);
      window.clearTimeout(completeTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "smashing") return;

    try {
      const audio = new Audio(RANK_PROMOTION_IMPACT_AUDIO_SRC);
      audio.preload = "auto";
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === "function") playback.catch(() => {});
    } catch {
      // Browser autoplay failures are non-blocking for the promotion UI.
    }
  }, [phase]);

  return (
    <div className="overlay" id="rankPromotionOverlay" style={{ display: "flex" }} onClick={isComplete ? onClose : undefined}>
      <div className="timeGoalCompleteConfettiStage" id="rankPromotionConfettiStage" aria-hidden="true">
        {CONFETTI_PIECES.map((piece, index) => (
          <i className={piece.className} key={index} style={piece.style} />
        ))}
      </div>
      <div
        className={`modal rankPromotionModal is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-label="Rank promotion"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>You&apos;ve been promoted!</h2>
        <div className="rankPromotionStage" id="rankPromotionText" aria-live="polite">
          <div className="rankPromotionRank rankPromotionRankOld" aria-hidden={isComplete ? "true" : undefined}>
            <RankThumbnail
              rankId={previousRankId}
              storedThumbnailSrc=""
              className="rankPromotionInsignia"
              imageClassName="rankPromotionInsigniaImage"
              placeholderClassName="rankPromotionInsigniaPlaceholder"
              alt=""
              size={96}
              aria-hidden
            />
            <p className="modalSubtext confirmText rankPromotionLabel">{previousRankLabel}</p>
          </div>
          <div className="rankPromotionRank rankPromotionRankNew" aria-hidden={phase === "intro" ? "true" : undefined}>
            <RankThumbnail
              rankId={nextRankId}
              storedThumbnailSrc=""
              className="rankPromotionInsignia"
              imageClassName="rankPromotionInsigniaImage"
              placeholderClassName="rankPromotionInsigniaPlaceholder"
              alt=""
              size={112}
              aria-hidden
            />
            <p className="modalSubtext confirmText rankPromotionLabel">{nextRankLabel}</p>
          </div>
        </div>
        {isComplete ? (
          <div className="confirmBtns">
            <button className="btn btn-accent" id="rankPromotionCloseBtn" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
