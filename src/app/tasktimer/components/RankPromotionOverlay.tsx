import { useEffect, useState } from "react";
import RankThumbnail from "./RankThumbnail";

type RankPromotionOverlayProps = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
  onClose: () => void;
};

const RANK_PROMOTION_INTRO_DELAY_MS = 1000;
const RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS = 1000;
const RANK_PROMOTION_IMPACT_BOOM_TWO_DELAY_MS = RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + 200;
const RANK_PROMOTION_BLOOM_HOLD_MS = 100;
const RANK_PROMOTION_SETTLE_MS = 800;
const RANK_PROMOTION_COMPLETE_SPIN_DURATION_MS = 8000;
const RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS = RANK_PROMOTION_COMPLETE_SPIN_DURATION_MS / 4;
const RANK_PROMOTION_SMASH_DURATION_MS =
  RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + RANK_PROMOTION_BLOOM_HOLD_MS + RANK_PROMOTION_SETTLE_MS;
const RANK_PROMOTION_IMPACT_AUDIO_SRC = "/promotion_impact.mp3";
const RANK_PROMOTION_IMPACT_BOOM_AUDIO_SRC = "/promotion_boom.mp3";
const RANK_PROMOTION_IMPACT_BOOM_TWO_AUDIO_SRC = "/promotion_boom2.mp3";
const RANK_PROMOTION_HIT_AUDIO_SRC = "/promotion_hit.mp3";

type RankPromotionPhase = "intro" | "smashing" | "complete";

function playPromotionImpactAudio(src: string) {
  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") playback.catch(() => {});
  } catch {
    // Browser autoplay failures are non-blocking for the promotion UI.
  }
}

export default function RankPromotionOverlay({
  previousRankId,
  previousRankLabel,
  nextRankId,
  nextRankLabel,
  onClose,
}: RankPromotionOverlayProps) {
  const [phase, setPhase] = useState<RankPromotionPhase>("intro");
  const [isCloseReady, setIsCloseReady] = useState(false);
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

    playPromotionImpactAudio(RANK_PROMOTION_IMPACT_AUDIO_SRC);
    playPromotionImpactAudio(RANK_PROMOTION_IMPACT_BOOM_AUDIO_SRC);
    const boomTwoTimer = window.setTimeout(() => {
      playPromotionImpactAudio(RANK_PROMOTION_IMPACT_BOOM_TWO_AUDIO_SRC);
    }, RANK_PROMOTION_IMPACT_BOOM_TWO_DELAY_MS);

    return () => {
      window.clearTimeout(boomTwoTimer);
    };
  }, [phase]);

  useEffect(() => {
    if (!isComplete) return;

    const hitTimer = window.setTimeout(() => {
      playPromotionImpactAudio(RANK_PROMOTION_HIT_AUDIO_SRC);
      setIsCloseReady(true);
    }, RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS);

    return () => {
      window.clearTimeout(hitTimer);
    };
  }, [isComplete]);

  return (
    <div className="overlay" id="rankPromotionOverlay" style={{ display: "flex" }}>
      <div
        className={`modal rankPromotionModal is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-label="Rank promotion"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rankPromotionLightBeam" aria-hidden="true">
          <span className="rankPromotionLightBeamPulse" />
        </div>
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
              className="rankPromotionInsignia rankPromotionInsigniaNew"
              imageClassName="rankPromotionInsigniaImage"
              placeholderClassName="rankPromotionInsigniaPlaceholder"
              alt=""
              size={140}
              aria-hidden
            />
            <p className="modalSubtext confirmText rankPromotionLabel">{nextRankLabel}</p>
          </div>
        </div>
        <div className={`confirmBtns rankPromotionCloseSlot${isCloseReady ? " is-ready" : ""}`}>
          <button
            className="btn btn-accent"
            id="rankPromotionCloseBtn"
            type="button"
            onClick={onClose}
            disabled={!isCloseReady}
            aria-hidden={!isCloseReady}
            tabIndex={isCloseReady ? 0 : -1}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
