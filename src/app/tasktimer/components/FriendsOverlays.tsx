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
          <p className="modalSubtext shareTaskModalSubtext">Choose who should receive this task and its live progress.</p>
          <div className="field">
            <label htmlFor="shareTaskScopeSelect">Sharing scope</label>
            <select id="shareTaskScopeSelect" className="text w100" defaultValue="all">
              <option value="all">Share with all friends</option>
              <option value="specific">Share with specific friend(s)</option>
            </select>
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
                <AppImg id="friendProfileAvatar" className="friendUserSummaryAvatarImg" src="/avatars/toons/toonHead-male.svg" alt="" />
              </span>
              <div className="friendUserSummaryIdentityText">
                <strong className="friendUserSummaryName" id="friendProfileName">Friend</strong>
                <span className="friendUserSummaryMemberSince" id="friendProfileMemberSince">Member since --</span>
                <button className="friendUserSummaryRemoveBtn" id="friendProfileDeleteBtn" type="button">
                  Remove
                </button>
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
          <div className="friendUserSummaryStats" aria-label="Friend summary">
            <div className="friendUserSummaryStatsTitle">STATS</div>
            <div>
              <strong id="friendProfileXp">0</strong>
              <span>XP</span>
            </div>
            <div>
              <strong id="friendProfileSharedTime">0m</strong>
              <span>Logged</span>
            </div>
            <div>
              <strong id="friendProfileSharedAverage">0m</strong>
              <span>Weekly avg</span>
            </div>
          </div>
          <div className="confirmBtns friendProfileCloseRow">
            <button className="btn btn-ghost modalPreviewSecondaryAction" id="friendProfileCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
