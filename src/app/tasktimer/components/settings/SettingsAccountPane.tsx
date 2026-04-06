"use client";

import { useMemo, useRef } from "react";
import AppImg from "@/components/AppImg";
import { buildRewardsHeaderViewModel, RANK_LADDER, RANK_MODAL_THUMBNAIL_BY_ID } from "@/app/tasktimer/lib/rewards";
import RankThumbnail from "../RankThumbnail";
import { SettingsDetailPane } from "./SettingsShared";
import type { SettingsAccountViewModel, SettingsAvatarViewModel, SettingsPushViewModel } from "./types";

function formatMemberSinceDate(value: string | null) {
  if (!value) return "--";
  const nextDate = new Date(value);
  if (Number.isNaN(nextDate.getTime())) return "--";
  return nextDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatPlanUserLabel(plan: SettingsAccountViewModel["authPlan"]) {
  return `${plan === "pro" ? "Pro" : "Free"} User`;
}

function formatPlanActionLabel(plan: SettingsAccountViewModel["authPlan"]) {
  return plan === "pro" ? "Manage Subscription" : "Upgrade to Pro";
}

export function SettingsAccountPane({
  active,
  account,
  avatar,
  push,
}: {
  active: boolean;
  account: SettingsAccountViewModel;
  avatar: SettingsAvatarViewModel;
  push: SettingsPushViewModel;
}) {
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(avatar.rewardProgress), [avatar.rewardProgress]);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SettingsDetailPane active={active} title="Account" subtitle="">
      <div className="settingsInlineStack">
        <section className="settingsInlineSection">
          {account.authUserEmail ? (
            <div className="settingsAvatarPicker" aria-label="Avatar selection">
              <div className="settingsAccountIdCard" aria-label="Account profile card">
                <div className="settingsAccountIdCardHeader">
                  <div className="settingsAccountIdCardBrandBlock">
                    <div className="settingsAccountIdCardBrandEyebrow">VERIFIED IDENTITY</div>
                    <div className="settingsAccountIdCardBrandTitle">{formatPlanUserLabel(account.authPlan)}</div>
                    <button
                      className="settingsAccountIdCardPlanLink"
                      type="button"
                      onClick={() => void account.onOpenPlanAction()}
                    >
                      {formatPlanActionLabel(account.authPlan)}
                    </button>
                  </div>
                  <div className="settingsAccountIdCardHeaderRankCluster">
                    <div className="settingsAccountFieldRow settingsAccountRankCol settingsAccountIdCardHeaderRankMeta">
                      <div className="settingsAccountFieldLabel settingsAccountIdCardLabel">Current Rank</div>
                      <div className="settingsAccountIdCardRankValue">{rewardsHeader.rankLabel}</div>
                    </div>
                    <button
                      className="settingsAccountRankBtn settingsAccountIdCardHeaderRankBtn"
                      type="button"
                      aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}
                      onClick={() => avatar.setShowRankLadderModal(true)}
                    >
                      <div className="settingsAccountRankPlaceholder settingsAccountIdCardHeaderRankBadge">
                        <RankThumbnail
                          rankId={avatar.rewardProgress.currentRankId}
                          storedThumbnailSrc={avatar.rankThumbnailSrc}
                          className="settingsAccountRankPlaceholderShell settingsAccountIdCardHeaderRankBadgeShell"
                          imageClassName="settingsAccountRankImage"
                          placeholderClassName="settingsAccountRankPlaceholderInner"
                          alt="Rank thumbnail"
                          size={44}
                        />
                      </div>
                    </button>
                  </div>
                </div>

                <div className="settingsAccountProfileRow settingsAccountIdCardBody">
                  <div className="settingsAvatarCol settingsAccountIdCardAvatarDock">
                    <button
                      type="button"
                      className="accountAvatarFrameBtn"
                      onClick={() => avatar.setShowAvatarPickerModal(true)}
                      aria-label="Choose avatar"
                    >
                      <div className="accountAvatarPlaceholder">
                        {avatar.selectedAvatar ? (
                          <AppImg className="accountAvatarImage" src={avatar.selectedAvatar.src} alt={`${avatar.selectedAvatar.label} avatar`} />
                        ) : (
                          <div className="accountAvatarPlaceholderInner" />
                        )}
                      </div>
                    </button>
                    <div className="settingsAccountIdCardAvatarCaption">Tap avatar to update profile badge</div>
                  </div>

                  <div className="settingsAccountIdCardIdentity">
                    <div className="settingsAccountFieldRow settingsAccountIdentityBlock">
                      <div className="settingsAccountFieldLabel settingsAccountIdCardLabel">Username</div>
                      <div className="settingsAccountFieldValueRow settingsAccountAliasValueRow">
                        {account.authUserAliasEditing ? (
                          <>
                            <input
                              className="settingsAccountAliasInput"
                              type="text"
                              value={account.authUserAliasDraft}
                              onChange={(event) => account.onAliasDraftChange(event.target.value)}
                              disabled={account.authUserAliasBusy}
                              aria-label="Username"
                              maxLength={60}
                            />
                            <div className="settingsAccountAliasActions">
                              <button
                                className="iconBtn settingsAccountAliasAction settingsAccountAliasActionSave"
                                type="button"
                                onClick={() => void account.onSaveAlias()}
                                disabled={account.authUserAliasBusy}
                                aria-label="Save username"
                                title="Save username"
                              >
                                {"\u2713"}
                              </button>
                              <button
                                className="iconBtn settingsAccountAliasAction settingsAccountAliasActionCancel"
                                type="button"
                                onClick={account.onCancelAliasEdit}
                                disabled={account.authUserAliasBusy}
                                aria-label="Cancel username edit"
                                title="Cancel username edit"
                              >
                                {"\u2715"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="settingsAccountFieldValue settingsAccountFieldValueWrap settingsAccountIdCardNameValue">
                              {account.authUserAlias || "-"}
                            </div>
                            <button
                              className="iconBtn settingsAccountAliasAction"
                              type="button"
                              onClick={account.onStartAliasEdit}
                              aria-label="Edit username"
                              title="Edit username"
                            >
                              {"\u270e"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="settingsAccountIdCardMetaGrid">
                    <div className="settingsAccountIdCardMetaItem">
                      <span className="settingsAccountUidLabel">Email Address</span>
                      <span className="settingsAccountUidValue">{account.authUserEmail}</span>
                    </div>
                    {account.authUserUid ? (
                      <div className="settingsAccountIdCardMetaItem settingsAccountUidRow">
                        <span className="settingsAccountUidLabel">UID</span>
                        <span className="settingsAccountUidValue">{account.authUserUid}</span>
                        <button
                          className="iconBtn settingsUidCopyBtn"
                          type="button"
                          onClick={() => void account.onCopyUid()}
                          aria-label={account.uidCopyStatus || "Copy UID"}
                          title={account.uidCopyStatus || "Copy UID"}
                        >
                          <span className="settingsUidCopyIcon" aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                    <div className="settingsAccountIdCardMetaItem settingsAccountMemberSinceRow">
                      <span className="settingsAccountUidLabel">Member Since</span>
                      <span className="settingsAccountUidValue">{formatMemberSinceDate(account.authMemberSince)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {account.authUserEmail ? (
            <div className="settingsDetailNote settingsAccountIdCardFooter">
              <div className={`settingsSyncStatus is-${account.syncState}`}>
                <span className="settingsSyncStatusDot" aria-hidden="true" />
                <span className="settingsSyncStatusText">{account.syncMessage}</span>
                {account.syncAtMs && account.syncState === "synced" ? (
                  <span className="settingsSyncStatusTime">
                    ({new Date(account.syncAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})
                  </span>
                ) : null}
              </div>
              <div className="settingsInlineFooter settingsAuthActions settingsAuthActionsInline">
                {push.canTriggerPushTest ? (
                  <button
                    className="btn btn-ghost small settingsPushTestBtn"
                    type="button"
                    disabled={account.authBusy || push.pushTestBusy}
                    onClick={() => void push.onPushTest()}
                    title="Send a hidden push test to your registered devices"
                    aria-label="Send push test"
                  >
                    {push.pushTestBusy ? "Sending..." : "Push Test"}
                  </button>
                ) : null}
                <button
                  className="btn btn-accent small settingsSignOutBtn"
                  id="signInGoogleBtn"
                  type="button"
                  disabled={account.authBusy}
                  onClick={() => void account.onSignOut()}
                >
                  Sign Out
                </button>
              </div>
              {push.pushTestStatus ? <div className="settingsPushTestStatus">{push.pushTestStatus}</div> : null}
            </div>
          ) : null}

          {account.authStatus ? <div className="settingsAuthNotice">{account.authStatus}</div> : null}
          {account.authError ? <div className="settingsAuthError">{account.authError}</div> : null}
          {avatar.avatarSyncNotice ? (
            <div className={avatar.avatarSyncNoticeIsError ? "settingsAuthError" : "settingsAuthNotice"}>{avatar.avatarSyncNotice}</div>
          ) : null}

          {account.authUserEmail ? (
            <>
              <div className="settingsInlineSectionHead settingsDeleteAccountHead">
                <div className="settingsInlineSectionTitle">Delete Account</div>
              </div>
              <div className="settingsDetailNote settingsDangerDisclosure">
                <div className="settingsDangerDisclosureBody">
                  Deleting your account removes your Firebase sign-in account. Local task and history data on this device is not removed automatically. Use
                  Reset All if you want to clear local device data.
                </div>
                <details className="settingsDangerDisclosureToggle">
                  <summary className="settingsDangerDisclosureSummary" aria-label="Show delete account button" />
                  <div className="settingsInlineFooter settingsAuthActions settingsDangerDisclosureActions">
                    <button className="btn btn-warn" type="button" disabled={account.authBusy} onClick={() => account.setShowDeleteAccountConfirm(true)}>
                      Delete Account
                    </button>
                  </div>
                </details>
              </div>
            </>
          ) : (
            <div className="settingsDetailNote">
              Account details are available after signing in from the landing page. <a href="/privacy">Privacy Policy</a>
            </div>
          )}
        </section>
      </div>

      {account.showDeleteAccountConfirm ? (
        <div className="overlay settingsInlineConfirmOverlay" onClick={() => account.setShowDeleteAccountConfirm(false)}>
          <div className="modal settingsInlineConfirmModal" role="dialog" aria-modal="true" aria-label="Delete Account" onClick={(event) => event.stopPropagation()}>
            <h3 className="settingsInlineConfirmTitle">Delete Account</h3>
            <p className="settingsInlineConfirmText">Permanently delete your sign-in account for this app? This action cannot be undone.</p>
            <p className="settingsInlineConfirmText">
              Local task and history data on this device are not deleted automatically. Use Reset All separately if needed.
            </p>
            <div className="footerBtns settingsInlineConfirmBtns">
              <button className="btn btn-ghost" type="button" onClick={() => account.setShowDeleteAccountConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-warn" type="button" onClick={() => void account.onDeleteAccount()} disabled={account.authBusy}>
                Delete Account
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {avatar.showAvatarPickerModal ? (
        <div className="overlay settingsInlineConfirmOverlay" onClick={() => avatar.setShowAvatarPickerModal(false)}>
          <div
            className="modal settingsInlineConfirmModal settingsAvatarModal"
            role="dialog"
            aria-modal="true"
            aria-label="Choose Avatar"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="settingsInlineConfirmTitle">Choose Avatar</h3>
            <div className="settingsAvatarOptions" role="list" aria-label="Available avatars">
              {avatar.avatarGroups.map((group) => (
                <section key={group.key} className="settingsAvatarGroup" aria-label={group.title}>
                  <h4 className="settingsAvatarGroupTitle">{group.title}</h4>
                  <div className="settingsAvatarGroupRow" role="list">
                    {group.items.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`settingsAvatarOption${avatar.selectedAvatarId === option.id ? " isSelected" : ""}`}
                        onClick={() => void avatar.onSelectAvatar(option.id)}
                        aria-pressed={avatar.selectedAvatarId === option.id}
                        title={option.label}
                      >
                        <AppImg src={option.src} alt={option.label} className="settingsAvatarOptionImg" />
                        <span className="settingsAvatarOptionLabel">{option.label}</span>
                        {avatar.selectedAvatarId === option.id ? (
                          <span className="settingsAvatarOptionSelected" aria-hidden="true">
                            Selected
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="footerBtns settingsInlineConfirmBtns">
              <input
                ref={avatarUploadInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files && event.target.files.length ? event.target.files[0] : null;
                  void avatar.onUploadAvatar(file);
                  event.currentTarget.value = "";
                }}
              />
              <button className="btn btn-accent" type="button" onClick={() => avatarUploadInputRef.current?.click()}>
                Upload
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => avatar.setShowAvatarPickerModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {avatar.showRankLadderModal ? (
        <div className="overlay" id="rankLadderOverlay" onClick={() => avatar.setShowRankLadderModal(false)}>
          <div className="modal rankLadderModal" role="dialog" aria-modal="true" aria-label="Rank ladder" onClick={(event) => event.stopPropagation()}>
            <h2>Rank Ladder</h2>
            <p className="modalSubtext">
              {rewardsHeader.rankLabel} is your current rank at {rewardsHeader.totalXp} XP.{" "}
              {rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to reach the next rank.` : "You have reached the highest configured rank."}
            </p>
            <div className="rankLadderList" role="list" aria-label="Available ranks">
              {RANK_LADDER.map((rank, index) => {
                const isCurrent = rank.id === avatar.rewardProgress.currentRankId;
                const isUnlocked = index <= avatar.currentRankIndex;
                const thresholdLabel = Number.isFinite(rank.minXp) ? `${rank.minXp} XP` : "Threshold pending";
                const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
                const isSelectedThumbnail = avatar.rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
                const content = (
                  <>
                    <div className="rankLadderItemBadge" aria-hidden="true">
                      <RankThumbnail
                        rankId={rank.id}
                        storedThumbnailSrc=""
                        className="rankLadderItemBadgeShell"
                        imageClassName="rankLadderItemBadgeImage"
                        placeholderClassName="rankLadderItemBadgePlaceholder"
                        alt=""
                        size={34}
                        aria-hidden
                      />
                    </div>
                    <div className="rankLadderItemBody">
                      <div className="rankLadderItemTitleRow">
                        <span className="rankLadderItemTitle">{rank.label}</span>
                        {isSelectedThumbnail ? <span className="rankLadderItemFlag">Selected</span> : null}
                        {isCurrent ? <span className="rankLadderItemFlag">Current</span> : null}
                        {!isCurrent && isUnlocked ? <span className="rankLadderItemFlag">Unlocked</span> : null}
                      </div>
                      <div className="rankLadderItemMeta">Unlocks at {thresholdLabel}</div>
                    </div>
                  </>
                );
                return avatar.canSelectRankInsignia ? (
                  <button
                    key={rank.id}
                    type="button"
                    className={`rankLadderItem isSelectable${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                    onClick={() => void avatar.onSelectRankThumbnail(rank.id)}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={rank.id}
                    className={`rankLadderItem${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                    role="listitem"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            <div className="confirmBtns">
              <button className="btn btn-ghost" type="button" onClick={() => avatar.setShowRankLadderModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SettingsDetailPane>
  );
}
