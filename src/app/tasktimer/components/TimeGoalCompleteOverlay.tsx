
import { COMPLETION_DIFFICULTY_LABELS } from "../lib/completionDifficulty";

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
          <div className="timeGoalCompleteDifficultyPills" id="timeGoalCompleteDifficultyGroup" role="radiogroup" aria-labelledby="timeGoalCompleteDifficultyQuestion">
            {([1, 2, 3, 4, 5] as const).map((value) => (
              <button
                aria-checked="false"
                className="btn timeGoalCompleteDifficultyPill"
                data-completion-difficulty={value}
                key={value}
                role="radio"
                type="button"
              >
                {COMPLETION_DIFFICULTY_LABELS[value]}
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
