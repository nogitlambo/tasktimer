import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = resolve(process.cwd(), "android/app/src/main/AndroidManifest.xml");
const mainActivityPath = resolve(process.cwd(), "android/app/src/main/java/com/tasklaunch/app/MainActivity.java");

function readManifest() {
  return readFileSync(manifestPath, "utf8");
}

function readFirebaseConfig() {
  return JSON.parse(readFileSync(resolve(process.cwd(), "firebase.json"), "utf8")) as {
    hosting?: { site?: string; public?: string };
  };
}

describe("Android push notification manifest", () => {
  it("declares microphone access for native Brain Dump voice capture", () => {
    expect(readManifest()).toContain('android.permission.RECORD_AUDIO');
    expect(readFileSync(mainActivityPath, "utf8")).toContain("registerPlugin(TaskLaunchMicrophonePermissionPlugin.class)");
  });

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

  it("publishes app-link verification files to the Firebase Auth link domain", () => {
    const hosting = readFirebaseConfig().hosting;

    expect(hosting?.site).toBe("tasktimer-prod");
    expect(hosting?.public).toBe("public");
    expect(readFileSync(resolve(process.cwd(), "public/.well-known/assetlinks.json"), "utf8")).toContain(
      '"delegate_permission/common.handle_all_urls"',
    );
  });
});
