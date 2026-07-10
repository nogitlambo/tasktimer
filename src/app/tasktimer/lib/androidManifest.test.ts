import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");

function readManifest() {
  return readFileSync(manifestPath, "utf8");
}

describe("Android push notification manifest", () => {
  it("declares the Android 13+ notification permission required for native push display", () => {
    expect(readManifest()).toContain('android.permission.POST_NOTIFICATIONS');
  });
});
