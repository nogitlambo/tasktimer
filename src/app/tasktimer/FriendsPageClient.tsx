"use client";

import { useEffect } from "react";
import AppImg from "@/components/AppImg";
import GlobalTaskAlerts from "./components/GlobalTaskAlerts";
import TaskTimerAppFrame from "./components/TaskTimerAppFrame";
import { initTaskTimerFriendsClient } from "./tasktimerClient";
import "./tasktimer.css";

export default function FriendsPageClient() {
  useEffect(() => {
    const { destroy } = initTaskTimerFriendsClient();
    return () => destroy();
  }, []);

  return (
    <>
      <TaskTimerAppFrame activePage="test2">
        <div className="appPages">
          <section className="appPage appPageOn" id="appPageTest2" aria-label="Friends page">
            <div className="dashboardShell" id="groupsFriendsSection">
              <div className="dashboardTopRow">
                <div className="dashboardTitleWrap">
                  <p className="dashboardKicker">Community</p>
                  <h2 className="dashboardTitle">Friends</h2>
                </div>
                <div className="dashboardEditActions">
                  <button className="btn btn-ghost small" id="openFriendRequestModalBtn" type="button">
                    Add Friend
                  </button>
                </div>
              </div>

              <div className="dashboardGrid">
                <div id="groupsFriendRequestStatus" className="settingsDetailNote" style={{ display: "none" }}>
                  Ready.
                </div>

                <section className="dashboardCard" aria-label="Friends list">
                  <div id="groupsFriendsList" className="settingsDetailNote">
                    No friends yet.
                  </div>
                </section>

                <section className="dashboardCard" aria-label="Tasks shared by you">
                  <details id="groupsSharedByYouDetails">
                    <summary className="dashboardCardTitle" id="groupsSharedByYouTitle">
                      0 shared by you
                    </summary>
                    <div id="groupsSharedByYouList" className="settingsDetailNote">
                      No shared tasks.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Incoming requests">
                  <details id="groupsIncomingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsIncomingRequestsTitle">
                      0 Incoming Requests
                    </summary>
                    <div id="groupsIncomingRequestsList" className="settingsDetailNote">
                      No incoming requests.
                    </div>
                  </details>
                </section>

                <section className="dashboardCard" aria-label="Outgoing requests">
                  <details id="groupsOutgoingRequestsDetails">
                    <summary className="dashboardCardTitle" id="groupsOutgoingRequestsTitle">
                      0 Outgoing Requests
                    </summary>
                    <div id="groupsOutgoingRequestsList" className="settingsDetailNote">
                      No outgoing requests.
                    </div>
                  </details>
                </section>
              </div>
            </div>
          </section>
        </div>
      </TaskTimerAppFrame>

      <GlobalTaskAlerts />
      <div className="overlay" id="friendRequestModal" style={{ display: "none" }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label="Send Friend Request">
          <h2>Send Friend Request</h2>
          <p className="modalSubtext friendRequestModalSubtext">Send a request by entering your friend&apos;s email address.</p>
          <div className="field">
            <label htmlFor="friendRequestEmailInput">Email address</label>
            <input id="friendRequestEmailInput" type="email" autoComplete="email" className="text w100" />
          </div>
          <div className="footerBtns">
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
        <div className="modal" role="dialog" aria-modal="true" aria-label="Friend Profile">
          <div className="friendProfileHeaderRow">
            <h2>Friend Info</h2>
            <button className="friendProfileDeleteLink" id="friendProfileDeleteBtn" type="button">
              Delete Friend
            </button>
          </div>
          <div className="chkRow" id="friendProfileIdentityRow">
            <AppImg id="friendProfileAvatar" src="/avatars/initials/initials-AN.svg" alt="" aria-hidden="true" />
            <div className="friendProfileIdentityText">
              <div id="friendProfileName">Friend</div>
              <div id="friendProfileMemberSince">Member since --</div>
            </div>
          </div>
          <div className="modalSubtext">
            <AppImg
              id="friendProfileRankImage"
              src={undefined}
              alt="Rank insignia"
              style={{ display: "none", width: 72, height: 72, objectFit: "contain", borderRadius: 10, marginBottom: 10 }}
            />
            <div
              id="friendProfileRankPlaceholder"
              className="friendProfileRankPlaceholder"
              style={{ display: "none", width: 72, height: 72, marginBottom: 10 }}
              aria-hidden="true"
            />
            <div id="friendProfileRank">Rank: --</div>
          </div>
          <div className="footerBtns friendProfileCloseRow">
            <button className="btn btn-ghost" id="friendProfileCloseBtn" type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
