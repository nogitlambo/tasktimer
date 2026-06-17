import { describe, expect, it } from "vitest";

import { getFriendAvatarSrcById, normalizeFriendAvatarSrc } from "./friend-avatar";

const env = {
  exportBasePath: "/tasklaunch",
  isNativeRuntime: false,
  locationPathname: "/dashboard",
  locationProtocol: "https:",
};

describe("normalizeFriendAvatarSrc", () => {
  it("maps legacy direct bundled avatar file paths to WebP", () => {
    expect(normalizeFriendAvatarSrc("/avatars/toons/toon-01-cap-glasses.svg", env)).toBe("/avatars/toons/toon-01-cap-glasses.webp");
    expect(normalizeFriendAvatarSrc("/tasklaunch/avatars/toons/Bugs-Bunny.jpg", env)).toBe("/avatars/toons/Bugs-Bunny.webp");
    expect(normalizeFriendAvatarSrc("avatars/toons/Close-up-Taz.gif", env)).toBe("/avatars/toons/Close-up-Taz.webp");
    expect(normalizeFriendAvatarSrc("/avatars/bottts/bottts-1.svg", env)).toBe("/avatars/bottts/bottts-1.webp");
    expect(normalizeFriendAvatarSrc("/tasklaunch/avatars/action-heroes/bruce-lee.svg", env)).toBe("/avatars/action-heroes/bruce-lee.webp");
  });

  it("keeps extensionless catalog IDs and non-bundled avatar paths unchanged", () => {
    expect(normalizeFriendAvatarSrc("toons/toon-01-cap-glasses", env)).toBe("toons/toon-01-cap-glasses");
    expect(normalizeFriendAvatarSrc("bottts/bottts-1", env)).toBe("bottts/bottts-1");
    expect(normalizeFriendAvatarSrc("action-heroes/bruce-lee", env)).toBe("action-heroes/bruce-lee");
    expect(normalizeFriendAvatarSrc("/avatars/custom/custom-1.svg", env)).toBe("/avatars/custom/custom-1.svg");
  });
});

describe("getFriendAvatarSrcById", () => {
  it("uses WebP for legacy direct bundled avatar IDs", () => {
    expect(
      getFriendAvatarSrcById("/avatars/toons/toon-01-cap-glasses.svg", {
        avatarSrcById: {},
        defaultFriendAvatarSrc: "/avatars/toons/toon-01-cap-glasses.webp",
        env,
      })
    ).toBe("/avatars/toons/toon-01-cap-glasses.webp");
    expect(
      getFriendAvatarSrcById("/avatars/action-heroes/rambo.svg", {
        avatarSrcById: {},
        defaultFriendAvatarSrc: "/avatars/toons/toon-01-cap-glasses.webp",
        env,
      })
    ).toBe("/avatars/action-heroes/rambo.webp");
  });
});
