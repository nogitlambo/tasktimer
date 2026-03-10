"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { AVATAR_CATALOG } from "../lib/avatarCatalog";
import {
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  getRankLadderThumbnailSrc,
  normalizeRewardProgress,
} from "../lib/rewards";
import { STORAGE_KEY, subscribeCachedPreferences } from "../lib/storage";

type DesktopRailPage = "dashboard" | "tasks" | "test2" | "settings";

type DesktopAppRailProps = {
  activePage: DesktopRailPage;
  useClientNavButtons?: boolean;
  showDesktopRail?: boolean;
  showMobileFooter?: boolean;
};

type NavItem = {
  page: DesktopRailPage;
  label: string;
  ariaLabel: string;
  iconSrc: string;
  desktopId: string;
  mobileId: string;
  href: string;
};

type DesktopLinkItem = {
  label: string;
  ariaLabel: string;
  iconSrc: string;
  id: string;
  href: string;
};

const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;
const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";
const NAV_ITEMS: NavItem[] = [
  {
    page: "dashboard",
    label: "Dashboard",
    ariaLabel: "Dashboard",
    iconSrc: "/Dashboard.svg",
    desktopId: "commandCenterDashboardBtn",
    mobileId: "footerDashboardBtn",
    href: "/tasktimer/dashboard",
  },
  {
    page: "tasks",
    label: "Tasks",
    ariaLabel: "Tasks",
    iconSrc: "/Task_List.svg",
    desktopId: "commandCenterTasksBtn",
    mobileId: "footerTasksBtn",
    href: "/tasktimer",
  },
  {
    page: "test2",
    label: "Friends",
    ariaLabel: "Friends",
    iconSrc: "/Groups.svg",
    desktopId: "commandCenterGroupsBtn",
    mobileId: "footerTest2Btn",
    href: "/tasktimer/friends",
  },
  {
    page: "settings",
    label: "Settings",
    ariaLabel: "Settings",
    iconSrc: "/Settings.svg",
    desktopId: "commandCenterSettingsBtn",
    mobileId: "footerSettingsBtn",
    href: "/tasktimer/settings",
  },
];

const DESKTOP_SECONDARY_LINKS: DesktopLinkItem[] = [
  {
    label: "Help Center",
    ariaLabel: "Help Center",
    iconSrc: "/User_Guide.svg",
    id: "commandCenterHelpCenterBtn",
    href: "/tasktimer/user-guide",
  },
];

function avatarStorageKeyForUid(uid: string) {
  return `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`;
}

function avatarCustomStorageKeyForUid(uid: string) {
  return `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`;
}

function rankThumbnailStorageKeyForUid(uid: string) {
  return `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`;
}

function customAvatarIdForUid(uid: string) {
  return `custom-upload:${uid}`;
}

function googleAvatarIdForUid(uid: string) {
  return `google/profile-photo:${uid}`;
}

function readStoredAvatarId(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarStorageKeyForUid(uid)) || "").trim();
}

function readStoredCustomAvatarSrc(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(avatarCustomStorageKeyForUid(uid)) || "").trim();
}

function readStoredRankThumbnailSrc(uid: string) {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(rankThumbnailStorageKeyForUid(uid)) || "").trim();
}

function labelFromUser(user: User | null) {
  const displayName = String(user?.displayName || "").trim();
  if (displayName) return displayName;
  const email = String(user?.email || "").trim();
  if (email) return email.split("@")[0] || email;
  return "TaskLaunch User";
}

function resolveAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string) {
  const normalizedAvatarId = String(avatarId || "").trim();
  if (avatarCustomSrc) return avatarCustomSrc;
  if (normalizedAvatarId && normalizedAvatarId === customAvatarIdForUid(uid) && avatarCustomSrc) return avatarCustomSrc;
  if (normalizedAvatarId && normalizedAvatarId === googleAvatarIdForUid(uid) && googlePhotoUrl) return googlePhotoUrl;
  if (normalizedAvatarId) {
    const match = AVATAR_CATALOG.find((avatar) => avatar.id === normalizedAvatarId);
    if (match?.src) return match.src;
  }
  return googlePhotoUrl;
}

function initialsFromLabel(label: string) {
  const parts = String(label || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return "TL";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function renderDesktopNavItem(item: NavItem, activePage: DesktopRailPage, useClientNavButtons: boolean) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small dashboardRailMenuBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
    ...(isActive ? { "aria-current": "page" as const } : {}),
  };

  if (useClientNavButtons && item.page !== "settings") {
    return (
      <button key={item.desktopId} {...commonProps} id={item.desktopId} type="button">
        <img
          className={`dashboardRailMenuIconImage${item.page === "test2" ? " dashboardRailMenuIconImageFriends" : ""}`}
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        <span className="dashboardRailMenuLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a key={item.desktopId} {...commonProps} id={item.desktopId} href={item.href}>
      <img
        className={`dashboardRailMenuIconImage${item.page === "test2" ? " dashboardRailMenuIconImageFriends" : ""}`}
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      <span className="dashboardRailMenuLabel">{item.label}</span>
    </a>
  );
}

function renderDesktopLinkItem(item: DesktopLinkItem) {
  return (
    <a
      key={item.id}
      className="btn btn-ghost small dashboardRailMenuBtn"
      id={item.id}
      href={item.href}
      aria-label={item.ariaLabel}
    >
      <img className="dashboardRailMenuIconImage" src={item.iconSrc} alt="" aria-hidden="true" />
      <span className="dashboardRailMenuLabel">{item.label}</span>
    </a>
  );
}

function isPrimaryDesktopNavItem(item: NavItem) {
  return item.page !== "settings";
}

function isSecondaryDesktopNavItem(item: NavItem) {
  return item.page === "settings";
}

function renderMobileNavItem(item: NavItem, activePage: DesktopRailPage, useClientNavButtons: boolean) {
  const isActive = activePage === item.page;
  const commonProps = {
    className: `btn btn-ghost small appFooterBtn${isActive ? " isOn" : ""}`,
    "aria-label": item.ariaLabel,
  };

  if (useClientNavButtons && item.page !== "settings") {
    return (
      <button key={item.mobileId} {...commonProps} id={item.mobileId} type="button">
        <img
          className={`appFooterIconImage${item.page === "test2" ? " appFooterIconImageFriends" : ""}`}
          src={item.iconSrc}
          alt=""
          aria-hidden="true"
        />
        {item.page === "test2" ? (
          <span
            id="footerTest2AlertBadge"
            className="appFooterAlertBadge"
            aria-live="polite"
            aria-atomic="true"
            style={{ display: "none" }}
          />
        ) : null}
        <span className="appFooterLabel">{item.label}</span>
      </button>
    );
  }

  return (
    <a key={item.mobileId} {...commonProps} id={item.mobileId} href={item.href}>
      <img
        className={`appFooterIconImage${item.page === "test2" ? " appFooterIconImageFriends" : ""}`}
        src={item.iconSrc}
        alt=""
        aria-hidden="true"
      />
      {item.page === "test2" ? (
        <span
          id="footerTest2AlertBadge"
          className="appFooterAlertBadge"
          aria-live="polite"
          aria-atomic="true"
          style={{ display: "none" }}
        />
      ) : null}
      <span className="appFooterLabel">{item.label}</span>
    </a>
  );
}

export default function DesktopAppRail({
  activePage,
  useClientNavButtons = false,
  showDesktopRail = true,
  showMobileFooter = true,
}: DesktopAppRailProps) {
  const [profileLabel, setProfileLabel] = useState("TaskLaunch User");
  const [profileAvatarSrc, setProfileAvatarSrc] = useState("");
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));

  const syncProfileFromUser = useCallback(async (user: User | null) => {
    const uid = String(user?.uid || "").trim();
    const fallbackLabel = labelFromUser(user);
    const googlePhotoUrl = String(user?.photoURL || "").trim();

    if (!uid) {
      setProfileLabel(fallbackLabel);
      setProfileAvatarSrc(googlePhotoUrl);
      setRankThumbnailSrc("");
      return;
    }

    const storedAvatarId = readStoredAvatarId(uid);
    const storedCustomAvatarSrc = readStoredCustomAvatarSrc(uid);
    const storedRankThumbnailSrc = readStoredRankThumbnailSrc(uid);
    setProfileLabel(fallbackLabel);
    setProfileAvatarSrc(resolveAvatarSrc(uid, storedAvatarId, storedCustomAvatarSrc, googlePhotoUrl));
    setRankThumbnailSrc(storedRankThumbnailSrc);

    const db = getFirebaseFirestoreClient();
    if (!db) return;

    try {
      const snap = await getDoc(doc(db, "users", uid));
      if (!snap.exists()) return;
      const alias = String(snap.get("alias") || snap.get("displayName") || "").trim();
      const avatarId = String(snap.get("avatarId") || storedAvatarId).trim();
      const avatarCustomSrc = String(snap.get("avatarCustomSrc") || storedCustomAvatarSrc).trim();
      const remoteRankThumbnailSrc = String(snap.get("rankThumbnailSrc") || storedRankThumbnailSrc).trim();
      setProfileLabel(alias || fallbackLabel);
      setProfileAvatarSrc(resolveAvatarSrc(uid, avatarId, avatarCustomSrc, googlePhotoUrl));
      setRankThumbnailSrc(remoteRankThumbnailSrc);
    } catch {
      // Keep local/auth profile state if user-doc enrichment fails.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void syncProfileFromUser(user);
    });
    const refreshProfile = () => {
      void syncProfileFromUser(auth.currentUser);
    };
    window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
    return () => {
      window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, refreshProfile);
      unsubscribe();
    };
  }, [syncProfileFromUser]);

  const rewardsHeader = useMemo(() => buildRewardsHeaderViewModel(rewardProgress), [rewardProgress]);
  const displayedRankThumbnailSrc = useMemo(
    () => getRankLadderThumbnailSrc(rewardProgress.currentRankId, rankThumbnailSrc),
    [rewardProgress.currentRankId, rankThumbnailSrc]
  );
  const profileInitials = useMemo(() => initialsFromLabel(profileLabel), [profileLabel]);

  return (
    <>
      {showDesktopRail ? (
        <aside className="dashboardRail desktopAppRail" aria-label="TaskLaunch navigation">
          <div className="dashboardRailSectionLabel">Navigation</div>
          <nav className="dashboardRailNav">
            {NAV_ITEMS.filter(isPrimaryDesktopNavItem).map((item) =>
              renderDesktopNavItem(item, activePage, useClientNavButtons)
            )}
          </nav>

          <div className="dashboardRailSectionLabel">Settings</div>
          <nav className="dashboardRailNav">
            {NAV_ITEMS.filter(isSecondaryDesktopNavItem).map((item) =>
              renderDesktopNavItem(item, activePage, useClientNavButtons)
            )}
            {DESKTOP_SECONDARY_LINKS.map((item) => renderDesktopLinkItem(item))}
          </nav>

          <div className="dashboardRailSectionLabel">Profile</div>
          <section className="dashboardCard dashboardProfileCard dashboardRailProfileSummary" aria-label="Profile summary">
            <div className="dashboardProfileHead dashboardRailProfileHead">
              {profileAvatarSrc ? (
                <img className="dashboardAvatarImage dashboardAvatar dashboardRailProfileAvatar" src={profileAvatarSrc} alt="" aria-hidden="true" />
              ) : (
                <div className="dashboardAvatar dashboardRailProfileAvatar">{profileInitials}</div>
              )}
              <div className="dashboardRailProfileIdentity">
                <div className="dashboardProfileName">{profileLabel}</div>
                <div className="dashboardTagRow dashboardRailProfileTags">
                  <a className="dashboardTag dashboardRailProfileTagLink" href="/tasktimer/settings?pane=general">
                    Edit Profile
                  </a>
                </div>
              </div>
              <div className="dashboardRailProfileMetricRank" aria-label={`Rank: ${rewardsHeader.rankLabel}`}>
                {displayedRankThumbnailSrc ? (
                  <img className="dashboardRailRankBadge" src={displayedRankThumbnailSrc} alt="" aria-hidden="true" />
                ) : null}
                <div className="dashboardProfileMeta dashboardRailRankLabel">{rewardsHeader.rankLabel}</div>
              </div>
            </div>
            <div className="dashboardProfileGrid dashboardRailProfileGrid">
              <div className="dashboardProfileMetric dashboardRailProfileXpMetric" aria-label="XP progress">
                <div className="dashboardRailProfileXpHead">
                  <span>XP Progress</span>
                  <strong>{rewardsHeader.totalXp} XP</strong>
                </div>
                <div className="progressTrack dashboardRailProfileXpTrack" aria-hidden="true">
                  <div className="progressFill dashboardRailProfileXpFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
                </div>
                <div className="dashboardRailProfileXpMeta">
                  <span>{rewardsHeader.progressLabel}</span>
                  <span>
                    {rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to next rank` : "Max rank reached"}
                  </span>
                </div>
              </div>
            </div>
          </section>

        </aside>
      ) : null}

      {showMobileFooter ? (
        <div className="appFooterNav" aria-label="App pages">
          {NAV_ITEMS.map((item) => renderMobileNavItem(item, activePage, useClientNavButtons))}
        </div>
      ) : null}
    </>
  );
}
