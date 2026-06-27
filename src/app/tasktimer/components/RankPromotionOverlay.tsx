import { useEffect, useRef, useState } from "react";
import {
  RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS,
  RANK_PROMOTION_SMASH_DURATION_MS,
  RANK_PROMOTION_SMASH_PHASE_START_MS,
  RANK_PROMOTION_TIMING,
  createRankPromotionAudioController,
  type RankPromotionAudioController,
} from "../client/rank-promotion-audio";
import { getRankPlaceholderLabel, getStoredRankThumbnailDescriptor } from "../lib/rewards";
import RankThumbnail from "./RankThumbnail";

type RankPromotionOverlayProps = {
  previousRankId: string;
  previousRankLabel: string;
  nextRankId: string;
  nextRankLabel: string;
  achievementSoundsEnabled?: boolean;
  onPresentationStart: () => void;
  onClose: () => void;
};

const RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS = 1000;
const RANK_PROMOTION_FRAGMENT_COLUMNS = 26;
const RANK_PROMOTION_FRAGMENT_ROWS = 24;
const RANK_PROMOTION_FRAGMENT_CANVAS_SIZE = 640;
const RANK_PROMOTION_FRAGMENT_SOURCE_SIZE = 112;
const RANK_PROMOTION_FRAGMENT_ANIMATION_MS = 3400;
const RANK_PROMOTION_LABEL_FRAGMENT_COUNT = 16;

type RankPromotionPhase = "dimming" | "intro" | "smashing" | "complete";

type RankPromotionShardParticle = {
  tile: HTMLCanvasElement;
  width: number;
  height: number;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
  driftX: number;
  driftY: number;
  rotation: number;
  scale: number;
};

export function startRankPromotionIntroPresentation(
  audioController: Pick<RankPromotionAudioController, "startSmashCues"> | null | undefined,
  achievementSoundsEnabled: boolean,
  onPresentationStart: () => void,
) {
  if (achievementSoundsEnabled) audioController?.startSmashCues();
  onPresentationStart();
}

function easeOutZeroGravity(progress: number) {
  return 1 - Math.pow(1 - progress, 3);
}

function drawRankPromotionPlaceholder(
  context: CanvasRenderingContext2D,
  rankId: string,
  size: number,
) {
  const center = size / 2;
  const radius = size * 0.41;
  const gradient = context.createLinearGradient(size * 0.18, size * 0.12, size * 0.86, size * 0.9);
  gradient.addColorStop(0, "rgba(201,255,36,.95)");
  gradient.addColorStop(0.56, "rgba(53,232,255,.62)");
  gradient.addColorStop(1, "rgba(8,12,18,.5)");

  context.clearRect(0, 0, size, size);
  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.fillStyle = "rgba(53,232,255,.08)";
  context.fill();
  context.lineWidth = 1.4;
  context.strokeStyle = "rgba(53,232,255,.34)";
  context.stroke();
  context.save();
  context.beginPath();
  context.arc(center, center, radius - 1, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.restore();
  context.fillStyle = "#c9ff24";
  context.font = "800 34px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(getRankPlaceholderLabel(rankId), center, center + 1);
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  size: number,
) {
  const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  const left = (size - width) / 2;
  const top = (size - height) / 2;

  context.clearRect(0, 0, size, size);
  context.drawImage(image, left, top, width, height);
}

function buildRankPromotionShardParticles(sourceCanvas: HTMLCanvasElement): RankPromotionShardParticle[] {
  const particles: RankPromotionShardParticle[] = [];
  const centerCol = (RANK_PROMOTION_FRAGMENT_COLUMNS - 1) / 2;
  const centerRow = (RANK_PROMOTION_FRAGMENT_ROWS - 1) / 2;
  const cellWidth = RANK_PROMOTION_FRAGMENT_SOURCE_SIZE / RANK_PROMOTION_FRAGMENT_COLUMNS;
  const cellHeight = RANK_PROMOTION_FRAGMENT_SOURCE_SIZE / RANK_PROMOTION_FRAGMENT_ROWS;
  const sourceOffset = (RANK_PROMOTION_FRAGMENT_CANVAS_SIZE - RANK_PROMOTION_FRAGMENT_SOURCE_SIZE) / 2;

  for (let row = 0; row < RANK_PROMOTION_FRAGMENT_ROWS; row += 1) {
    for (let col = 0; col < RANK_PROMOTION_FRAGMENT_COLUMNS; col += 1) {
      const index = row * RANK_PROMOTION_FRAGMENT_COLUMNS + col;
      const normalizedX = (col - centerCol) / centerCol;
      const normalizedY = (row - centerRow) / centerRow;
      const angle = Math.atan2(normalizedY, normalizedX || 0.001);
      const edgeBias = Math.min(1.4, Math.hypot(normalizedX, normalizedY));
      const jitter = ((index * 37) % 23) - 11;
      const distance = 140 + edgeBias * 190 + ((index * 17) % 82);
      const rainDrift = (((index * 41) % 121) - 60) + normalizedX * 72;
      const rainFall = 90 + ((index * 31) % 70) + Math.max(0, normalizedY) * 36;
      const sx = col * cellWidth;
      const sy = row * cellHeight;
      const clipA = 0.08 + ((index * 13) % 24) / 100;
      const clipB = 0.76 + ((index * 11) % 18) / 100;
      const clipC = 0.7 + ((index * 7) % 25) / 100;
      const clipD = 0.12 + ((index * 5) % 24) / 100;
      const tileScale = 2;
      const tile = document.createElement("canvas");
      const tileContext = tile.getContext("2d");
      const tileWidth = Math.ceil(cellWidth * tileScale);
      const tileHeight = Math.ceil(cellHeight * tileScale);
      tile.width = tileWidth;
      tile.height = tileHeight;
      if (tileContext) {
        tileContext.scale(tileScale, tileScale);
        tileContext.beginPath();
        tileContext.moveTo(clipA * cellWidth, 0);
        tileContext.lineTo(cellWidth, clipD * cellHeight);
        tileContext.lineTo(clipB * cellWidth, cellHeight);
        tileContext.lineTo(0, clipC * cellHeight);
        tileContext.closePath();
        tileContext.clip();
        tileContext.drawImage(sourceCanvas, sx, sy, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
      }

      particles.push({
        tile,
        width: cellWidth,
        height: cellHeight,
        cx: sourceOffset + sx + cellWidth / 2,
        cy: sourceOffset + sy + cellHeight / 2,
        dx: Math.cos(angle) * distance + jitter + rainDrift,
        dy: Math.sin(angle) * distance + (((index * 29) % 57) - 28) - 24 + rainFall * 0.34,
        driftX: rainDrift * 0.18,
        driftY: ((((index * 43) % 45) - 22) * 0.2) + rainFall * 0.08,
        rotation: (normalizedX * 240) + (normalizedY * 180) + (((index * 53) % 300) - 150),
        scale: 0.68 + ((index * 19) % 34) / 100,
      });
    }
  }

  return particles;
}

function RankPromotionShatterCanvas({ rankId, isActive }: { rankId: string; isActive: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isActive) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let animationFrame = 0;
    let impactTimer = 0;
    let isCancelled = false;
    const descriptor = getStoredRankThumbnailDescriptor(rankId, "");
    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d");
    if (!sourceContext) return;

    sourceCanvas.width = RANK_PROMOTION_FRAGMENT_SOURCE_SIZE;
    sourceCanvas.height = RANK_PROMOTION_FRAGMENT_SOURCE_SIZE;

    const drawSource = () => new Promise<void>((resolve) => {
      if (descriptor.kind !== "image") {
        drawRankPromotionPlaceholder(sourceContext, rankId, RANK_PROMOTION_FRAGMENT_SOURCE_SIZE);
        resolve();
        return;
      }

      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        drawContainedImage(sourceContext, image, RANK_PROMOTION_FRAGMENT_SOURCE_SIZE);
        resolve();
      };
      image.onerror = () => {
        drawRankPromotionPlaceholder(sourceContext, rankId, RANK_PROMOTION_FRAGMENT_SOURCE_SIZE);
        resolve();
      };
      image.src = descriptor.src;
    });

    const render = async () => {
      await drawSource();
      if (isCancelled) return;

      const context = canvas.getContext("2d");
      if (!context) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = RANK_PROMOTION_FRAGMENT_CANVAS_SIZE * pixelRatio;
      canvas.height = RANK_PROMOTION_FRAGMENT_CANVAS_SIZE * pixelRatio;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const particles = buildRankPromotionShardParticles(sourceCanvas);
      const startTime = performance.now();

      const drawFrame = (now: number) => {
        if (isCancelled) return;

        const elapsed = Math.min(RANK_PROMOTION_FRAGMENT_ANIMATION_MS, now - startTime);
        const progress = elapsed / RANK_PROMOTION_FRAGMENT_ANIMATION_MS;
        const eased = easeOutZeroGravity(progress);
        const float = Math.sin(progress * Math.PI * 2);

        context.clearRect(0, 0, RANK_PROMOTION_FRAGMENT_CANVAS_SIZE, RANK_PROMOTION_FRAGMENT_CANVAS_SIZE);
        for (const particle of particles) {
          const x = particle.cx + particle.dx * eased + particle.driftX * float;
          const y = particle.cy + particle.dy * eased + particle.driftY * float;
          const alpha = progress < 0.72 ? 1 : Math.max(0, 1 - (progress - 0.72) / 0.28);
          const rotation = (particle.rotation * eased * Math.PI) / 180;
          const scale = 1 + (particle.scale - 1) * eased;
          const width = particle.width * scale;
          const height = particle.height * scale;

          context.save();
          context.globalAlpha = alpha;
          context.translate(x, y);
          context.rotate(rotation);
          context.drawImage(particle.tile, -width / 2, -height / 2, width, height);
          context.restore();
        }

        if (elapsed < RANK_PROMOTION_FRAGMENT_ANIMATION_MS) {
          animationFrame = window.requestAnimationFrame(drawFrame);
        }
      };

      animationFrame = window.requestAnimationFrame(drawFrame);
    };

    impactTimer = window.setTimeout(() => {
      void render();
    }, RANK_PROMOTION_IMPACT_AUDIO_LEAD_MS);

    return () => {
      isCancelled = true;
      window.clearTimeout(impactTimer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isActive, rankId]);

  return <canvas ref={canvasRef} className="rankPromotionShatterCanvas" aria-hidden="true" />;
}

export default function RankPromotionOverlay({
  previousRankId,
  previousRankLabel,
  nextRankId,
  nextRankLabel,
  achievementSoundsEnabled = true,
  onPresentationStart,
  onClose,
}: RankPromotionOverlayProps) {
  const [phase, setPhase] = useState<RankPromotionPhase>("dimming");
  const [isCloseReady, setIsCloseReady] = useState(false);
  const onPresentationStartRef = useRef(onPresentationStart);
  const audioControllerRef = useRef<RankPromotionAudioController | null>(null);
  const isDimming = phase === "dimming";
  const isComplete = phase === "complete";

  useEffect(() => {
    onPresentationStartRef.current = onPresentationStart;
  }, [onPresentationStart]);

  useEffect(() => {
    if (achievementSoundsEnabled) {
      audioControllerRef.current = createRankPromotionAudioController();
    }

    const dimTimer = window.setTimeout(() => {
      setPhase("intro");
      startRankPromotionIntroPresentation(
        audioControllerRef.current,
        achievementSoundsEnabled,
        onPresentationStartRef.current,
      );
    }, RANK_PROMOTION_TIMING.dimDurationMs);
    const smashTimer = window.setTimeout(() => {
      setPhase("smashing");
    }, RANK_PROMOTION_SMASH_PHASE_START_MS);
    const completeTimer = window.setTimeout(() => {
      setPhase("complete");
    }, RANK_PROMOTION_SMASH_PHASE_START_MS + RANK_PROMOTION_SMASH_DURATION_MS);

    return () => {
      audioControllerRef.current?.dispose();
      audioControllerRef.current = null;
      window.clearTimeout(dimTimer);
      window.clearTimeout(smashTimer);
      window.clearTimeout(completeTimer);
    };
  }, [achievementSoundsEnabled]);

  useEffect(() => {
    if (!isComplete) return;

    const hitTimer = window.setTimeout(() => {
      if (achievementSoundsEnabled) audioControllerRef.current?.startHitCue();
      setIsCloseReady(true);
    }, RANK_PROMOTION_QUARTER_ROTATION_DELAY_MS);

    return () => {
      window.clearTimeout(hitTimer);
    };
  }, [achievementSoundsEnabled, isComplete]);

  const handleClose = () => {
    if (!isCloseReady) return;
    onClose();
  };

  return (
    <div className={`overlay is-${phase}`} id="rankPromotionOverlay" style={{ display: "flex" }}>
      <div className="rankPromotionContent">
        <h2 className="rankPromotionTitleRibbon">LEVEL UP!</h2>
        <div
          className={`modal rankPromotionModal is-${phase}${isCloseReady ? " is-close-ready" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-hidden={isDimming ? "true" : undefined}
          aria-label="Rank promotion"
          onClick={handleClose}
        >
          <svg
            className="rankPromotionShieldFrame"
            viewBox="0 0 320 390"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id="rankPromotionShieldFill" x1="62" y1="26" x2="258" y2="356" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#191d21" />
                <stop offset=".52" stopColor="#101318" />
                <stop offset="1" stopColor="#090b0f" />
              </linearGradient>
              <linearGradient id="rankPromotionShieldStroke" x1="58" y1="48" x2="262" y2="344" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#f3ff7a" stopOpacity=".9" />
                <stop offset=".46" stopColor="#c6c8c6" stopOpacity=".76" />
                <stop offset="1" stopColor="#35e8ff" stopOpacity=".64" />
              </linearGradient>
              <filter id="rankPromotionShieldGlow" x="-22%" y="-18%" width="144%" height="136%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feColorMatrix
                  in="blur"
                  type="matrix"
                  values="0 0 0 0 0.78 0 0 0 0 1 0 0 0 0 0.18 0 0 0 .55 0"
                  result="glow"
                />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              className="rankPromotionShieldGlow"
              d="M160 18 290 80v116c0 81-46 145-130 176C76 341 30 277 30 196V80L160 18Z"
            />
            <path
              className="rankPromotionShieldFill"
              d="M160 18 290 80v116c0 81-46 145-130 176C76 341 30 277 30 196V80L160 18Z"
            />
          </svg>
          <div className="rankPromotionShieldClipLayer" aria-hidden="true">
            <div className="rankPromotionLightBeam">
              <span className="rankPromotionLightBeamPulse" />
            </div>
          </div>
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
                  size={216}
                  aria-hidden
                />
                <span className="rankPromotionShatterField" aria-hidden="true">
                  <RankPromotionShatterCanvas rankId={previousRankId} isActive={phase === "smashing"} />
                </span>
              </span>
              <span className="rankPromotionOldLabelPlate">
                <p className="modalSubtext confirmText rankPromotionLabel rankPromotionOldLabelText">{previousRankLabel}</p>
                <span className="rankPromotionOldLabelShatter" aria-hidden="true">
                  {Array.from({ length: RANK_PROMOTION_LABEL_FRAGMENT_COUNT }, (_, index) => (
                    <span className="rankPromotionOldLabelShard" key={index} />
                  ))}
                </span>
              </span>
            </div>
            <div className="rankPromotionRank rankPromotionRankNew" aria-hidden={isDimming || phase === "intro" ? "true" : undefined}>
              <RankThumbnail
                rankId={nextRankId}
                storedThumbnailSrc=""
                className="rankPromotionInsignia rankPromotionInsigniaNew"
                imageClassName="rankPromotionInsigniaImage"
                placeholderClassName="rankPromotionInsigniaPlaceholder"
                alt=""
                size={315}
                aria-hidden
              />
              <p className="modalSubtext confirmText rankPromotionLabel">{nextRankLabel}</p>
            </div>
          </div>
          </div>
          <div className={`confirmBtns rankPromotionCloseSlot${isCloseReady ? " is-ready" : ""}`} aria-live="polite">
            <span className="rankPromotionTapCloseText" aria-hidden={!isCloseReady}>
              Tap to close
            </span>
        </div>
      </div>
    </div>
  );
}
