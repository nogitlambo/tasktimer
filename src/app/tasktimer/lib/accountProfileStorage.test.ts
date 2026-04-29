import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "./storage";
import {
  appendStoredCustomAvatarUpload,
  customAvatarIdForUid,
  customAvatarUploadIdForUid,
  findStoredCustomAvatarUploadSrc,
  isCustomAvatarIdForUid,
  migrateStoredCustomAvatarSrcToUploads,
  readStoredCustomAvatarUploads,
  writeStoredCustomAvatarSrc,
  writeStoredCustomAvatarUploads,
} from "./accountProfileStorage";

function installLocalStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });
  return values;
}

describe("account profile avatar upload storage", () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installLocalStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("returns an empty upload history when nothing is stored", () => {
    expect(readStoredCustomAvatarUploads("uid-1")).toEqual([]);
  });

  it("falls back to an empty upload history for malformed JSON", () => {
    storage.set(`${STORAGE_KEY}:avatarCustomUploads:uid-1`, "{not json");
    expect(readStoredCustomAvatarUploads("uid-1")).toEqual([]);
  });

  it("keeps the five newest uploads", () => {
    for (let index = 1; index <= 6; index += 1) {
      appendStoredCustomAvatarUpload("uid-1", {
        id: customAvatarUploadIdForUid("uid-1", index),
        src: `data:image/png;base64,${index}`,
        label: `Upload ${index}`,
        createdAt: index,
      });
    }

    expect(readStoredCustomAvatarUploads("uid-1").map((upload) => upload.label)).toEqual([
      "Upload 6",
      "Upload 5",
      "Upload 4",
      "Upload 3",
      "Upload 2",
    ]);
  });

  it("migrates the legacy single custom avatar into upload history", () => {
    writeStoredCustomAvatarSrc("uid-1", "data:image/png;base64,legacy");

    expect(migrateStoredCustomAvatarSrcToUploads("uid-1")).toEqual([
      {
        id: customAvatarIdForUid("uid-1"),
        src: "data:image/png;base64,legacy",
        label: "Custom Upload 1",
        createdAt: 0,
      },
    ]);
  });

  it("resolves custom upload ids without requiring exact legacy id matches", () => {
    const uploadId = customAvatarUploadIdForUid("uid-1", 123);
    writeStoredCustomAvatarUploads("uid-1", [{ id: uploadId, src: "data:image/png;base64,next", label: "Upload", createdAt: 123 }]);

    expect(isCustomAvatarIdForUid("uid-1", uploadId)).toBe(true);
    expect(findStoredCustomAvatarUploadSrc("uid-1", uploadId)).toBe("data:image/png;base64,next");
  });
});
