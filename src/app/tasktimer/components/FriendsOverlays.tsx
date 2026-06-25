import AppImg from "@/components/AppImg";

export default function FriendsOverlays() {
  return (
    <>
      <div className="overlay" id="friendRequestModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Send Friend Request">
          <h2>Send Friend Request</h2>
          <div className="field">
            <input
              id="friendRequestEmailInput"
              type="email"
              autoComplete="email"
              className="text w100"
              placeholder="Email address"
              aria-label="Email address"
            />
          </div>
          <div className="confirmBtns">
            <button className="btn btn-ghost" id="friendRequestCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="friendRequestSendBtn" type="button">
              Send Request
            </button>
          </div>
          <div id="friendRequestModalStatus" className="settingsDetailNote" style={{ display: "none" }} aria-live="polite" />
        </div>
      </div>

      <div className="overlay" id="shareTaskModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Share Task">
          <h2 id="shareTaskTitle">Share Task</h2>
          <p className="modalSubtext shareTaskModalSubtext">Select who to share this task with:</p>
          <div className="field modalDropdownField">
            <select
              id="shareTaskScopeSelect"
              className="text w100 shareTaskScopeNativeSelect"
              defaultValue="all"
              aria-label="Sharing scope"
              tabIndex={-1}
            >
              <option value="all">All friends</option>
              <option value="specific">Specific friend(s)</option>
            </select>
            <div className="modalDropdown" id="shareTaskScopeDropdown">
              <button
                className="modalDropdownButton modalPreviewDropdownButton"
                id="shareTaskScopeDropdownButton"
                type="button"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="shareTaskScopeDropdownList"
              >
                <span id="shareTaskScopeDropdownLabel">All friends</span>
                <span aria-hidden="true">v</span>
              </button>
              <div
                className="modalDropdownList"
                id="shareTaskScopeDropdownList"
                role="listbox"
                aria-labelledby="shareTaskScopeDropdownButton"
                hidden
              >
                <button
                  className="modalDropdownOption modalPreviewDropdownOption isSelected"
                  type="button"
                  role="option"
                  aria-selected="true"
                  data-share-task-scope-option="all"
                >
                  All friends
                </button>
                <button
                  className="modalDropdownOption modalPreviewDropdownOption"
                  type="button"
                  role="option"
                  aria-selected="false"
                  data-share-task-scope-option="specific"
                >
                  Specific friend(s)
                </button>
              </div>
            </div>
          </div>
          <div className="field" id="shareTaskFriendsField" style={{ display: "none" }}>
            <label>Select friend(s)</label>
            <div id="shareTaskFriendsList" />
          </div>
          <div id="shareTaskStatus" className="settingsDetailNote" style={{ display: "none" }} aria-live="polite" />
          <div className="footerBtns">
            <button className="btn btn-ghost" id="shareTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="btn btn-accent" id="shareTaskConfirmBtn" type="button">
              Share
            </button>
          </div>
        </div>
      </div>

      <div className="overlay" id="friendProfileModal" style={{ display: "none" }}>
        <div className="modal friendUserSummaryModal" role="dialog" aria-modal="true" aria-label="User Summary">
          <div className="friendUserSummaryHeaderRow">
            <p className="modalSubtext friendUserSummaryTitle">Friend Info</p>
          </div>
          <div className="friendUserSummaryHeader">
            <div className="friendUserSummaryIdentity" id="friendProfileIdentityRow">
              <span className="friendUserSummaryAvatar" aria-hidden="true">
                <AppImg id="friendProfileAvatar" className="friendUserSummaryAvatarImg" src="/avatars/toons/toon-01-cap-glasses.webp" alt="" />
              </span>
              <div className="friendUserSummaryIdentityText">
                <strong className="friendUserSummaryName" id="friendProfileName">Friend</strong>
                <span className="friendUserSummaryEmail" id="friendProfileEmail" style={{ display: "none" }} />
                <span className="friendUserSummaryMemberSince" id="friendProfileMemberSince">Member since --</span>
              </div>
              <div className="friendUserSummaryAchievementSlots" aria-label="Achievement badges">
                <span className="friendUserSummaryAchievementSlot" aria-hidden="true" />
                <span className="friendUserSummaryAchievementSlot" aria-hidden="true" />
                <span className="friendUserSummaryAchievementSlot" aria-hidden="true" />
                <span className="friendUserSummaryAchievementSlot" aria-hidden="true" />
              </div>
            </div>
            <div className="friendUserSummaryRankBlock">
              <span id="friendProfileRankInsignia" className="friendUserSummaryRankInsignia" aria-hidden="true">
                <AppImg id="friendProfileRankImage" className="friendUserSummaryRankInsigniaImg" src={undefined} alt="" style={{ display: "none" }} />
                <span id="friendProfileRankPlaceholder" className="friendUserSummaryRankInsigniaPlaceholder" style={{ display: "none" }} />
              </span>
              <strong className="friendUserSummaryRankText" id="friendProfileRank">--</strong>
            </div>
          </div>
          <div className="leaderboardPositionStats" aria-label="User stats">
            <div className="leaderboardPositionStatsTitle">User Stats</div>
            <div>
              <strong id="friendProfileXp">0</strong>
              <span>Total XP</span>
            </div>
            <div>
              <strong id="friendProfileSharedTime">0m</strong>
              <span>Time Logged</span>
            </div>
            <div>
              <strong id="friendProfileCompletedTaskCount">0</strong>
              <span>Tasks Completed</span>
            </div>
          </div>
          <div className="confirmBtns friendProfileCloseRow">
            <button className="friendUserSummaryRemoveBtn" id="friendProfileDeleteBtn" type="button">
              Remove
            </button>
            <button className="btn btn-ghost" id="friendProfileCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
