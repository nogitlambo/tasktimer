import type { CSSProperties } from "react";
import AppImg from "../../../components/AppImg";
import type { CompletionDifficulty } from "../lib/completionDifficulty";

type ConfettiPiece = {
  className: string;
  style: CSSProperties;
};

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
        "--x": `${Math.cos(angle) * dist}px`,
        "--y": `${Math.sin(angle) * dist + gravity}px`,
        "--w": `${width}px`,
        "--h": `${height}px`,
        "--c": colors[Math.floor(rand() * colors.length)],
        "--rot": `${Math.floor(rand() * 360)}deg`,
        "--spin": `${Math.floor(rand() * 720 - 360)}deg`,
        "--d": `${rand() * 0.22}s`,
      } as CSSProperties,
    };
  });
}

const CONFETTI_PIECES = buildConfettiPieces();

const TIME_GOAL_COMPLETE_EFFORT_OPTIONS: Array<{
  value: CompletionDifficulty;
  label: string;
  iconSrc: string;
}> = [
  { value: 5, label: "Low", iconSrc: "/sentiment/very_easy.svg" },
  { value: 3, label: "Moderate", iconSrc: "/sentiment/neutral.svg" },
  { value: 1, label: "High", iconSrc: "/sentiment/very_difficult.svg" },
];

export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="timeGoalCompleteConfettiStage" id="timeGoalCompleteConfettiStage" aria-hidden="true">
        {CONFETTI_PIECES.map((piece, index) => (
          <i className={piece.className} key={index} style={piece.style} />
        ))}
      </div>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
        <fieldset className="timeGoalCompleteDifficulty" aria-describedby="timeGoalCompleteDifficultyHint">
          <legend id="timeGoalCompleteDifficultyQuestion">Effort required to complete this task today?</legend>
          <div className="timeGoalCompleteDifficultyIcons" id="timeGoalCompleteDifficultyGroup" role="radiogroup" aria-labelledby="timeGoalCompleteDifficultyQuestion">
            {TIME_GOAL_COMPLETE_EFFORT_OPTIONS.map((option) => (
              <button
                aria-checked="false"
                className="timeGoalCompleteDifficultyIconBtn"
                data-completion-difficulty={option.value}
                key={option.value}
                role="radio"
                type="button"
              >
                <span className="timeGoalCompleteDifficultyIconWrap" aria-hidden="true">
                  <AppImg
                    alt=""
                    className="timeGoalCompleteDifficultyIcon"
                    draggable={false}
                    height={44}
                    src={option.iconSrc}
                    width={44}
                  />
                </span>
                <span className="timeGoalCompleteDifficultyLabel">{option.label}</span>
              </button>
            ))}
          </div>
          <div className="timeGoalCompleteDifficultyHint" id="timeGoalCompleteDifficultyHint" />
        </fieldset>
        <div className="timeGoalCompleteDivider" aria-hidden="true" />
        <div className="timeGoalCompleteNextTasks" id="timeGoalCompleteNextTasks" hidden>
          <div
            className="timeGoalCompleteNextTaskGrid"
            id="timeGoalCompleteNextTaskGrid"
            aria-label="Incomplete tasks for today"
          />
        </div>
        <div className="timeGoalCompleteValidation confirmText" id="timeGoalCompleteValidation" aria-live="polite" hidden />
        <div className="confirmBtns timeGoalCompleteActionGrid">
          <button className="btn btn-accent" id="timeGoalCompleteCloseBtn" type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
