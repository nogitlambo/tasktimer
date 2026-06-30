import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskTimerMainAppClient leaderboard user summary modal", () => {
  const source = readFileSync(resolve(__dirname, "TaskTimerMainAppClient.tsx"), "utf8");

  it("renders the leaderboard user summary overlay outside the app page scroller", () => {
    const frameCloseIndex = source.indexOf("</TaskTimerAppFrame>");
    const overlayIndex = source.indexOf('id="leaderboardPositionOverlay"');

    expect(frameCloseIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(frameCloseIndex);
  });

  it("does not let leaderboard swipe handling capture profile-open clicks", () => {
    expect(source).toContain("data-leaderboard-profile-open=");
    expect(source).toContain("if (isLeaderboardProfileOpenTarget(event.target)) return;");
    expect(source).toContain('target?.closest("[data-leaderboard-profile-open]")');
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
  });

  it("routes friend leaderboard table rows through the Friend Info event", () => {
    expect(source).toContain("friendUidSet={leaderboardFriendUidSet}");
    expect(source).toContain('isFriend ? " isFriend" : ""');
    expect(source).not.toContain("leaderboardFriendBadge");
    expect(source).toContain("TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
    expect(source).toContain("setSelectedLeaderboardProfile(profile)");
    expect(source).toContain("detail: { friendUid: row.profile.uid }");
  });
});
