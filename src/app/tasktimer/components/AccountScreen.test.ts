import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getAccountSyncActionCopy } from "./AccountScreen";

describe("getAccountSyncActionCopy", () => {
  it("keeps normal account sync copy", () => {
    expect(getAccountSyncActionCopy(false)).toEqual({
      label: "Sync",
    });
    expect(getAccountSyncActionCopy(true).label).toBe("Syncing...");
  });
});

describe("AccountScreen native account actions", () => {
  const source = readFileSync(resolve(__dirname, "AccountScreen.tsx"), "utf8");

  it("renders the canonical native sync action without sign out or delete actions", () => {
    expect(source).toContain("accountProfileActions");
    expect(source).toContain("/icons/icons_default/refresh.webp");
    expect(source).not.toContain("/icons/icons_default/signout.webp");
    expect(source).not.toContain("accountProfileActionSignOut");
    expect(source).not.toContain("SignOutConfirmModal");
    expect(source).not.toContain("Sign Out");
    expect(source).not.toContain("accountProfileActionTiles");
    expect(source).not.toContain("accountProfileDeleteTile");
    expect(source).not.toContain("Delete Account");
  });

  it("keeps sync restrictions on the sync action", () => {
    expect(source).toContain("account.syncState === \"synced\"");
    expect(source).toContain("account.syncCooldownUntilMs > 0");
    expect(source).toContain("disabled={syncDisabled}");
    expect(source).toContain("onClick={() => void account.onSyncNow()}");
  });

});
