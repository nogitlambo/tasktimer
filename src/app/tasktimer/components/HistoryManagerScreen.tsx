
import AppImg from "../../../components/AppImg";
import { COMPLETION_DIFFICULTY_OPTIONS } from "../lib/completionDifficulty";

export default function HistoryManagerScreen() {
  return (
    <>
      <section id="historyManagerScreen" aria-hidden="true">
        <div className="hmLoadingOverlay" id="historyManagerLoadingOverlay" hidden>
          <div className="hmLoadingCard" role="status" aria-live="polite">
            <div className="hmLoadingTitle">Loading History Manager</div>
            <div className="hmLoadingText">Preparing your history entries and controls.</div>
            <div className="hmLoadingBar" aria-hidden="true">
              <span className="hmLoadingBarFill" />
            </div>
          </div>
        </div>
        <div className="hmHead">
          <div className="hmTitle">History Manager</div>
          <div className="hmHeadActions">
            <button className="btn btn-ghost small" id="historyManagerGenerateBtn" type="button">
              Generate Test Data
            </button>
            <button className="btn btn-ghost small" id="historyManagerBulkBtn" type="button">
              Bulk Edit
            </button>
            <button className="btn btn-warn small" id="historyManagerBulkDeleteBtn" type="button" style={{ display: "none" }}>
              Delete
            </button>
          </div>
        </div>
        <div className="hmList" id="hmList" />
      </section>

      <div className="overlay" id="historyManagerManualEntryOverlay" style={{ display: "none" }}>
        <div className="modal hmManualEntryModal" role="dialog" aria-modal="true" aria-label="Add manual history entry">
          <h2 id="historyManagerManualEntryTitle">Add Manual Entry for This Task</h2>
          <div className="modalSubtext" id="historyManagerManualEntryMeta" hidden />

          <div className="hmManualEntryModalBody">
            <div className="hmManualEntryTopRow">
              <div className="hmManualEntryField hmManualEntryDateTimeField">
                <label className="hmManualEntryLabel" htmlFor="historyManagerManualDateTimeInput">
                  Date/Time
                </label>
                <div className="hmManualEntryDateTimeWrap">
                  <input
                    aria-readonly="true"
                    className="hmManualEntryInput hmManualEntryDateTimeInput"
                    id="historyManagerManualDateTimeInput"
                    placeholder="---------- --:--"
                    tabIndex={-1}
                    type="datetime-local"
                  />
                  <button
                    aria-label="Open date and time picker"
                    className="hmManualEntryDateTimeBtn"
                    id="historyManagerManualDateTimeBtn"
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
                    id="historyManagerManualHoursInput"
                    inputMode="numeric"
                    spellCheck={false}
                    type="text"
                  />
                  <span className="hmManualEntryUnit">h</span>
                  <input
                    aria-label="Elapsed minutes"
                    className="hmManualEntryInput hmManualEntryNumber"
                    id="historyManagerManualMinutesInput"
                    inputMode="numeric"
                    spellCheck={false}
                    type="text"
                  />
                  <span className="hmManualEntryUnit">m</span>
                </div>
              </div>
            </div>

            <fieldset className="hmManualEntrySentiment">
              <legend className="hmManualEntryLabel" id="historyManagerManualEntrySentimentQuestion">
                Sentiment
              </legend>
              <div
                className="hmManualEntrySentimentOptions"
                id="historyManagerManualEntryDifficultyGroup"
                role="radiogroup"
                aria-labelledby="historyManagerManualEntrySentimentQuestion"
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
              <label className="hmManualEntryLabel" htmlFor="historyManagerManualNoteInput">
                Notes
              </label>
              <input
                className="hmManualEntryInput"
                id="historyManagerManualNoteInput"
                maxLength={280}
                placeholder="Optional note"
                type="text"
              />
            </div>

            <div className="hmManualEntryError" id="historyManagerManualEntryError" style={{ display: "none" }} />
          </div>

          <div className="confirmBtns">
            <button className="btn btn-ghost" id="historyManagerManualEntryCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="historyManagerManualEntrySaveBtn" type="button">
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
