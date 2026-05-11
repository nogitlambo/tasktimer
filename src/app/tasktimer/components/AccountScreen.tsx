"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppImg from "@/components/AppImg";
import { buildRewardsHeaderViewModel } from "../lib/rewards";
import { resolveTaskTimerRouteHref } from "../lib/routeHref";
import DesktopAppRail from "./DesktopAppRail";
import RankLadderModal from "./RankLadderModal";
import { InlineConfirmModal } from "./settings/InlineConfirmModal";
import { getErrorMessage, handleSignOutFlow } from "./settings/settingsAccountService";
import { useSettingsAccountState } from "./settings/useSettingsAccountState";
import { useSettingsAvatarState } from "./settings/useSettingsAvatarState";

const RAIL_TRANSITION_STORAGE_KEY = "tasktimer:railSlideTransition";

function formatMemberSinceDate(value: string | null) {
  if (!value) return "--";
  const nextDate = new Date(value);
  if (Number.isNaN(nextDate.getTime())) return "--";
  return nextDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatXp(value: number) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString();
}

export default function AccountScreen() {
  const accountState = useSettingsAccountState();
  const account = accountState.account;
  const avatar = useSettingsAvatarState({
    authUserUid: accountState.authUserUid,
    authUserEmail: accountState.authUserEmail,
    authHasGoogleProvider: accountState.authHasGoogleProvider,
    authGooglePhotoUrl: accountState.authGooglePhotoUrl,
    setAuthError: accountState.setAuthError,
    setAuthStatus: accountState.setAuthStatus,
  });
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(avatar.rewardProgress), [avatar.rewardProgress]);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    let timerId: number | null = null;
    document.body.setAttribute("data-route-root", "account");
    try {
      const raw = window.sessionStorage.getItem(RAIL_TRANSITION_STORAGE_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(RAIL_TRANSITION_STORAGE_KEY);
      const parsed = JSON.parse(raw) as { toPage?: unknown; direction?: unknown; at?: unknown };
      const isFresh = Date.now() - Number(parsed.at || 0) < 5000;
      const direction = parsed.direction === "backward" ? "backward" : parsed.direction === "forward" ? "forward" : "";
      if (parsed.toPage !== "account" || !isFresh || !direction) return;
      document.body.setAttribute("data-route-slide-direction", direction);
      document.body.classList.add("isRouteSlideEntering");
      timerId = window.setTimeout(() => {
        document.body.classList.remove("isRouteSlideEntering");
        document.body.removeAttribute("data-route-slide-direction");
      }, 220);
    } catch {
      // ignore malformed transition metadata
    }
    return () => {
      if (timerId != null) window.clearTimeout(timerId);
      document.body.classList.remove("isRouteSlideEntering");
      document.body.removeAttribute("data-route-slide-direction");
      if (document.body.getAttribute("data-route-root") === "account") {
        document.body.removeAttribute("data-route-root");
      }
    };
  }, []);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = resolveTaskTimerRouteHref("/dashboard");
  }, []);

  const handleSignOut = useCallback(async () => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setSignOutError("");
    try {
      await handleSignOutFlow();
    } catch (error: unknown) {
      setSignOutError(getErrorMessage(error, "Could not sign out."));
      setSignOutBusy(false);
    }
  }, [signOutBusy]);

  const profileName = account.authUserAlias || account.authUserEmail?.split("@")[0] || "TaskLaunch User";
  const planLabel = account.authPlan === "pro" ? "Pro" : "Free";

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Account">
      <div className="topbar topbarBrandOnly" aria-label="TaskLaunch header">
        <div className="brand landingV2FooterBrand appBrandLandingReplica displayFont">
          <AppImg className="landingV2HeaderBrandIcon appBrandLandingReplicaIcon" src="/logo/launch-icon-original-transparent.png" alt="" />
          <span className="appBrandLandingReplicaText">TaskLaunch</span>
        </div>
      </div>
      <div className="desktopAppShell">
        <DesktopAppRail activePage="account" useClientNavButtons={false} showMobileFooter={false} />
        <main className="desktopAppMain accountRouteMain">
          <section className="accountProfilePage" aria-label="Account profile">
            <header className="accountProfileTopbar">
              <button className="iconBtn accountProfileBackBtn" type="button" aria-label="Back" onClick={handleBack}>
                <span>Back</span>
              </button>
              <h1>Account</h1>
            </header>

            <div className="accountProfileHero">
              <button className="accountProfileAvatarBtn" type="button" aria-label="Choose avatar" onClick={() => avatar.setShowAvatarPickerModal(true)}>
                <span className="accountProfileAvatarRing" aria-hidden="true">
                  {avatar.selectedAvatar ? (
                    <AppImg
                      className="accountProfileAvatarImg"
                      src={avatar.selectedAvatar.src}
                      alt=""
                      referrerPolicy={/^https?:\/\//i.test(avatar.selectedAvatar.src) ? "no-referrer" : undefined}
                    />
                  ) : (
                    <span className="accountProfileAvatarFallback">TL</span>
                  )}
                </span>
              </button>
              <div className="accountProfileIdentity">
                {account.authUserAliasEditing ? (
                  <div className="accountProfileAliasEdit">
                    <input
                      className="settingsAccountAliasInput accountProfileAliasInput"
                      type="text"
                      value={account.authUserAliasDraft}
                      onChange={(event) => account.onAliasDraftChange(event.target.value)}
                      disabled={account.authUserAliasBusy}
                      aria-label="Username"
                      maxLength={60}
                    />
                    <button className="iconBtn" type="button" onClick={() => void account.onSaveAlias()} disabled={account.authUserAliasBusy} aria-label="Save username">
                      {"\u2713"}
                    </button>
                    <button className="iconBtn" type="button" onClick={account.onCancelAliasEdit} disabled={account.authUserAliasBusy} aria-label="Cancel username edit">
                      {"\u2715"}
                    </button>
                  </div>
                ) : (
                  <h2>{profileName}</h2>
                )}
                <p className="accountProfileEmail">{account.authUserEmail || "Signed in account"}</p>
                <p className="accountProfileBio">
                  {rewardsHeader.rankLabel} focused on TaskLaunch. Member since {formatMemberSinceDate(account.authMemberSince)}.
                </p>
              </div>
            </div>

            <div className="accountProfileStats" aria-label="Account summary">
              <div>
                <strong>{formatXp(rewardsHeader.totalXp)}</strong>
                <span>XP</span>
              </div>
              <button type="button" onClick={() => avatar.setShowRankLadderModal(true)} aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}>
                <strong>{rewardsHeader.rankLabel}</strong>
                <span>Rank</span>
              </button>
              <div>
                <strong>{planLabel}</strong>
                <span>Plan</span>
              </div>
            </div>

            <div className="accountProfileStatus" aria-live="polite">
              <div className={`settingsSyncStatus is-${account.syncState}`}>
                <span className="settingsSyncStatusDot" aria-hidden="true" />
                <span className="settingsSyncStatusText">{account.syncMessage}</span>
              </div>
              {account.authStatus ? <div className="settingsAuthNotice">{account.authStatus}</div> : null}
              {account.authError ? <div className="settingsAuthError">{account.authError}</div> : null}
              {avatar.avatarSyncNotice ? (
                <div className={avatar.avatarSyncNoticeIsError ? "settingsAuthError" : "settingsAuthNotice"}>{avatar.avatarSyncNotice}</div>
              ) : null}
              {signOutError ? <div className="settingsAuthError">{signOutError}</div> : null}
            </div>

            <div className="accountProfileActions" role="list" aria-label="Account actions">
              <button className="accountProfileAction" type="button" onClick={account.onStartAliasEdit}>
                <AppImg src="/Settings.svg" alt="" aria-hidden="true" />
                <span>
                  <strong>Edit my profile</strong>
                  <small>Update your username and avatar</small>
                </span>
              </button>
              <a className="accountProfileAction" href={resolveTaskTimerRouteHref("/settings")}>
                <AppImg src="/icons/icons_default/settings.png" alt="" aria-hidden="true" />
                <span>
                  <strong>Settings</strong>
                  <small>Edit preferences and app controls</small>
                </span>
              </a>
              <button className="accountProfileAction" type="button" onClick={() => void account.onOpenPlanAction()}>
                <AppImg src="/icons/icons_default/leaderboard.png" alt="" aria-hidden="true" />
                <span>
                  <strong>{account.authPlan === "pro" ? "Manage subscription" : "Upgrade plan"}</strong>
                  <small>{account.authPlan === "pro" ? "Open billing and plan management" : "Review Pro account features"}</small>
                </span>
              </button>
              {account.authUserUid ? (
                <button className="accountProfileAction" type="button" onClick={() => void account.onCopyUid()}>
                  <AppImg src="/icons/icons_default/share.png" alt="" aria-hidden="true" />
                  <span>
                    <strong>{account.uidCopyStatus || "Copy account ID"}</strong>
                    <small>Copy your TaskLaunch UID</small>
                  </span>
                </button>
              ) : null}
              <button className="accountProfileAction" type="button" onClick={handleSignOut} disabled={signOutBusy}>
                <AppImg src="/icons/icons_default/signout.png" alt="" aria-hidden="true" />
                <span>
                  <strong>{signOutBusy ? "Signing out" : "Sign out"}</strong>
                  <small>Log out of your account</small>
                </span>
              </button>
              <button className="accountProfileAction accountProfileActionDanger" type="button" onClick={() => account.setShowDeleteAccountConfirm(true)} disabled={account.authBusy}>
                <AppImg src="/icons/icons_default/trash.png" alt="" aria-hidden="true" />
                <span>
                  <strong>Delete Account</strong>
                  <small>Permanently remove this sign-in account</small>
                </span>
              </button>
            </div>
          </section>
        </main>
      </div>
      <div className="checkpointToastHost" id="checkpointToastHost" aria-live="polite" aria-atomic="false" />

      <InlineConfirmModal open={account.showDeleteAccountConfirm} onClose={() => account.setShowDeleteAccountConfirm(false)} ariaLabel="Delete Account" title="Delete Account">
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

      <InlineConfirmModal open={avatar.showAvatarPickerModal} onClose={() => avatar.setShowAvatarPickerModal(false)} ariaLabel="Choose Avatar" title="Choose Avatar" modalClassName="settingsInlineConfirmModal settingsAvatarModal">
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
                    <AppImg src={option.src} alt={option.label} className="settingsAvatarOptionImg" referrerPolicy={/^https?:\/\//i.test(option.src) ? "no-referrer" : undefined} />
                    <span className="settingsAvatarOptionLabel">{option.label}</span>
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
    </div>
  );
}
