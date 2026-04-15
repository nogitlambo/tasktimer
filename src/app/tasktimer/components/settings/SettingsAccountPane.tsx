"use client";

import { useMemo, useRef } from "react";
import AppImg from "@/components/AppImg";
import { buildRewardsHeaderViewModel } from "@/app/tasktimer/lib/rewards";
import RankLadderModal from "../RankLadderModal";
import RankThumbnail from "../RankThumbnail";
import { InlineConfirmModal } from "./InlineConfirmModal";
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
  exiting = false,
  account,
  avatar,
  push,
}: {
  active: boolean;
  exiting?: boolean;
  account: SettingsAccountViewModel;
  avatar: SettingsAvatarViewModel;
  push: SettingsPushViewModel;
}) {
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(avatar.rewardProgress), [avatar.rewardProgress]);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <SettingsDetailPane active={active} exiting={exiting} title="Account" subtitle="">
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
              <div className="settingsDeleteAccountDivider" aria-hidden="true" />
              <div className="settingsInlineFooter settingsAuthActions settingsDangerDisclosureActions">
                  <button className="btn btn-warn" type="button" disabled={account.authBusy} onClick={() => account.setShowDeleteAccountConfirm(true)}>
                    Delete Account
                  </button>
              </div>
            </>
          ) : (
            <div className="settingsDetailNote">
              Account details are available after signing in from the landing page. <a href="/privacy">Privacy Policy</a>
            </div>
          )}
        </section>
      </div>

      <InlineConfirmModal
        open={account.showDeleteAccountConfirm}
        onClose={() => account.setShowDeleteAccountConfirm(false)}
        ariaLabel="Delete Account"
        title="Delete Account"
      >
        <p className="settingsInlineConfirmText">Permanently delete your sign-in account for this app? This action cannot be undone.</p>
        <div className="footerBtns settingsInlineConfirmBtns">
          <button className="btn btn-ghost" type="button" onClick={() => account.setShowDeleteAccountConfirm(false)}>
            Cancel
          </button>
          <button className="btn btn-warn" type="button" onClick={() => void account.onDeleteAccount()} disabled={account.authBusy}>
            Delete Account
          </button>
        </div>
      </InlineConfirmModal>

      <InlineConfirmModal
        open={avatar.showAvatarPickerModal}
        onClose={() => avatar.setShowAvatarPickerModal(false)}
        ariaLabel="Choose Avatar"
        title="Choose Avatar"
        modalClassName="settingsInlineConfirmModal settingsAvatarModal"
      >
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
      </InlineConfirmModal>

      <RankLadderModal
        open={avatar.showRankLadderModal}
        onClose={() => avatar.setShowRankLadderModal(false)}
        rankLabel={rewardsHeader.rankLabel}
        totalXp={rewardsHeader.totalXp}
        rankSummary={avatar.rankLadderSummary}
        currentRankId={avatar.rewardProgress.currentRankId}
        currentRankIndex={avatar.currentRankIndex}
        rankThumbnailSrc={avatar.rankThumbnailSrc}
        canSelectRankInsignia={avatar.canSelectRankInsignia}
        onSelectRankThumbnail={avatar.onSelectRankThumbnail}
      />
    </SettingsDetailPane>
  );
}
