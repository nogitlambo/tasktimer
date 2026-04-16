import { describe, expect, it } from "vitest";

import {
  buildFriendAvatarSrcMap,
  getFriendAvatarSrc,
  getFriendAvatarSrcById,
  getMergedFriendProfile,
  normalizeFriendAvatarSrc,
} from "./friend-avatar";

const env = {
  exportBasePath: "/tasklaunch",
  isNativeRuntime: false,
  locationPathname: "/tasklaunch",
  locationProtocol: "https:",
};

const options = {
  avatarSrcById: buildFriendAvatarSrcMap([{ id: "alpha", src: "/avatars/alpha.svg" }]),
  defaultFriendAvatarSrc: "/avatars/default.svg",
  env,
};

describe("friend-avatar", () => {
  it("normalizes local avatar paths for web and exported runtime variants", () => {
    expect(normalizeFriendAvatarSrc("/avatars/alpha.svg", env)).toBe("/avatars/alpha.svg");
    expect(
      normalizeFriendAvatarSrc("/avatars/alpha.svg", {
        ...env,
        locationProtocol: "file:",
      })
    ).toBe("/tasklaunch/avatars/alpha.svg");
  });

  it("resolves catalog avatars and falls back to generated initials", () => {
    expect(getFriendAvatarSrcById("alpha", options)).toBe("/avatars/alpha.svg");
    expect(
      getFriendAvatarSrc({
        alias: "Avery",
        avatarId: null,
        avatarCustomSrc: null,
        googlePhotoUrl: null,
        rankThumbnailSrc: null,
        currentRankId: null,
      }, options)
    ).toMatch(/^data:image\/svg\+xml/);
  });

  it("merges cached profile values over the base profile", () => {
    const merged = getMergedFriendProfile(
      "friend-1",
      {
        alias: "Base",
        avatarId: "alpha",
        avatarCustomSrc: null,
        googlePhotoUrl: null,
        rankThumbnailSrc: null,
        currentRankId: null,
      },
      {
        "friend-1": {
          alias: "Cached",
          avatarId: null,
          avatarCustomSrc: "https://example.com/avatar.png",
          googlePhotoUrl: null,
          rankThumbnailSrc: null,
          currentRankId: null,
        },
      }
    );

    expect(merged.alias).toBe("Cached");
    expect(merged.avatarCustomSrc).toBe("https://example.com/avatar.png");
    expect(merged.avatarId).toBe("alpha");
  });
});
