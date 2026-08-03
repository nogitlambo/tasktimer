"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppImg from "@/components/AppImg";
import { useRouter } from "next/navigation";
import { buildRewardsHeaderViewModel } from "../lib/rewards";
import { getAccountBackRoute } from "../lib/accountRoute";
import DesktopAppRail from "./DesktopAppRail";
import NativePlusUpsellModal from "./NativePlusUpsellModal";
import RankLadderModal from "./RankLadderModal";
import RankPromotionOverlay from "./RankPromotionOverlay";
import RankThumbnail from "./RankThumbnail";
import {
  buildRankPromotionTestPayload,
  startRankPromotionCelebration,
  stopRankPromotionCelebration,
  type RankPromotion,
} from "../client/rank-promotion";
import { playDeleteAlertAudio } from "../client/delete-alert-audio";
import { DeleteAccountConfirmActions } from "./settings/DeleteAccountConfirmActions";
import { InlineConfirmModal } from "./settings/InlineConfirmModal";
import { getErrorMessage, handleSignOutFlow } from "./settings/settingsAccountService";
import SignOutConfirmModal from "./SignOutConfirmModal";
import { useAchievementSoundsEnabled } from "./settings/useAchievementSoundsEnabled";
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

function formatAccountPlan(plan: string) {
  if (plan === "plus_lifetime") return "PLUS Lifetime";
  if (plan === "plus") return "PLUS";
  return "FREE";
}

function formatPlanRenewalDate(value: number | null) {
  if (!value) return "--";
  const nextDate = new Date(value);
  if (Number.isNaN(nextDate.getTime())) return "--";
  return nextDate.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function getAccountSignOutActionCopy(signOutBusy: boolean) {
  return {
    label: signOutBusy ? "Signing Out" : "Sign Out",
  };
}

export default function AccountScreen() {
  const router = useRouter();
  const accountState = useSettingsAccountState({ nativeCheckoutReturnPath: "/account" });
  const achievementSoundsEnabled = useAchievementSoundsEnabled();
  const account = accountState.account;
  const avatar = useSettingsAvatarState({
    authUserUid: accountState.authUserUid,
    authUserEmail: accountState.authUserEmail,
    authIsAnonymous: accountState.authIsAnonymous,
    authHasGoogleProvider: accountState.authHasGoogleProvider,
    authGooglePhotoUrl: accountState.authGooglePhotoUrl,
    setAuthError: accountState.setAuthError,
    setAuthStatus: accountState.setAuthStatus,
  });
  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(avatar.rewardProgress), [avatar.rewardProgress]);
  const avatarUploadInputRef = useRef<HTMLInputElement | null>(null);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [activeRankPromotion, setActiveRankPromotion] = useState<RankPromotion | null>(null);

  useEffect(() => {
    if (!account.showDeleteAccountConfirm) return;
    playDeleteAlertAudio(undefined, { repeatCount: 3 });
  }, [account.showDeleteAccountConfirm]);

  const openRankLadderWithDropdownAudio = useCallback(() => {
    avatar.setShowRankLadderModal(true);
  }, [avatar]);
  const accountProfileReady = account.authProfileReady && avatar.avatarProfileReady && account.authPlanStatus === "confirmed";
  const [hasLoadedAccountProfile, setHasLoadedAccountProfile] = useState(false);
  const shouldRenderAccountProfile = hasLoadedAccountProfile || accountProfileReady;

  useEffect(() => {
    if (!accountProfileReady) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setHasLoadedAccountProfile(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accountProfileReady]);

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

  const handleSignOut = useCallback(async () => {
    if (signOutBusy) return;
    setSignOutBusy(true);
    setSignOutError("");
    try {
      await handleSignOutFlow();
    } catch (error: unknown) {
      setSignOutError(getErrorMessage(error, "Could not sign out."));
      setSignOutBusy(false);
      setShowSignOutConfirm(false);
    }
  }, [signOutBusy]);

  const handleBack = useCallback(() => {
    if (typeof window === "undefined") return;
    const fallbackHref = getAccountBackRoute(document.referrer, window.location.href);
    router.push(fallbackHref);
  }, [router]);

  const profileName = account.authUserAlias || account.authUserEmail?.split("@")[0] || "TaskLaunch User";

  return (
    <div className="wrap" id="app" aria-label="TaskLaunch Account">
      <div className="desktopAppShell">
        <DesktopAppRail activePage="account" useClientNavButtons={false} showMobileFooter={false} />
        <div className="desktopAppMain">
          <div className="list accountPageList">
            <div className="accountSceneBackdrop" aria-hidden="true">
              <div className="accountSceneGlow accountSceneGlowA" />
              <div className="accountSceneGlow accountSceneGlowB" />
            </div>
            <main className="menu accountMenu accountDashboardShell dashboardShell" aria-label="Account">
              <div className="accountDetailPanel dashboardCard">
                {shouldRenderAccountProfile ? (
                <section className="accountProfilePage" aria-label="Account profile">
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
                    {account.authUserAliasEditing ? (
                      <div className="accountProfileAliasSection">
                        <div className="accountProfileAliasContent accountProfileAliasEdit">
                          <input
                            className="accountAliasInput accountProfileAliasInput"
                            type="text"
                            value={account.authUserAliasDraft}
                            onChange={(event) => account.onAliasDraftChange(event.target.value)}
                            disabled={account.authUserAliasBusy}
                            aria-label="Username"
                            maxLength={60}
                            autoFocus
                          />
                          <button className="iconBtn" type="button" onClick={() => void account.onSaveAlias()} disabled={account.authUserAliasBusy} aria-label="Save username">
                            {"\u2713"}
                          </button>
                          <button className="iconBtn" type="button" onClick={account.onCancelAliasEdit} disabled={account.authUserAliasBusy} aria-label="Cancel username edit">
                            {"\u2715"}
                          </button>
                        </div>
                        <div className="accountProfileAliasDivider" aria-hidden="true" />
                      </div>
                    ) : (
                      <div className="accountProfileAliasSection">
                        <h2 className="accountProfileAliasContent">
                          <button
                            className="accountProfileNameButton"
                            type="button"
                            onClick={account.onStartAliasEdit}
                            aria-label="Edit username"
                            title="Edit username"
                          >
                            {profileName}
                          </button>
                        </h2>
                        <div className="accountProfileAliasDivider" aria-hidden="true" />
                      </div>
                    )}
                    <div className="accountProfileIdentity">
                      <div className="settingsAccountProfileRow accountProfileMetaRows">
                        <dl className="settingsAccountIdCardMetaList">
                          <div className="settingsAccountMetaListItem">
                            <dt className="settingsAccountUidLabel">Member Since</dt>
                            <dd className="settingsAccountMemberSinceValue">{formatMemberSinceDate(account.authMemberSince)}</dd>
                          </div>
                          <div className="settingsAccountMetaListItem">
                            <dt className="settingsAccountUidLabel">Email Address</dt>
                            <dd className="settingsAccountEmailValue">{account.authUserEmail || "Signed in account"}</dd>
                          </div>
                          {account.authUserUid ? (
                            <div className="settingsAccountMetaListItem settingsAccountUidListItem">
                              <dt className="settingsAccountUidLabel">UID</dt>
                              <dd className="settingsAccountUserIdValue settingsAccountUserIdWithCopy">
                                <button
                                  className="settingsUidCopyValueBtn"
                                  type="button"
                                  onClick={() => void account.onCopyUid()}
                                  aria-label={account.uidCopyStatus || "Copy UID"}
                                  title={account.uidCopyStatus || "Copy UID"}
                                >
                                  {account.authUserUid}
                                </button>
                              </dd>
                            </div>
                          ) : null}
                          <div className="settingsAccountMetaListItem">
                            <dt className="settingsAccountUidLabel">Plan</dt>
                            <dd className="settingsAccountMemberSinceValue accountProfilePlanRow">
                              <span className={`settingsAccountPlanPill settingsAccountPlanPill-${account.authPlan}`}>
                                {formatAccountPlan(account.authPlan)}
                              </span>
                              {account.authPlan === "plus" ? (
                                <>
                                  <span className="settingsAccountPlanPipe" aria-hidden="true">|</span>
                                  <button className="settingsAccountUpgradeLink" type="button" onClick={() => void account.onOpenPlanAction()}>
                                    Manage Subscription
                                  </button>
                                </>
                              ) : null}
                              {account.authPlan === "free" ? (
                                <>
                                  <span className="settingsAccountPlanPipe" aria-hidden="true">|</span>
                                  <button className="settingsAccountUpgradeLink" type="button" onClick={() => void account.onOpenPlanAction()}>
                                    Upgrade to <strong>PLUS</strong>
                                  </button>
                                </>
                              ) : null}
                            </dd>
                          </div>
                          {account.authPlan === "plus" ? (
                            <div className="settingsAccountMetaListItem">
                              <dt className="settingsAccountUidLabel">Renews On</dt>
                              <dd className="settingsAccountMemberSinceValue">{formatPlanRenewalDate(account.authPlanRenewalAtMs)}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                      <div className="accountProfileActions" role="list" aria-label="Account actions">
                        <button className="accountProfileAction accountProfileActionDanger" type="button" onClick={() => account.setShowDeleteAccountConfirm(true)} disabled={account.authBusy}>
                          <AppImg src="/icons/icons_default/trash.webp" alt="" aria-hidden="true" />
                          <span>
                            <strong>Delete Account</strong>
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="accountProfileStats" aria-label="Account summary">
                    <div>
                      <strong>{formatXp(rewardsHeader.totalXp)}</strong>
                      <span>XP</span>
                    </div>
                    <button type="button" data-rank-ladder-open onClick={openRankLadderWithDropdownAudio} aria-label={`Open rank ladder. Current rank: ${rewardsHeader.rankLabel}`}>
                      <strong className="accountProfileRankText">{rewardsHeader.rankLabel}</strong>
                      <span>Rank</span>
                    </button>
                    <button type="button" data-rank-ladder-open onClick={openRankLadderWithDropdownAudio} aria-label={`Open rank insignia. Current rank: ${rewardsHeader.rankLabel}`}>
                      <RankThumbnail
                        rankId={avatar.rewardProgress.currentRankId}
                        storedThumbnailSrc={avatar.rankThumbnailSrc}
                        className="accountProfileRankInsignia"
                        imageClassName="accountProfileRankInsigniaImage"
                        placeholderClassName="accountProfileRankInsigniaPlaceholder"
                        alt="Rank insignia"
                        size={44}
                      />
                      <span>Badge</span>
                    </button>
                  </div>

                  <div className="accountProfileStatus" aria-live="polite">
                    {account.authStatus ? <div className="accountAuthNotice">{account.authStatus}</div> : null}
                    {account.authError ? <div className="accountAuthError">{account.authError}</div> : null}
                    {avatar.avatarSyncNotice ? (
                      <div className={avatar.avatarSyncNoticeIsError ? "accountAuthError" : "accountAuthNotice"}>{avatar.avatarSyncNotice}</div>
                    ) : null}
                    {signOutError ? <div className="accountAuthError">{signOutError}</div> : null}
                  </div>

                </section>
                ) : (
                  <section className="accountProfilePage accountProfileLoadingPage" aria-label="Loading account profile" aria-busy="true">
                    <div className="accountProfileLoadingState" role="status" aria-live="polite">
                      <div className="accountProfileLoadingAvatar" aria-hidden="true" />
                      <div>
                        <h2>Loading account</h2>
                        <p>Refreshing your profile data...</p>
                      </div>
                    </div>
                  </section>
                )}
                <NativePlusUpsellModal
                  open={account.showNativePlusUpsellModal}
                  busy={account.nativePlusCheckoutBusy}
                  error={account.nativePlusCheckoutError}
                  selectedOffer={account.nativePlusCheckoutOffer}
                  onClose={() => account.setShowNativePlusUpsellModal(false)}
                  onSelectOffer={account.onSelectNativePlusCheckoutOffer}
                  onConfirm={account.onStartNativePlusCheckout}
                />
              </div>
              <div className="accountMobileBackFooter">
                <button className="btn btn-ghost modalPreviewSecondaryAction primitiveSciFiModalAction primitiveSciFiModalSecondaryAction accountProfileBackAction accountPageBackBtn" type="button" onClick={handleBack} aria-label="Go back">
                  Back
                </button>
              </div>
            </main>
          </div>
        </div>
      </div>
      <InlineConfirmModal
        open={account.showDeleteAccountConfirm}
        onClose={() => {
          if (!account.authBusy) account.setShowDeleteAccountConfirm(false);
        }}
        ariaLabel="Delete Account"
        title="Delete Account"
        overlayClassName="standardModalOverlay accountInlineConfirmOverlay deleteAccountConfirmOverlay"
        modalClassName="accountInlineConfirmModal deleteAccountConfirmModal"
        titleClassName="accountInlineConfirmTitle"
        portalToBody
        titleIcon={
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 3.4 21.1 20H2.9L12 3.4Z" />
            <path d="M12 8.6v5.8" />
            <path d="M12 17.4h.01" />
          </svg>
        }
      >
        <p className="accountInlineConfirmText">Delete your sign-in account and all related data? This action is permanent and cannot be undone.</p>
        <DeleteAccountConfirmActions
          className="footerBtns accountInlineConfirmBtns"
          authBusy={account.authBusy}
          onCancel={() => account.setShowDeleteAccountConfirm(false)}
          onDelete={() => void account.onDeleteAccount()}
        />
      </InlineConfirmModal>

      <SignOutConfirmModal
        open={showSignOutConfirm}
        busy={signOutBusy}
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => void handleSignOut()}
      />

      <InlineConfirmModal
        open={avatar.showAvatarPickerModal}
        onClose={() => avatar.setShowAvatarPickerModal(false)}
        ariaLabel="Choose Avatar"
        title="Choose Avatar"
        overlayClassName="standardModalOverlay accountInlineConfirmOverlay"
        modalClassName="accountInlineConfirmModal accountAvatarModal"
        titleClassName="accountInlineConfirmTitle"
      >
        <div className="accountAvatarOptions" role="list" aria-label="Available avatars">
          {avatar.avatarGroups.map((group) => (
            <section key={group.key} className="accountAvatarGroup" aria-label={group.title}>
              <h4 className="accountAvatarGroupTitle">{group.title}</h4>
              <div className="accountAvatarGroupRow" role="list">
                {group.items.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`accountAvatarOption${avatar.selectedAvatarId === option.id ? " isSelected" : ""}`}
                    onClick={() => void avatar.onSelectAvatar(option.id)}
                    aria-pressed={avatar.selectedAvatarId === option.id}
                    title={option.label}
                  >
                    <AppImg src={option.src} alt={option.label} className="accountAvatarOptionImg" referrerPolicy={/^https?:\/\//i.test(option.src) ? "no-referrer" : undefined} />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="footerBtns accountInlineConfirmBtns">
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
        totalXp={rewardsHeader.totalXp}
        rankSummary={avatar.rankLadderSummary}
        currentRankId={avatar.rewardProgress.currentRankId}
        currentRankIndex={avatar.currentRankIndex}
        rankPromotionsById={avatar.rewardProgress.rankPromotionsById}
        rankThumbnailSrc={avatar.rankThumbnailSrc}
        canSelectRankInsignia={avatar.canSelectRankInsignia}
        onSelectRankThumbnail={avatar.onSelectRankThumbnail}
        onTestRankPromotion={(rankId) => {
          const promotion = buildRankPromotionTestPayload(rankId);
          if (!promotion) return;
          avatar.setShowRankLadderModal(false);
          setActiveRankPromotion(promotion);
        }}
      />
      {activeRankPromotion ? (
        <RankPromotionOverlay
          previousRankId={activeRankPromotion.previousRankId}
          previousRankLabel={activeRankPromotion.previousRankLabel}
          nextRankId={activeRankPromotion.nextRankId}
          nextRankLabel={activeRankPromotion.nextRankLabel}
          achievementSoundsEnabled={achievementSoundsEnabled}
          onPresentationStart={() => {
            startRankPromotionCelebration(document);
          }}
          onClose={() => {
            stopRankPromotionCelebration(document);
            setActiveRankPromotion(null);
          }}
        />
      ) : null}
    </div>
  );
}
