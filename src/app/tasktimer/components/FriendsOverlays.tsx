import AppImg from "@/components/AppImg";

export default function FriendsOverlays() {
  return (
    <>
      <div className="overlay primitiveSciFiModalOverlay friendRequestPrimitiveOverlay" id="friendRequestModal" style={{ display: "none" }}>
        <div className="primitiveSciFiModal friendRequestPrimitiveModal friendRequestMobileSheet" role="dialog" aria-modal="true" aria-label="Send Friend Request">
          <div className="friendRequestMobileSheetHandle" aria-hidden="true" />
          <header className="primitiveSciFiModalHeader friendRequestPrimitiveHeader">
            <h2>Send Friend Request</h2>
          </header>
          <div className="primitiveSciFiModalBody friendRequestPrimitiveBody">
            <p className="friendRequestPrimitiveSubtext">Email address must be linked to an active TaskLaunch account.</p>
            <input
              id="friendRequestEmailInput"
              type="email"
              autoComplete="email"
              className="friendRequestPrimitiveInput"
              placeholder="Email address"
              aria-label="Email address"
            />
            <div id="friendRequestModalStatus" className="friendRequestPrimitiveStatus" style={{ display: "none" }} aria-live="polite" />
          </div>
          <footer className="primitiveSciFiModalFooter friendRequestPrimitiveFooter">
            <button className="modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction friendRequestPrimitiveAction friendRequestPrimitiveSecondaryAction" id="friendRequestCancelBtn" type="button">
              Cancel
            </button>
            <button className="primitiveSciFiModalAction primitiveSciFiModalPrimaryAction friendRequestPrimitiveAction friendRequestPrimitivePrimaryAction" id="friendRequestSendBtn" type="button">
              Send Request
            </button>
          </footer>
        </div>
      </div>

      <div className="overlay" id="shareTaskModal" style={{ display: "none" }}>
        <div className="modal shareTaskPrimitiveModal" role="dialog" aria-modal="true" aria-label="Share Task">
          <header className="shareTaskPrimitiveHeader">
            <h2 id="shareTaskTitle">Share Task</h2>
          </header>
          <div className="shareTaskPrimitiveBody">
            <div className="field modalDropdownField modalPreviewDropdownField">
              <p className="modalDropdownHelp shareTaskModalSubtext">Select who to share this task with:</p>
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
              <div className="modalDropdown modalPreviewDropdown" id="shareTaskScopeDropdown">
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
                  className="modalDropdownList modalPreviewDropdownList"
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
          </div>
          <footer className="footerBtns shareTaskPrimitiveFooter">
            <button className="modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction shareTaskPrimitiveAction shareTaskPrimitiveSecondaryAction" id="shareTaskCancelBtn" type="button">
              Cancel
            </button>
            <button className="modalPreviewPrimaryAction primitiveSciFiModalAction primitiveSciFiModalPrimaryAction shareTaskPrimitiveAction shareTaskPrimitivePrimaryAction" id="shareTaskConfirmBtn" type="button">
              Share
            </button>
          </footer>
        </div>
      </div>

      <div className="overlay" id="sharedTaskSummaryModal" style={{ display: "none" }}>
        <div className="modal sharedTaskSummaryModal sharedTaskSummaryPrimitiveModal" role="dialog" aria-modal="true" aria-labelledby="sharedTaskSummaryTitle">
          <header className="shareTaskPrimitiveHeader sharedTaskSummaryPrimitiveHeader">
            <h2 id="sharedTaskSummaryTitle">Shared Task Summary</h2>
          </header>
          <div className="shareTaskPrimitiveBody sharedTaskSummaryPrimitiveBody">
            <div id="sharedTaskSummaryBody" className="sharedTaskSummaryBody" />
          </div>
          <footer className="footerBtns shareTaskPrimitiveFooter sharedTaskSummaryActions sharedTaskSummaryPrimitiveFooter">
            <button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction sharedTaskSummaryPrimitiveAction sharedTaskSummaryPrimitiveSecondaryAction" id="sharedTaskSummaryCloseBtn" type="button">
              Close
            </button>
          </footer>
        </div>
      </div>

      <div className="overlay primitiveSciFiModalOverlay friendProfilePrimitiveOverlay" id="friendProfileModal" style={{ display: "none" }}>
        <div className="modal friendUserSummaryModal friendProfilePrimitiveModal" role="dialog" aria-modal="true" aria-label="User Summary">
          <span className="friendUserSummaryBorderTrace" aria-hidden="true">
            <span className="friendUserSummaryBorderTraceEdge isTop" />
            <span className="friendUserSummaryBorderTraceEdge isRight" />
            <span className="friendUserSummaryBorderTraceEdge isBottom" />
            <span className="friendUserSummaryBorderTraceEdge isLeft" />
          </span>
          <div className="friendUserSummaryRevealBody friendProfilePrimitiveBody">
            <div className="friendUserSummaryHeaderRow friendProfilePrimitiveHeader">
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
            <div className="confirmBtns friendProfileCloseRow friendProfilePrimitiveFooter">
              <button className="friendUserSummaryRemoveBtn primitiveSciFiModalAction primitiveSciFiModalSecondaryAction friendProfilePrimitiveAction friendProfilePrimitiveDestructiveAction" id="friendProfileDeleteBtn" type="button">
                Unfriend
              </button>
              <button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction friendProfilePrimitiveAction friendProfilePrimitiveSecondaryAction" id="friendProfileCloseBtn" type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
