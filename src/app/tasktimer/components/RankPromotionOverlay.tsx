import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getStoredRankThumbnailDescriptor } from "../lib/rewards";
import RankThumbnail from "./RankThumbnail";

type RankPromotionOverlayProps = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
  onPresentationStart: () => void;
  onClose: () => void;
};

const RANK_PROMOTION_DIM_DURATION_MS = 1000;
const RANK_PROMOTION_INTRO_DELAY_MS = 0;
const RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS = 1000;
const RANK_PROMOTION_IMPACT_BOOM_TWO_DELAY_MS = RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + 200;
const RANK_PROMOTION_POST_IMPACT_DELAY_MS = RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + 100;
const RANK_PROMOTION_BLOOM_HOLD_MS = 100;
const RANK_PROMOTION_SETTLE_MS = 800;
const RANK_PROMOTION_COMPLETE_SPIN_DURATION_MS = 8000;
const RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS = RANK_PROMOTION_COMPLETE_SPIN_DURATION_MS / 4;
const RANK_PROMOTION_SMASH_DURATION_MS =
  RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS + RANK_PROMOTION_BLOOM_HOLD_MS + RANK_PROMOTION_SETTLE_MS;
const RANK_PROMOTION_IMPACT_AUDIO_SRC = "/promotion_impact.mp3";
const RANK_PROMOTION_INTRO_AUDIO_SRC = "/promotion_intro.mp3";
const RANK_PROMOTION_IMPACT_BOOM_TWO_AUDIO_SRC = "/promotion_boom2.mp3";
const RANK_PROMOTION_HIT_AUDIO_SRC = "/promotion_hit.mp3";
const RANK_PROMOTION_POST_IMPACT_AUDIO_SRC = "/promotion_post-impact.mp3";
const RANK_PROMOTION_FRAGMENT_COLUMNS = 15;
const RANK_PROMOTION_FRAGMENT_ROWS = 14;

type RankPromotionPhase = "dimming" | "intro" | "smashing" | "complete";

type RankPromotionFragment = {
  key: string;
  className: string;
  style: CSSProperties;
};

function playPromotionAudio(src: string) {
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

function buildRankPromotionFragments(rankId: string): RankPromotionFragment[] {
  const descriptor = getStoredRankThumbnailDescriptor(rankId, "");
  const hasImage = descriptor.kind === "image";
  const backgroundImage = hasImage ? `url("${descriptor.src}")` : "";
  const fragments: RankPromotionFragment[] = [];
  const centerCol = (RANK_PROMOTION_FRAGMENT_COLUMNS - 1) / 2;
  const centerRow = (RANK_PROMOTION_FRAGMENT_ROWS - 1) / 2;

  for (let row = 0; row < RANK_PROMOTION_FRAGMENT_ROWS; row += 1) {
    for (let col = 0; col < RANK_PROMOTION_FRAGMENT_COLUMNS; col += 1) {
      const index = row * RANK_PROMOTION_FRAGMENT_COLUMNS + col;
      const normalizedX = (col - centerCol) / centerCol;
      const normalizedY = (row - centerRow) / centerRow;
      const angle = Math.atan2(normalizedY, normalizedX || 0.001);
      const edgeBias = Math.min(1.4, Math.hypot(normalizedX, normalizedY));
      const jitter = ((index * 37) % 23) - 11;
      const distance = 92 + edgeBias * 118 + ((index * 17) % 54);
      const dx = Math.cos(angle) * distance + jitter;
      const dy = Math.sin(angle) * distance + (((index * 29) % 41) - 20) - 18;
      const rotation = (normalizedX * 180) + (normalizedY * 130) + (((index * 53) % 220) - 110);
      const scale = 0.45 + ((index * 19) % 35) / 100;
      const clipA = 8 + ((index * 13) % 24);
      const clipB = 76 + ((index * 11) % 18);
      const clipC = 70 + ((index * 7) % 25);
      const clipD = 12 + ((index * 5) % 24);

      fragments.push({
        key: `${row}-${col}`,
        className: `rankPromotionShard${hasImage ? " is-image" : " is-placeholder"}`,
        style: {
          left: `${(col / RANK_PROMOTION_FRAGMENT_COLUMNS) * 100}%`,
          top: `${(row / RANK_PROMOTION_FRAGMENT_ROWS) * 100}%`,
          width: `${100 / RANK_PROMOTION_FRAGMENT_COLUMNS}%`,
          height: `${100 / RANK_PROMOTION_FRAGMENT_ROWS}%`,
          ["--rank-promotion-shard-bg" as keyof CSSProperties]: backgroundImage,
          ["--rank-promotion-shard-bg-x" as keyof CSSProperties]: `${RANK_PROMOTION_FRAGMENT_COLUMNS > 1 ? (col / (RANK_PROMOTION_FRAGMENT_COLUMNS - 1)) * 100 : 50}%`,
          ["--rank-promotion-shard-bg-y" as keyof CSSProperties]: `${RANK_PROMOTION_FRAGMENT_ROWS > 1 ? (row / (RANK_PROMOTION_FRAGMENT_ROWS - 1)) * 100 : 50}%`,
          ["--rank-promotion-shard-dx-mid" as keyof CSSProperties]: `${(dx * 0.55).toFixed(1)}px`,
          ["--rank-promotion-shard-dy-mid" as keyof CSSProperties]: `${(dy * 0.55).toFixed(1)}px`,
          ["--rank-promotion-shard-dx-near" as keyof CSSProperties]: `${(dx * 0.94).toFixed(1)}px`,
          ["--rank-promotion-shard-dy-near" as keyof CSSProperties]: `${(dy * 0.94 + 22).toFixed(1)}px`,
          ["--rank-promotion-shard-dx" as keyof CSSProperties]: `${dx.toFixed(1)}px`,
          ["--rank-promotion-shard-dy" as keyof CSSProperties]: `${dy.toFixed(1)}px`,
          ["--rank-promotion-shard-dx-far" as keyof CSSProperties]: `${(dx * 1.22).toFixed(1)}px`,
          ["--rank-promotion-shard-dy-far" as keyof CSSProperties]: `${(dy * 1.22 + 68).toFixed(1)}px`,
          ["--rank-promotion-shard-rot" as keyof CSSProperties]: `${rotation.toFixed(1)}deg`,
          ["--rank-promotion-shard-rot-mid" as keyof CSSProperties]: `${(rotation * 0.45).toFixed(1)}deg`,
          ["--rank-promotion-shard-rot-near" as keyof CSSProperties]: `${(rotation * 0.86).toFixed(1)}deg`,
          ["--rank-promotion-shard-scale" as keyof CSSProperties]: scale.toFixed(2),
          ["--rank-promotion-shard-scale-mid" as keyof CSSProperties]: (scale + 0.28).toFixed(2),
          ["--rank-promotion-shard-scale-end" as keyof CSSProperties]: (scale * 0.72).toFixed(2),
          ["--rank-promotion-shard-clip" as keyof CSSProperties]:
            `polygon(${clipA}% 0%, 100% ${clipD}%, ${clipB}% 100%, 0% ${clipC}%)`,
          ["--rank-promotion-shard-delay" as keyof CSSProperties]: `${((index * 7) % 80) - 42}ms`,
        },
      });
    }
  }

  return fragments;
}

export default function RankPromotionOverlay({
  previousRankId,
  previousRankLabel,
  nextRankId,
  nextRankLabel,
  onPresentationStart,
  onClose,
}: RankPromotionOverlayProps) {
  const [phase, setPhase] = useState<RankPromotionPhase>("dimming");
  const [isCloseReady, setIsCloseReady] = useState(false);
  const onPresentationStartRef = useRef(onPresentationStart);
  const isDimming = phase === "dimming";
  const isComplete = phase === "complete";
  const oldRankFragments = useMemo(() => buildRankPromotionFragments(previousRankId), [previousRankId]);

  useEffect(() => {
    onPresentationStartRef.current = onPresentationStart;
  }, [onPresentationStart]);

  useEffect(() => {
    playPromotionAudio(RANK_PROMOTION_INTRO_AUDIO_SRC);

    const dimTimer = window.setTimeout(() => {
      setPhase("intro");
      onPresentationStartRef.current();
    }, RANK_PROMOTION_DIM_DURATION_MS);
    const smashTimer = window.setTimeout(() => {
      setPhase("smashing");
    }, RANK_PROMOTION_DIM_DURATION_MS + RANK_PROMOTION_INTRO_DELAY_MS);
    const completeTimer = window.setTimeout(() => {
      setPhase("complete");
    }, RANK_PROMOTION_DIM_DURATION_MS + RANK_PROMOTION_INTRO_DELAY_MS + RANK_PROMOTION_SMASH_DURATION_MS);

    return () => {
      window.clearTimeout(dimTimer);
      window.clearTimeout(smashTimer);
      window.clearTimeout(completeTimer);
    };
  }, []);

  useEffect(() => {
    if (phase !== "smashing") return;

    playPromotionAudio(RANK_PROMOTION_IMPACT_AUDIO_SRC);
    const boomTwoTimer = window.setTimeout(() => {
      playPromotionAudio(RANK_PROMOTION_IMPACT_BOOM_TWO_AUDIO_SRC);
    }, RANK_PROMOTION_IMPACT_BOOM_TWO_DELAY_MS);
    const postImpactTimer = window.setTimeout(() => {
      playPromotionAudio(RANK_PROMOTION_POST_IMPACT_AUDIO_SRC);
    }, RANK_PROMOTION_POST_IMPACT_DELAY_MS);

    return () => {
      window.clearTimeout(boomTwoTimer);
      window.clearTimeout(postImpactTimer);
    };
  }, [phase]);

  useEffect(() => {
    if (!isComplete) return;

    const hitTimer = window.setTimeout(() => {
      playPromotionAudio(RANK_PROMOTION_HIT_AUDIO_SRC);
      setIsCloseReady(true);
    }, RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS);

    return () => {
      window.clearTimeout(hitTimer);
    };
  }, [isComplete]);

  return (
    <div className={`overlay is-${phase}`} id="rankPromotionOverlay" style={{ display: "flex" }}>
      <div
        className={`modal rankPromotionModal is-${phase}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isDimming ? "true" : undefined}
        aria-label="Rank promotion"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rankPromotionLightBeam" aria-hidden="true">
          <span className="rankPromotionLightBeamPulse" />
        </div>
        <h2>You&apos;ve been promoted!</h2>
        <div className="rankPromotionStage" id="rankPromotionText" aria-live="polite">
          <div className="rankPromotionRank rankPromotionRankOld" aria-hidden={isComplete ? "true" : undefined}>
            <span className="rankPromotionOldInsigniaWrap">
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
              <span className="rankPromotionShatterField" aria-hidden="true">
                {oldRankFragments.map((fragment) => (
                  <span key={fragment.key} className={fragment.className} style={fragment.style} />
                ))}
              </span>
            </span>
            <p className="modalSubtext confirmText rankPromotionLabel">{previousRankLabel}</p>
          </div>
          <div className="rankPromotionRank rankPromotionRankNew" aria-hidden={isDimming || phase === "intro" ? "true" : undefined}>
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
