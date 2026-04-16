import type { FriendProfile } from "../lib/friendsStore";

type FriendAvatarEnvironment = {
  exportBasePath: string;
  isNativeRuntime: boolean;
  locationPathname: string;
  locationProtocol: string;
};

type FriendAvatarResolverOptions = {
  avatarSrcById: Record<string, string>;
  defaultFriendAvatarSrc: string;
  env: FriendAvatarEnvironment;
};

export function buildFriendAvatarSrcMap(items: Array<{ id?: unknown; src?: unknown }>) {
  return items.reduce<Record<string, string>>((acc, item) => {
    const key = String(item?.id || "").trim();
    const value = String(item?.src || "").trim();
    if (key && value) acc[key] = value;
    return acc;
  }, {});
}

export function normalizeFriendAvatarSrc(src: string, env: FriendAvatarEnvironment): string {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^(?:data:|blob:|https?:\/\/|file:)/i.test(value)) return value;
  const normalizedValue = value.replace(/^\/tasklaunch(?=\/avatars\/)/i, "");
  if (/^avatars\//i.test(normalizedValue)) return `/${normalizedValue}`;
  if (/^\/avatars\//i.test(normalizedValue)) {
    const usesExportedHtmlPaths =
      env.locationProtocol === "file:" || /\.html$/i.test(env.locationPathname || "") || env.isNativeRuntime;
    return usesExportedHtmlPaths ? `${env.exportBasePath}${normalizedValue}` : normalizedValue;
  }
  if (/^[^/].+\.(?:svg|png|jpe?g|webp|gif)$/i.test(normalizedValue)) return `/${normalizedValue}`;
  return normalizedValue;
}

export function isGoogleProfileAvatarId(avatarIdRaw: string): boolean {
  return /^google\/profile-photo:/i.test(String(avatarIdRaw || "").trim());
}

export function buildFriendInitialAvatarDataUrl(labelRaw: string): string {
  const label = String(labelRaw || "").trim();
  const initial = (label.charAt(0) || "?").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0f1720"/><rect x="1.5" y="1.5" width="61" height="61" fill="none" stroke="#79e2ff" stroke-opacity=".4" stroke-width="1.5"/><text x="32" y="39" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#eaf7ff">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function getFriendAvatarSrcById(avatarIdRaw: string, options: FriendAvatarResolverOptions): string {
  const avatarId = String(avatarIdRaw || "").trim();
  if (!avatarId) return normalizeFriendAvatarSrc(options.defaultFriendAvatarSrc, options.env);
  const knownSrc = options.avatarSrcById[avatarId];
  if (knownSrc) return normalizeFriendAvatarSrc(knownSrc, options.env);
  if (/^(?:data:|blob:|https?:\/\/|file:)/i.test(avatarId) || /^\/(?:tasklaunch\/)?avatars\//i.test(avatarId)) {
    return normalizeFriendAvatarSrc(avatarId, options.env);
  }
  return normalizeFriendAvatarSrc(options.defaultFriendAvatarSrc, options.env);
}

export function getMergedFriendProfile(
  friendUid: string,
  baseProfile: FriendProfile | null | undefined,
  friendProfileCacheByUid: Record<string, FriendProfile | null | undefined>
): FriendProfile {
  const cachedProfile = friendProfileCacheByUid[String(friendUid || "").trim()] || null;
  return {
    alias: cachedProfile?.alias ?? baseProfile?.alias ?? null,
    avatarId: cachedProfile?.avatarId ?? baseProfile?.avatarId ?? null,
    avatarCustomSrc: cachedProfile?.avatarCustomSrc ?? baseProfile?.avatarCustomSrc ?? null,
    googlePhotoUrl: cachedProfile?.googlePhotoUrl ?? baseProfile?.googlePhotoUrl ?? null,
    rankThumbnailSrc: cachedProfile?.rankThumbnailSrc ?? baseProfile?.rankThumbnailSrc ?? null,
    currentRankId: cachedProfile?.currentRankId ?? baseProfile?.currentRankId ?? null,
  };
}

export function getFriendAvatarImageSrc(profile: FriendProfile | null | undefined, options: FriendAvatarResolverOptions): string {
  const customSrc = String(profile?.avatarCustomSrc || "").trim();
  if (customSrc) return normalizeFriendAvatarSrc(customSrc, options.env);
  const avatarId = String(profile?.avatarId || "").trim();
  if (!avatarId) return "";
  if (isGoogleProfileAvatarId(avatarId)) {
    const googlePhotoUrl = String(profile?.googlePhotoUrl || "").trim();
    return googlePhotoUrl ? normalizeFriendAvatarSrc(googlePhotoUrl, options.env) : "";
  }
  const resolved = getFriendAvatarSrcById(avatarId, options);
  return resolved === normalizeFriendAvatarSrc(options.defaultFriendAvatarSrc, options.env) ? "" : resolved;
}

export function getFriendAvatarSrc(profile: FriendProfile | null | undefined, options: FriendAvatarResolverOptions): string {
  const resolved = getFriendAvatarImageSrc(profile, options);
  return resolved || buildFriendInitialAvatarDataUrl(String(profile?.alias || ""));
}
