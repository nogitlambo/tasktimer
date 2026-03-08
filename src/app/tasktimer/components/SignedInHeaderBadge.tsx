"use client";

import Image from "next/image";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { ensureUserProfileIndex } from "../lib/cloudStore";
import { AVATAR_CATALOG } from "../lib/avatarCatalog";
import { syncOwnFriendshipProfile } from "../lib/friendsStore";
import {
  buildRewardsHeaderViewModel,
  DEFAULT_REWARD_PROGRESS,
  getRankLabelForThumbnailSrc,
  normalizeRewardProgress,
  RANK_LADDER,
  RANK_MODAL_THUMBNAIL_BY_ID,
} from "../lib/rewards";
import { STORAGE_KEY, subscribeCachedPreferences } from "../lib/storage";

type SignedInHeaderBadgeProps = {
  href?: string;
};

const RANK_THUMBNAIL_STORAGE_PREFIX = `${STORAGE_KEY}:rankThumbnail:`;
const RANK_INSIGNIA_ADMIN_UID = "mWN9rMhO4xMq410c4E4VYyThw0x2";
const AVATAR_SELECTION_STORAGE_PREFIX = `${STORAGE_KEY}:avatarSelection:`;
const AVATAR_CUSTOM_STORAGE_PREFIX = `${STORAGE_KEY}:avatarCustom:`;
const ACCOUNT_AVATAR_UPDATED_EVENT = "tasktimer:accountAvatarUpdated";
const AVATAR_SRC_BY_ID = AVATAR_CATALOG.reduce<Record<string, string>>((acc, item) => {
  const id = String(item.id || "").trim();
  const src = String(item.src || "").trim();
  if (id && src) acc[id] = src;
  return acc;
}, {});

function readStoredRankThumbnailSrc(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(`${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`) || "").trim();
}

function readStoredAvatarId(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(`${AVATAR_SELECTION_STORAGE_PREFIX}${uid}`) || "").trim();
}

function readStoredCustomAvatarSrc(uid: string): string {
  if (typeof window === "undefined" || !uid) return "";
  return String(window.localStorage.getItem(`${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}`) || "").trim();
}

function customAvatarIdForUid(uid: string): string {
  return `custom-upload:${uid}`;
}

function googleAvatarIdForUid(uid: string): string {
  return `google/profile-photo:${uid}`;
}

function resolveGooglePhotoUrl(user: User | null | undefined): string {
  const googleProviderProfile = (user?.providerData || []).find(
    (provider) => String(provider?.providerId || "").trim() === "google.com"
  );
  return String(user?.photoURL || googleProviderProfile?.photoURL || "").trim();
}

function resolveAvatarSrc(uid: string, avatarId: string, avatarCustomSrc: string, googlePhotoUrl: string): string {
  const normalizedUid = String(uid || "").trim();
  const normalizedAvatarId = String(avatarId || "").trim();
  const normalizedCustomSrc = String(avatarCustomSrc || "").trim();
  const normalizedGooglePhotoUrl = String(googlePhotoUrl || "").trim();
  if (!normalizedUid) return "";
  if (normalizedAvatarId === customAvatarIdForUid(normalizedUid) && normalizedCustomSrc) return normalizedCustomSrc;
  if (normalizedAvatarId === googleAvatarIdForUid(normalizedUid) && normalizedGooglePhotoUrl) return normalizedGooglePhotoUrl;
  if (normalizedAvatarId && AVATAR_SRC_BY_ID[normalizedAvatarId]) return AVATAR_SRC_BY_ID[normalizedAvatarId];
  if (normalizedCustomSrc) return normalizedCustomSrc;
  if (normalizedGooglePhotoUrl) return normalizedGooglePhotoUrl;
  const cachedAvatarId = readStoredAvatarId(normalizedUid);
  if (cachedAvatarId === customAvatarIdForUid(normalizedUid) && normalizedCustomSrc) return normalizedCustomSrc;
  if (cachedAvatarId === googleAvatarIdForUid(normalizedUid) && normalizedGooglePhotoUrl) return normalizedGooglePhotoUrl;
  if (cachedAvatarId && AVATAR_SRC_BY_ID[cachedAvatarId]) return AVATAR_SRC_BY_ID[cachedAvatarId];
  return AVATAR_CATALOG[0]?.src || "";
}

export default function SignedInHeaderBadge({ href = "/tasktimer/settings?pane=general" }: SignedInHeaderBadgeProps) {
  const [signedInUserLabel, setSignedInUserLabel] = useState<string | null>(null);
  const [signedInUserUid, setSignedInUserUid] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [headerView, setHeaderView] = useState<"welcome" | "xp">("welcome");
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [avatarSrc, setAvatarSrc] = useState("");
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (user) => {
      const displayName = String(user?.displayName || "").trim();
      const email = String(user?.email || "").trim();
      setSignedInUserLabel(displayName || email || null);
      setHeaderView("welcome");
      const uid = String(user?.uid || "").trim();
      setSignedInUserUid(uid);
      const googlePhotoUrl = resolveGooglePhotoUrl(user);
      setAvatarSrc(resolveAvatarSrc(uid, readStoredAvatarId(uid), readStoredCustomAvatarSrc(uid), googlePhotoUrl));
      setRankThumbnailSrc(readStoredRankThumbnailSrc(uid));
      if (!uid) return;
      void ensureUserProfileIndex(uid);
      void (async () => {
        const db = getFirebaseFirestoreClient();
        if (!db) return;
        try {
          const snap = await getDoc(doc(db, "users", uid));
          if (!snap.exists()) return;
          const remoteAvatarId = String(snap.get("avatarId") || "").trim();
          const remoteAvatarCustomSrc = String(snap.get("avatarCustomSrc") || "").trim();
          const remoteThumbnailSrc = String(snap.get("rankThumbnailSrc") || "").trim();
          setAvatarSrc(resolveAvatarSrc(uid, remoteAvatarId, remoteAvatarCustomSrc, googlePhotoUrl));
          if (!remoteThumbnailSrc) return;
          setRankThumbnailSrc(remoteThumbnailSrc);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(`${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`, remoteThumbnailSrc);
          }
        } catch {
          // Ignore header-only rank thumbnail sync failures.
        }
      })();
    });
    const syncAvatarFromStorage = () => {
      const user = auth.currentUser;
      const uid = String(user?.uid || "").trim();
      if (!uid) return;
      setAvatarSrc(resolveAvatarSrc(uid, readStoredAvatarId(uid), readStoredCustomAvatarSrc(uid), resolveGooglePhotoUrl(user)));
      setRankThumbnailSrc(readStoredRankThumbnailSrc(uid));
    };
    const onStorage = (event: StorageEvent) => {
      const user = auth.currentUser;
      const uid = String(user?.uid || "").trim();
      if (!uid || event.storageArea !== window.localStorage) return;
      const key = String(event.key || "");
      if (
        key !== `${AVATAR_SELECTION_STORAGE_PREFIX}${uid}` &&
        key !== `${AVATAR_CUSTOM_STORAGE_PREFIX}${uid}` &&
        key !== `${RANK_THUMBNAIL_STORAGE_PREFIX}${uid}`
      ) {
        return;
      }
      syncAvatarFromStorage();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, syncAvatarFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(ACCOUNT_AVATAR_UPDATED_EVENT, syncAvatarFromStorage);
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!signedInUserLabel) return;
    if (headerView === "xp") return;
    const timer = window.setTimeout(() => {
      setHeaderView("xp");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [headerView, signedInUserLabel]);

  useEffect(() => {
    if (!showRankLadderModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowRankLadderModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRankLadderModal]);

  if (!signedInUserLabel) return null;

  const rewardsHeader = buildRewardsHeaderViewModel(rewardProgress);
  const currentRankIndex = Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === rewardProgress.currentRankId));
  const canSelectRankInsignia = signedInUserUid === RANK_INSIGNIA_ADMIN_UID;
  const displayedRankLabel = getRankLabelForThumbnailSrc(rankThumbnailSrc) || rewardsHeader.rankLabel;
  const headerBadgeLabel =
    headerView === "xp"
      ? `${displayedRankLabel}. ${rewardsHeader.progressLabel}${rewardsHeader.xpToNext != null ? `. ${rewardsHeader.xpToNext} XP to next rank.` : "."}`
      : `Welcome ${signedInUserLabel}`;
  const rankLadderSummary =
    rewardsHeader.xpToNext != null
      ? `${rewardsHeader.xpToNext} XP to reach the next rank.`
      : "You have reached the highest configured rank.";

  const openRankLadderModal = (event: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setShowRankLadderModal(true);
  };

  const handleSelectRankThumbnail = async (rankId: string) => {
    if (!signedInUserUid || signedInUserUid !== RANK_INSIGNIA_ADMIN_UID) return;
    const nextSrc = String(RANK_MODAL_THUMBNAIL_BY_ID[rankId] || "").trim();
    if (!nextSrc) return;
    setRankThumbnailSrc(nextSrc);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${RANK_THUMBNAIL_STORAGE_PREFIX}${signedInUserUid}`, nextSrc);
      window.dispatchEvent(new Event(ACCOUNT_AVATAR_UPDATED_EVENT));
    }
    try {
      const db = getFirebaseFirestoreClient();
      if (db) {
        await setDoc(
          doc(db, "users", signedInUserUid),
          { schemaVersion: 1, updatedAt: serverTimestamp(), rankThumbnailSrc: nextSrc },
          { merge: true }
        );
      }
    } catch {
      // Keep local selection even if cloud sync fails.
    }
    try {
      await syncOwnFriendshipProfile(signedInUserUid, { rankThumbnailSrc: nextSrc });
    } catch {
      // Ignore header-only friendship profile sync failures.
    }
    setShowRankLadderModal(false);
  };

  return (
    <>
      <a
        id="signedInHeaderBadge"
        href={href}
        className={`signedInHeaderBadge${headerView === "xp" ? " isXpView" : ""}`}
        aria-label={headerBadgeLabel}
        title="Open Account settings"
      >
        <span aria-hidden="true" className="signedInHeaderBadgeInitial">
          {avatarSrc ? (
            <Image className="signedInHeaderBadgeAvatar" src={avatarSrc} alt="" width={18} height={18} unoptimized />
          ) : (
            signedInUserLabel.slice(0, 1).toUpperCase()
          )}
        </span>
        {headerView === "xp" && rankThumbnailSrc ? (
          <span
            className="signedInHeaderBadgeInsigniaWrap signedInHeaderBadgeInsigniaTrigger"
            role="button"
            tabIndex={0}
            aria-label="Open rank ladder"
            onClick={openRankLadderModal}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openRankLadderModal(event);
            }}
          >
            <Image className="signedInHeaderBadgeInsignia" src={rankThumbnailSrc} alt="" width={20} height={20} unoptimized />
          </span>
        ) : null}
        <span className="signedInHeaderBadgeBody">
          <span className={`signedInHeaderBadgePane${headerView === "welcome" ? " isOn" : ""}`} title={signedInUserLabel}>
            <span className="signedInHeaderBadgeTitle">Welcome {signedInUserLabel}</span>
          </span>
          <span className={`signedInHeaderBadgePane signedInHeaderBadgePaneXp${headerView === "xp" ? " isOn" : ""}`}>
            <span className="signedInHeaderBadgeXpMeta">
              <span className="signedInHeaderBadgeTitle">
              {displayedRankLabel} - {rewardsHeader.totalXp} XP
              </span>
              <span className="signedInHeaderBadgeMeta">
                {rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to next rank` : "Max rank reached"}
              </span>
            </span>
            <span className="signedInHeaderBadgeTrack" aria-hidden="true">
              <span className="signedInHeaderBadgeFill" style={{ width: `${rewardsHeader.progressPct}%` }} />
            </span>
          </span>
        </span>
      </a>
      {showRankLadderModal ? (
        <div className="overlay" id="rankLadderOverlay" onClick={() => setShowRankLadderModal(false)}>
          <div className="modal rankLadderModal" role="dialog" aria-modal="true" aria-label="Rank ladder" onClick={(event) => event.stopPropagation()}>
            <h2>Rank Ladder</h2>
            <p className="modalSubtext">
              {displayedRankLabel} is your current rank at {rewardsHeader.totalXp} XP. {rankLadderSummary}
            </p>
            {canSelectRankInsignia ? (
              <p className="modalSubtext">Click an insignia thumbnail to use it as your profile rank badge.</p>
            ) : null}
            <div className="rankLadderList" role="list" aria-label="Available ranks">
              {RANK_LADDER.map((rank, index) => {
                const isCurrent = rank.id === rewardProgress.currentRankId;
                const isUnlocked = index <= currentRankIndex;
                const thresholdLabel = Number.isFinite(rank.minXp) ? `${rank.minXp} XP` : "Threshold pending";
                const rankThumbnail = RANK_MODAL_THUMBNAIL_BY_ID[rank.id] || "";
                const isSelectable = canSelectRankInsignia && !!rankThumbnail;
                const isSelectedThumbnail = rankThumbnailSrc === rankThumbnail && !!rankThumbnail;
                const content = (
                  <>
                    <div className="rankLadderItemBadge" aria-hidden="true">
                      {rankThumbnail ? (
                        <Image className="rankLadderItemBadgeImage" src={rankThumbnail} alt="" width={34} height={34} unoptimized />
                      ) : (
                        index === 0 ? "U" : index
                      )}
                    </div>
                    <div className="rankLadderItemBody">
                      <div className="rankLadderItemTitleRow">
                        <span className="rankLadderItemTitle">{rank.label}</span>
                        {isSelectedThumbnail ? <span className="rankLadderItemFlag">Selected</span> : null}
                        {isCurrent ? <span className="rankLadderItemFlag">Current</span> : null}
                        {!isCurrent && isUnlocked ? <span className="rankLadderItemFlag">Unlocked</span> : null}
                      </div>
                      <div className="rankLadderItemMeta">
                        Unlocks at {thresholdLabel}
                        {isSelectable ? " Click to select this insignia." : ""}
                      </div>
                    </div>
                  </>
                );
                if (isSelectable) {
                  return (
                    <button
                      key={rank.id}
                      type="button"
                      className={`rankLadderItem isSelectable${isCurrent ? " isCurrent" : ""}${isUnlocked ? " isUnlocked" : ""}${isSelectedThumbnail ? " isSelectedThumbnail" : ""}`}
                      onClick={() => void handleSelectRankThumbnail(rank.id)}
                    >
                      {content}
                    </button>
                  );
                }
                return (
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
              <button className="btn btn-ghost" type="button" onClick={() => setShowRankLadderModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
