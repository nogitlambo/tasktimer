import AppImg from "../../../components/AppImg";
import { COMPLETION_DIFFICULTY_OPTIONS } from "../lib/completionDifficulty";

export default function TaskManualEntryOverlay() {
  return (
    <div className="overlay" id="taskManualEntryOverlay" style={{ display: "none" }}>
      <div className="modal hmManualEntryModal" role="dialog" aria-modal="true" aria-label="Add manual history entry">
        <h2 id="taskManualEntryTitle">Add Manual Entry for This Task</h2>
        <div className="modalSubtext" id="taskManualEntryMeta" hidden />

        <div className="hmManualEntryModalBody">
          <div className="hmManualEntryTopRow">
            <div className="hmManualEntryField hmManualEntryDateTimeField">
              <label className="hmManualEntryLabel" htmlFor="taskManualDateTimeInput">
                Date/Time
              </label>
              <div className="hmManualEntryDateTimeWrap">
                <input
                  aria-readonly="true"
                  className="hmManualEntryInput hmManualEntryDateTimeInput"
                  id="taskManualDateTimeInput"
                  placeholder="---------- --:--"
                  tabIndex={-1}
                  type="datetime-local"
                />
                <button
                  aria-label="Open date and time picker"
                  className="hmManualEntryDateTimeBtn"
                  id="taskManualDateTimeBtn"
                  type="button"
                >
                  <svg aria-hidden="true" className="hmManualEntryDateTimeBtnIcon" viewBox="0 0 24 24">
                    <rect x="3.5" y="5" width="17" height="15" rx="2.5" ry="2.5" />
                    <path d="M8 3.5v4" />
                    <path d="M16 3.5v4" />
                    <path d="M3.5 9.5h17" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="hmManualEntryField hmManualEntryElapsedField">
              <label className="hmManualEntryLabel">Elapsed</label>
              <div className="hmManualEntryElapsedInputs">
                <input
                  aria-label="Elapsed hours"
                  className="hmManualEntryInput hmManualEntryNumber"
                  id="taskManualHoursInput"
                  inputMode="numeric"
                  spellCheck={false}
                  type="text"
                />
                <span className="hmManualEntryUnit">h</span>
                <input
                  aria-label="Elapsed minutes"
                  className="hmManualEntryInput hmManualEntryNumber"
                  id="taskManualMinutesInput"
                  inputMode="numeric"
                  spellCheck={false}
                  type="text"
                />
                <span className="hmManualEntryUnit">m</span>
              </div>
            </div>
          </div>

          <fieldset className="hmManualEntrySentiment">
            <legend className="hmManualEntryLabel" id="taskManualEntrySentimentQuestion">
              Sentiment
            </legend>
            <div
              className="hmManualEntrySentimentOptions"
              id="taskManualEntryDifficultyGroup"
              role="radiogroup"
              aria-labelledby="taskManualEntrySentimentQuestion"
            >
              {COMPLETION_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  aria-checked="false"
                  className="hmManualEntrySentimentBtn"
                  data-completion-difficulty={option.value}
                  key={option.value}
                  role="radio"
                  type="button"
                >
                  <span className="hmManualEntrySentimentIconWrap" aria-hidden="true">
                    <AppImg
                      alt=""
                      className="hmManualEntrySentimentIcon"
                      draggable={false}
                      height={42}
                      src={option.iconSrc}
                      width={42}
                    />
                  </span>
                  <span className="hmManualEntrySentimentLabel">{option.label}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="hmManualEntryField">
            <label className="hmManualEntryLabel" htmlFor="taskManualNoteInput">
              Notes
            </label>
            <input
              className="hmManualEntryInput"
              id="taskManualNoteInput"
              maxLength={280}
              placeholder="Optional note"
              type="text"
            />
          </div>

          <div className="hmManualEntryError" id="taskManualEntryError" style={{ display: "none" }} />
        </div>

        <div className="footerBtns hmManualEntryFooterBtns">
          <button className="btn btn-ghost" id="taskManualEntryCancelBtn" type="button">
            Cancel
          </button>
          <button className="btn btn-accent" id="taskManualEntrySaveBtn" type="button">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
