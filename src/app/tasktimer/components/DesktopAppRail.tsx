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
};

const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;
const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";

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

function emailFromUser(user: User | null) {
  return String(user?.email || "").trim();
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

export default function DesktopAppRail({ activePage, useClientNavButtons = false }: DesktopAppRailProps) {
  const [profileLabel, setProfileLabel] = useState("TaskLaunch User");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAvatarSrc, setProfileAvatarSrc] = useState("");
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));

  const syncProfileFromUser = useCallback(async (user: User | null) => {
    const uid = String(user?.uid || "").trim();
    const fallbackLabel = labelFromUser(user);
    const fallbackEmail = emailFromUser(user);
    const googlePhotoUrl = String(user?.photoURL || "").trim();

    if (!uid) {
      setProfileLabel(fallbackLabel);
      setProfileEmail(fallbackEmail);
      setProfileAvatarSrc(googlePhotoUrl);
      setRankThumbnailSrc("");
      return;
    }

    const storedAvatarId = readStoredAvatarId(uid);
    const storedCustomAvatarSrc = readStoredCustomAvatarSrc(uid);
    const storedRankThumbnailSrc = readStoredRankThumbnailSrc(uid);
    setProfileLabel(fallbackLabel);
    setProfileEmail(fallbackEmail);
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
      setProfileEmail(fallbackEmail);
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
    <aside className="dashboardRail desktopAppRail" aria-label="TaskLaunch navigation">
      <div className="dashboardRailSectionLabel">Navigation</div>
      <nav className="dashboardRailNav">
        {useClientNavButtons ? (
          <>
            <button
              className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "dashboard" ? " isOn" : ""}`}
              id="commandCenterDashboardBtn"
              type="button"
              aria-label="Dashboard"
              aria-current={activePage === "dashboard" ? "page" : undefined}
            >
              <img className="dashboardRailMenuIconImage" src="/Dashboard.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Dashboard</span>
            </button>
            <button
              className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "tasks" ? " isOn" : ""}`}
              id="commandCenterTasksBtn"
              type="button"
              aria-label="Tasks"
            >
              <img className="dashboardRailMenuIconImage" src="/Task_List.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Tasks</span>
            </button>
            <button
              className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "test2" ? " isOn" : ""}`}
              id="commandCenterGroupsBtn"
              type="button"
              aria-label="Groups"
            >
              <img className="dashboardRailMenuIconImage" src="/Groups.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Groups</span>
            </button>
            <a className="btn btn-ghost small dashboardRailMenuBtn" id="commandCenterSettingsBtn" href="/tasktimer/settings" aria-label="Settings">
              <img className="dashboardRailMenuIconImage" src="/Settings.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Settings</span>
            </a>
          </>
        ) : (
          <>
            <a
              className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "dashboard" ? " isOn" : ""}`}
              href="/tasktimer/dashboard"
              aria-label="Dashboard"
              aria-current={activePage === "dashboard" ? "page" : undefined}
            >
              <img className="dashboardRailMenuIconImage" src="/Dashboard.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Dashboard</span>
            </a>
            <a className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "tasks" ? " isOn" : ""}`} href="/tasktimer" aria-label="Tasks">
              <img className="dashboardRailMenuIconImage" src="/Task_List.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Tasks</span>
            </a>
            <a className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "test2" ? " isOn" : ""}`} href="/tasktimer/friends" aria-label="Groups">
              <img className="dashboardRailMenuIconImage" src="/Groups.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Groups</span>
            </a>
            <a
              className={`btn btn-ghost small dashboardRailMenuBtn${activePage === "settings" ? " isOn" : ""}`}
              href="/tasktimer/settings"
              aria-label="Settings"
              aria-current={activePage === "settings" ? "page" : undefined}
            >
              <img className="dashboardRailMenuIconImage" src="/Settings.svg" alt="" aria-hidden="true" />
              <span className="dashboardRailMenuLabel">Settings</span>
            </a>
          </>
        )}
      </nav>

      <div className="dashboardRailSectionLabel">Profile</div>
      <div className="dashboardRailStatusCard">
        <div className="dashboardRailStatusHeader">
          {profileAvatarSrc ? (
            <img className="dashboardAvatarImage dashboardAvatarSmall" src={profileAvatarSrc} alt="" aria-hidden="true" />
          ) : (
            <div className="dashboardAvatar dashboardAvatarSmall">{profileInitials}</div>
          )}
          <div className="dashboardRailStatusIdentity">
            <div className="dashboardRailStatusName">{profileLabel}</div>
            <div className="dashboardRailStatusMeta">{profileEmail || "Signed in account"}</div>
          </div>
        </div>
        <div className="dashboardRailStatusMetric dashboardRailRankMetric">
          <span className="dashboardRailStatusLabel">Rank</span>
          <div className="dashboardRailRankRow">
            {displayedRankThumbnailSrc ? (
              <img className="dashboardRailRankBadge" src={displayedRankThumbnailSrc} alt="" aria-hidden="true" />
            ) : null}
            <strong>{rewardsHeader.rankLabel}</strong>
          </div>
        </div>
      </div>

      <div className="dashboardRailPromo">
        <span className="dashboardRailPromoBadge">Pro</span>
        <h3>Upgrade your mission panel</h3>
        <p>Unlock more visual modules and deeper reporting without changing your current workflow.</p>
        <button className="btn btn-accent" type="button">Get Pro Plan</button>
      </div>
    </aside>
  );
}
