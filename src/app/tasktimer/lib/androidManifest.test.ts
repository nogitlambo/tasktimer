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

  it("declares the custom URL scheme used for email-link native handoff", () => {
    const manifest = readManifest();

    expect(manifest).toContain('android:scheme="com.tasklaunch.app"');
    expect(manifest).toContain('android:host="login"');
  });

  it("declares native account and settings deep-link hosts for billing returns", () => {
    const manifest = readManifest();

    expect(manifest).toContain('android:host="account"');
    expect(manifest).toContain('android:host="settings"');
  });

  it("declares hosted tasklaunch.app app links for account and settings billing returns", () => {
    const manifest = readManifest();

    expect(manifest).toContain('android:scheme="https"');
    expect(manifest).toContain('android:host="tasklaunch.app"');
    expect(manifest).toContain('android:pathPrefix="/account"');
    expect(manifest).toContain('android:pathPrefix="/settings"');
  });
});
