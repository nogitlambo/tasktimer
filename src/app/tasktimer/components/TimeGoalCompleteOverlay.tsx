import AppImg from "../../../components/AppImg";
import { COMPLETION_DIFFICULTY_OPTIONS } from "../lib/completionDifficulty";

export default function TimeGoalCompleteOverlay() {
  return (
    <div className="overlay" id="timeGoalCompleteOverlay" style={{ display: "none" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task Complete">
        <h2 id="timeGoalCompleteTitle">Task Complete!</h2>
        <p className="modalSubtext" id="timeGoalCompleteText">
          You&apos;ve been awarded 0 XP
        </p>
        <div className="timeGoalCompleteMeta confirmText" id="timeGoalCompleteMeta" hidden />
        <fieldset className="timeGoalCompleteDifficulty" aria-describedby="timeGoalCompleteDifficultyHint">
          <legend id="timeGoalCompleteDifficultyQuestion">Were there any challenges completing this task today?</legend>
          <div className="timeGoalCompleteDifficultyIcons" id="timeGoalCompleteDifficultyGroup" role="radiogroup" aria-labelledby="timeGoalCompleteDifficultyQuestion">
            {COMPLETION_DIFFICULTY_OPTIONS.map((option) => (
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
          <div className="timeGoalCompleteDifficultyHint" id="timeGoalCompleteDifficultyHint">
            Choose one before saving this session.
          </div>
        </fieldset>
        <div className="confirmBtns timeGoalCompleteActionGrid">
          <button className="btn btn-ghost" id="timeGoalCompleteAddNoteBtn" type="button">
            Add Note
          </button>
          <button className="btn btn-accent" id="timeGoalCompleteCloseBtn" type="button" disabled>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
