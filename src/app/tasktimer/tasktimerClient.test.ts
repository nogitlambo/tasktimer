import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("tasktimerClient leaderboard friend profile bridge", () => {
  const source = readFileSync(resolve(__dirname, "tasktimerClient.ts"), "utf8");

  it("listens for leaderboard friend profile events and delegates to Friend Info", () => {
    expect(source).toContain("TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
    expect(source).toContain("openFriendProfileModal");
    expect(source).toContain("refreshGroupsData({ preserveStatus: true })");
    expect(source).toContain("window.addEventListener(TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
  });

  it("removes the leaderboard friend profile listener during destroy", () => {
    expect(source).toContain("openFriendProfileFromLeaderboardListener");
    expect(source).toContain("window.removeEventListener(TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
  });

  it("does not reset leaderboard initial auth text to the workspace message while hiding the overlay", () => {
    expect(source).toContain('const isLeaderboardPage = appRuntimeState.get("currentAppPage") === "leaderboard";');
    expect(source).toContain("(!isOn && !normalizedMessage && isLeaderboardPage)");
    expect(source).toContain('textEl.classList.toggle("leaderboardLoadingText", isLeaderboardLoadingMessage);');
  });
});
