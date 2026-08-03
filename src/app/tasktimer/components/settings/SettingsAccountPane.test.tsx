import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SettingsAccountPane", () => {
  it("renders a manual sync action alongside sign-out controls", () => {
    const source = readFileSync(resolve(__dirname, "SettingsAccountPane.tsx"), "utf8");

    expect(source).toContain("settingsProfileSyncBtn");
    expect(source).toContain('onClick={() => void account.onSyncNow()}');
    expect(source).toContain('disabled={account.syncBusy || account.signOutBusy}');
  });
});
