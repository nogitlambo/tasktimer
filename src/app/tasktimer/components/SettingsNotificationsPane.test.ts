import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SettingsNotificationsPane", () => {
  const source = readFileSync(resolve(__dirname, "settings/SettingsNotificationsPane.tsx"), "utf8");
  const preferencesSource = readFileSync(resolve(__dirname, "../client/preferences.ts"), "utf8");

  it("renders background checkpoint alerts as a switch that can be toggled in-app", () => {
    expect(source).toContain('id="taskCheckpointAlarmPermissionRow"');
    expect(source).toContain("Background Checkpoint Alerts");
    expect(source).toContain('className="switch on" id="taskCheckpointAlarmPermissionToggle"');
    expect(source).toContain('role="switch" aria-checked="true"');
    expect(source).toContain('id="taskCheckpointAlarmPermissionBtn"');
  });

  it("keeps the Android background checkpoint row visible when alerts are off", () => {
    expect(preferencesSource).toContain('els.taskCheckpointAlarmPermissionRow?.classList.toggle("isHidden", !nativeAndroid);');
    expect(preferencesSource).toContain('els.taskCheckpointAlarmPermissionStatus.textContent = "Background checkpoint alerts are off.";');
    expect(preferencesSource).toContain('els.taskCheckpointAlarmPermissionBtn?.classList.add("isHidden");');
  });

  it("binds the background checkpoint switch to disable checkpoint sound and vibration alerts", () => {
    expect(preferencesSource).toContain("function applyBackgroundCheckpointAlertsPreference(nextEnabled: boolean)");
    expect(preferencesSource).toContain("ctx.setCheckpointAlertSoundEnabledState(false);");
    expect(preferencesSource).toContain("ctx.setCheckpointAlertVibrationEnabledState(false);");
    expect(preferencesSource).toContain("control: els.taskCheckpointAlarmPermissionToggle");
    expect(preferencesSource).toContain('ignoreSelector: "#taskCheckpointAlarmPermissionToggle, #taskCheckpointAlarmPermissionBtn"');
  });
});
