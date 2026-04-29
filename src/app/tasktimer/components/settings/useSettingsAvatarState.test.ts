import { describe, expect, it } from "vitest";
import { customAvatarUploadIdForUid, type StoredCustomAvatarUpload } from "@/app/tasktimer/lib/accountProfileStorage";
import { AVATAR_CATALOG } from "@/app/tasktimer/lib/avatarCatalog";
import { buildSettingsAvatarOptions } from "./useSettingsAvatarState";

describe("buildSettingsAvatarOptions", () => {
  it("adds Google and multiple local uploaded avatars after built-in avatars", () => {
    const uploads: StoredCustomAvatarUpload[] = [
      { id: customAvatarUploadIdForUid("uid-1", 200), src: "data:image/png;base64,two", label: "Custom Upload 2", createdAt: 200 },
      { id: customAvatarUploadIdForUid("uid-1", 100), src: "data:image/png;base64,one", label: "Custom Upload 1", createdAt: 100 },
    ];

    const options = buildSettingsAvatarOptions({
      authUserUid: "uid-1",
      authHasGoogleProvider: true,
      authGooglePhotoUrl: "https://example.com/google.png",
      customAvatarUploads: uploads,
    });

    expect(options.slice(0, AVATAR_CATALOG.length)).toEqual(AVATAR_CATALOG);
    expect(options.slice(-3)).toEqual([
      { id: "google/profile-photo:uid-1", label: "Google Profile Photo", src: "https://example.com/google.png" },
      { id: "custom-upload:uid-1:200", label: "Custom Upload 2", src: "data:image/png;base64,two" },
      { id: "custom-upload:uid-1:100", label: "Custom Upload 1", src: "data:image/png;base64,one" },
    ]);
  });

  it("returns only built-in avatars for signed-out users", () => {
    expect(
      buildSettingsAvatarOptions({
        authUserUid: null,
        authHasGoogleProvider: true,
        authGooglePhotoUrl: "https://example.com/google.png",
        customAvatarUploads: [{ id: "custom-upload:uid-1:1", src: "data:image/png;base64,one", label: "Upload", createdAt: 1 }],
      }),
    ).toEqual(AVATAR_CATALOG);
  });
});
