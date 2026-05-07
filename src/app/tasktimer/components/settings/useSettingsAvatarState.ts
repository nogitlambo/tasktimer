"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDoc } from "firebase/firestore";
import { AVATAR_CATALOG, type AvatarOption } from "@/app/tasktimer/lib/avatarCatalog";
import {
  isAdminAccountEmail,
  buildRewardProgressForRankSelection,
  DEFAULT_REWARD_PROGRESS,
  RANK_LADDER,
  RANK_MODAL_THUMBNAIL_BY_ID,
  normalizeRewardProgress,
} from "@/app/tasktimer/lib/rewards";
import { syncOwnFriendshipProfile } from "@/app/tasktimer/lib/friendsStore";
import { createTaskTimerWorkspaceRepository } from "@/app/tasktimer/lib/workspaceRepository";
import {
  appendStoredCustomAvatarUpload,
  customAvatarIdForUid,
  customAvatarUploadIdForUid,
  findStoredCustomAvatarUploadSrc,
  googleAvatarIdForUid,
  isCustomAvatarIdForUid,
  migrateStoredCustomAvatarSrcToUploads,
  notifyAccountAvatarUpdated,
  readStoredAvatarId,
  readStoredCustomAvatarSrc,
  readStoredCustomAvatarUploads,
  readStoredRankThumbnailSrc,
  type StoredCustomAvatarUpload,
  writeStoredAvatarId,
  writeStoredCustomAvatarSrc,
  writeStoredRankThumbnailSrc,
} from "@/app/tasktimer/lib/accountProfileStorage";
import { getErrorMessage, saveUserDocPatch, userDocRef } from "./settingsAccountService";
import { saveRewardProgressToPreferences } from "./settingsPreferencesBridge";
import type { SettingsAvatarGroup, SettingsAvatarViewModel } from "./types";

const workspaceRepository = createTaskTimerWorkspaceRepository();

export function buildSettingsAvatarOptions({
  authUserUid,
  authHasGoogleProvider,
  authGooglePhotoUrl,
  customAvatarUploads,
}: {
  authUserUid: string | null;
  authHasGoogleProvider: boolean;
  authGooglePhotoUrl: string | null;
  customAvatarUploads: StoredCustomAvatarUpload[];
}): AvatarOption[] {
  if (!authUserUid) return AVATAR_CATALOG.slice();
  const nextOptions = AVATAR_CATALOG.slice();
  if (authHasGoogleProvider && authGooglePhotoUrl) {
    nextOptions.push({ id: googleAvatarIdForUid(authUserUid), label: "Google Profile Photo", src: authGooglePhotoUrl });
  }
  for (const upload of customAvatarUploads) {
    nextOptions.push({ id: upload.id, label: upload.label, src: upload.src });
  }
  return nextOptions;
}

export function resolveSelectedCustomAvatarSrc(uid: string, avatarId: string): string {
  return findStoredCustomAvatarUploadSrc(uid, avatarId) || (avatarId === customAvatarIdForUid(uid) ? readStoredCustomAvatarSrc(uid) : "");
}

export function useSettingsAvatarState({
  authUserUid,
  authUserEmail,
  authHasGoogleProvider,
  authGooglePhotoUrl,
  setAuthError,
  setAuthStatus,
}: {
  authUserUid: string | null;
  authUserEmail: string | null;
  authHasGoogleProvider: boolean;
  authGooglePhotoUrl: string | null;
  setAuthError: (value: string) => void;
  setAuthStatus: (value: string) => void;
}): SettingsAvatarViewModel {
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(AVATAR_CATALOG[0]?.id || "");
  const [avatarSyncNotice, setAvatarSyncNotice] = useState("");
  const [avatarSyncNoticeIsError, setAvatarSyncNoticeIsError] = useState(false);
  const [showAvatarPickerModal, setShowAvatarPickerModal] = useState(false);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [rankThumbnailSrc, setRankThumbnailSrc] = useState("");
  const [rewardProgress, setRewardProgress] = useState(() => normalizeRewardProgress(DEFAULT_REWARD_PROGRESS));
  const [customAvatarUploads, setCustomAvatarUploads] = useState<StoredCustomAvatarUpload[]>([]);
  const avatarSyncNoticeTimerRef = useRef<number | null>(null);

  const showAvatarSyncNotice = useCallback((message: string, isError = false) => {
    setAvatarSyncNotice(message);
    setAvatarSyncNoticeIsError(isError);
    if (typeof window === "undefined") return;
    if (avatarSyncNoticeTimerRef.current != null) window.clearTimeout(avatarSyncNoticeTimerRef.current);
    avatarSyncNoticeTimerRef.current = window.setTimeout(() => {
      setAvatarSyncNotice("");
      setAvatarSyncNoticeIsError(false);
      avatarSyncNoticeTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(() => {
    const unsubscribe = workspaceRepository.subscribeCachedPreferences((prefs) => {
      setRewardProgress(normalizeRewardProgress(prefs?.rewards || DEFAULT_REWARD_PROGRESS));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUserUid) return;
    void syncOwnFriendshipProfile(authUserUid, { currentRankId: rewardProgress.currentRankId, totalXp: rewardProgress.totalXp }).catch(() => {});
  }, [authUserUid, rewardProgress.currentRankId, rewardProgress.totalXp]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setCustomAvatarUploads(authUserUid ? migrateStoredCustomAvatarSrcToUploads(authUserUid) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [authUserUid]);

  const avatarOptions = useMemo(() => {
    return buildSettingsAvatarOptions({ authUserUid, authHasGoogleProvider, authGooglePhotoUrl, customAvatarUploads });
  }, [authGooglePhotoUrl, authHasGoogleProvider, authUserUid, customAvatarUploads]);

  useEffect(() => {
    if (!authUserUid) return;

    let cancelled = false;
    const loadAvatar = async () => {
      const cachedAvatarId = readStoredAvatarId(authUserUid);
      if (cachedAvatarId && avatarOptions.some((avatar) => avatar.id === cachedAvatarId) && !cancelled) {
        setSelectedAvatarId(cachedAvatarId);
      }

      const ref = userDocRef(authUserUid);
      if (!ref) {
        if (!cancelled) {
          const fallbackAvatarId = avatarOptions.some((avatar) => avatar.id === cachedAvatarId) ? cachedAvatarId : avatarOptions[0]?.id || "";
          setSelectedAvatarId(fallbackAvatarId);
        }
        return;
      }

      const snapshot = await getDoc(ref);
      const savedAvatarId = snapshot.exists() ? String(snapshot.get("avatarId") || "") : "";
      const savedCustomSrc = snapshot.exists() ? String(snapshot.get("avatarCustomSrc") || "").trim() : "";
      const savedRankThumbnail = snapshot.exists() ? String(snapshot.get("rankThumbnailSrc") || "").trim() : "";
      const customAvatarId = customAvatarIdForUid(authUserUid);
      const cachedCustomSrc = readStoredCustomAvatarSrc(authUserUid);
      let nextCustomAvatarUploads = readStoredCustomAvatarUploads(authUserUid);
      const cachedRankThumbnail = readStoredRankThumbnailSrc(authUserUid);

      if (savedCustomSrc) {
        writeStoredCustomAvatarSrc(authUserUid, savedCustomSrc);
        const savedCustomId = isCustomAvatarIdForUid(authUserUid, savedAvatarId) ? savedAvatarId : customAvatarId;
        if (!nextCustomAvatarUploads.some((upload) => upload.id === savedCustomId || upload.src === savedCustomSrc)) {
          nextCustomAvatarUploads = appendStoredCustomAvatarUpload(authUserUid, {
            id: savedCustomId,
            src: savedCustomSrc,
            label: nextCustomAvatarUploads.length ? `Custom Upload ${nextCustomAvatarUploads.length + 1}` : "Custom Upload 1",
            createdAt: Date.now(),
          });
        }
      } else if (cachedCustomSrc) {
        await saveUserDocPatch(authUserUid, { avatarCustomSrc: cachedCustomSrc });
      }
      nextCustomAvatarUploads = migrateStoredCustomAvatarSrcToUploads(authUserUid);

      const validSavedAvatarId =
        avatarOptions.some((avatar) => avatar.id === savedAvatarId) ||
        (isCustomAvatarIdForUid(authUserUid, savedAvatarId) && (savedCustomSrc || findStoredCustomAvatarUploadSrc(authUserUid, savedAvatarId)))
          ? savedAvatarId
          : "";
      const validCachedAvatarId =
        avatarOptions.some((avatar) => avatar.id === cachedAvatarId) ||
        (isCustomAvatarIdForUid(authUserUid, cachedAvatarId) && findStoredCustomAvatarUploadSrc(authUserUid, cachedAvatarId))
          ? cachedAvatarId
          : "";
      const nextAvatarId = validSavedAvatarId || validCachedAvatarId || avatarOptions[0]?.id || "";
      const nextRankThumbnail = savedRankThumbnail || cachedRankThumbnail;

      if (validSavedAvatarId) writeStoredAvatarId(authUserUid, validSavedAvatarId);
      else if (validCachedAvatarId) await saveUserDocPatch(authUserUid, { avatarId: validCachedAvatarId });

      if (savedRankThumbnail) writeStoredRankThumbnailSrc(authUserUid, savedRankThumbnail);
      else if (cachedRankThumbnail) await saveUserDocPatch(authUserUid, { rankThumbnailSrc: cachedRankThumbnail });

      if (!cancelled) {
        setCustomAvatarUploads(nextCustomAvatarUploads);
        setSelectedAvatarId(nextAvatarId);
        setRankThumbnailSrc(nextRankThumbnail);
      }
    };

    void loadAvatar().catch(() => {
      if (cancelled) return;
      const cachedAvatarId = readStoredAvatarId(authUserUid);
      const fallbackAvatarId = avatarOptions.some((avatar) => avatar.id === cachedAvatarId) ? cachedAvatarId : avatarOptions[0]?.id || "";
      setSelectedAvatarId(fallbackAvatarId);
    });

    return () => {
      cancelled = true;
    };
  }, [authUserUid, avatarOptions]);

  useEffect(() => {
    if (!showAvatarPickerModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowAvatarPickerModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAvatarPickerModal]);

  useEffect(() => {
    if (!showRankLadderModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowRankLadderModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRankLadderModal]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && avatarSyncNoticeTimerRef.current != null) {
        window.clearTimeout(avatarSyncNoticeTimerRef.current);
      }
    };
  }, []);

  const avatarGroups = useMemo<SettingsAvatarGroup[]>(() => {
    const groups = new Map<string, AvatarOption[]>();
    for (const avatar of avatarOptions) {
      const normalizedId = String(avatar.id || "").replace(/\\/g, "/");
      const isCustomUpload = normalizedId.startsWith("custom-upload:");
      const parts = normalizedId.split("/");
      const folder = isCustomUpload ? "uploads" : parts.length > 1 ? parts[parts.length - 2] || "misc" : "misc";
      const key = folder.trim() || "misc";
      const existing = groups.get(key);
      if (existing) existing.push(avatar);
      else groups.set(key, [avatar]);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({
        key,
        title: key.replace(/[-_]+/g, " ").trim().toUpperCase(),
        items: items.slice().sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [avatarOptions]);

  const effectiveSelectedAvatarId = authUserUid ? selectedAvatarId : avatarOptions[0]?.id || "";
  const selectedAvatar = avatarOptions.find((avatar) => avatar.id === effectiveSelectedAvatarId) || avatarOptions[0] || null;
  const currentRankIndex = useMemo(() => Math.max(0, RANK_LADDER.findIndex((rank) => rank.id === rewardProgress.currentRankId)), [rewardProgress.currentRankId]);
  const canSelectRankInsignia = isAdminAccountEmail(authUserEmail);
  const rewardsHeader = useMemo(() => {
    const currentRank = RANK_LADDER.find((rank) => rank.id === rewardProgress.currentRankId);
    const nextRank = RANK_LADDER.find((rank) => rank.minXp > rewardProgress.totalXp);
    return {
      rankLabel: currentRank?.label || rewardProgress.currentRankId,
      xpToNext: nextRank ? Math.max(0, nextRank.minXp - rewardProgress.totalXp) : null,
    };
  }, [rewardProgress.currentRankId, rewardProgress.totalXp]);
  const displayedRankLabel = rewardsHeader.rankLabel;
  const rankLadderSummary =
    rewardsHeader.xpToNext != null ? `${rewardsHeader.xpToNext} XP to reach the next rank.` : "You have reached the highest configured rank.";

  const onSelectRankThumbnail = useCallback(
    async (rankId: string) => {
      if (!authUserUid || !isAdminAccountEmail(authUserEmail)) return;
      const nextRewards = buildRewardProgressForRankSelection(rewardProgress, rankId);
      const nextThumbnailSrc = String(RANK_MODAL_THUMBNAIL_BY_ID[rankId] || "").trim();
      setRankThumbnailSrc(nextThumbnailSrc);
      setRewardProgress(nextRewards);
      writeStoredRankThumbnailSrc(authUserUid, nextThumbnailSrc);
      saveRewardProgressToPreferences(nextRewards);
      try {
        await saveUserDocPatch(authUserUid, { rankThumbnailSrc: nextThumbnailSrc || null });
        void syncOwnFriendshipProfile(authUserUid, {
          rankThumbnailSrc: nextThumbnailSrc || null,
          currentRankId: nextRewards.currentRankId,
          totalXp: nextRewards.totalXp,
        }).catch(() => {});
      } catch {
        // ignore rank thumbnail save failures from the settings surface
      }
    },
    [authUserEmail, authUserUid, rewardProgress],
  );

  const onSelectAvatar = useCallback(
    async (avatarId: string) => {
      setSelectedAvatarId(avatarId);
      if (!authUserUid) {
        setAuthError("Sign in is required to save avatar selection.");
        setAuthStatus("");
        return;
      }
      const googleAvatarId = googleAvatarIdForUid(authUserUid);
      const isCustomAvatar = isCustomAvatarIdForUid(authUserUid, avatarId);
      const isGoogleAvatar = avatarId === googleAvatarId;
      const customAvatarSrc = resolveSelectedCustomAvatarSrc(authUserUid, avatarId);
      const patch: Record<string, unknown> = {
        avatarId,
        avatarCustomSrc: isCustomAvatar ? customAvatarSrc || null : null,
        googlePhotoUrl: authHasGoogleProvider ? authGooglePhotoUrl || null : null,
      };
      if (isCustomAvatar) writeStoredCustomAvatarSrc(authUserUid, customAvatarSrc);
      writeStoredAvatarId(authUserUid, avatarId);
      setAuthError("");
      try {
        await saveUserDocPatch(authUserUid, patch);
        await syncOwnFriendshipProfile(authUserUid, {
          avatarId,
          avatarCustomSrc: isCustomAvatar ? customAvatarSrc || null : null,
          googlePhotoUrl: isGoogleAvatar ? authGooglePhotoUrl || null : null,
        });
        notifyAccountAvatarUpdated();
        showAvatarSyncNotice("Avatar saved.");
      } catch (err: unknown) {
        notifyAccountAvatarUpdated();
        setAuthError(getErrorMessage(err, "Could not save avatar selection to cloud."));
        setAuthStatus("");
        showAvatarSyncNotice("Avatar saved locally. Cloud sync failed.", true);
      }
      setShowAvatarPickerModal(false);
    },
    [authGooglePhotoUrl, authHasGoogleProvider, authUserUid, setAuthError, setAuthStatus, showAvatarSyncNotice],
  );

  const onUploadAvatar = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!authUserUid) {
        setAuthError("Sign in is required to upload an avatar.");
        setAuthStatus("");
        return;
      }
      if (!file.type.startsWith("image/")) {
        setAuthError("Please choose an image file.");
        setAuthStatus("");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setAuthError("Image is too large. Max size is 2MB.");
        setAuthStatus("");
        return;
      }
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read selected image."));
        reader.readAsDataURL(file);
      });
      if (!dataUrl) {
        setAuthError("Could not read selected image.");
        setAuthStatus("");
        return;
      }
      let createdAt = Date.now();
      const existingUploads = readStoredCustomAvatarUploads(authUserUid);
      while (existingUploads.some((upload) => upload.id === customAvatarUploadIdForUid(authUserUid, createdAt))) createdAt += 1;
      const customAvatarId = customAvatarUploadIdForUid(authUserUid, createdAt);
      const nextCustomAvatarUploads = appendStoredCustomAvatarUpload(authUserUid, {
        id: customAvatarId,
        src: dataUrl,
        label: `Custom Upload ${existingUploads.length + 1}`,
        createdAt,
      });
      setCustomAvatarUploads(nextCustomAvatarUploads);
      setSelectedAvatarId(customAvatarId);
      writeStoredCustomAvatarSrc(authUserUid, dataUrl);
      writeStoredAvatarId(authUserUid, customAvatarId);
      setAuthError("");
      try {
        await saveUserDocPatch(authUserUid, { avatarId: customAvatarId, avatarCustomSrc: dataUrl });
        await syncOwnFriendshipProfile(authUserUid, { avatarId: customAvatarId, avatarCustomSrc: dataUrl });
        notifyAccountAvatarUpdated();
        showAvatarSyncNotice("Avatar uploaded.");
      } catch (err: unknown) {
        notifyAccountAvatarUpdated();
        setAuthError(getErrorMessage(err, "Could not save uploaded avatar selection to cloud."));
        setAuthStatus("");
        showAvatarSyncNotice("Avatar uploaded locally. Cloud sync failed.", true);
      }
      setShowAvatarPickerModal(false);
    },
    [authUserUid, setAuthError, setAuthStatus, showAvatarSyncNotice],
  );

  return {
    avatarOptions,
    avatarGroups,
    selectedAvatarId: effectiveSelectedAvatarId,
    selectedAvatar,
    avatarSyncNotice,
    avatarSyncNoticeIsError,
    showAvatarPickerModal,
    setShowAvatarPickerModal,
    showRankLadderModal,
    setShowRankLadderModal,
    rankThumbnailSrc: authUserUid ? rankThumbnailSrc : "",
    rewardProgress,
    displayedRankLabel,
    rankLadderSummary,
    currentRankIndex,
    canSelectRankInsignia,
    onSelectAvatar,
    onUploadAvatar,
    onSelectRankThumbnail,
  };
}
