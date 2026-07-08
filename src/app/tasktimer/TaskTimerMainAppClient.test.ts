import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("TaskTimerMainAppClient leaderboard user summary modal", () => {
  const source = readFileSync(resolve(__dirname, "TaskTimerMainAppClient.tsx"), "utf8");
  const shellCss = readFileSync(resolve(__dirname, "styles/01-shell.css"), "utf8");

  it("renders the leaderboard user summary overlay outside the app page scroller", () => {
    const frameCloseIndex = source.indexOf("</TaskTimerAppFrame>");
    const overlayIndex = source.indexOf('id="leaderboardPositionOverlay"');

    expect(frameCloseIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(-1);
    expect(overlayIndex).toBeGreaterThan(frameCloseIndex);
  });

  it("renders the leaderboard user summary reveal wrapper and entrance class", () => {
    expect(source).toContain('className="modal leaderboardPositionModal isLeaderboardPositionRevealing"');
    expect(source).toContain('className="friendUserSummaryBorderTrace"');
    expect(source).toContain('className="leaderboardPositionRevealBody"');
  });

  it("does not let leaderboard swipe handling capture profile-open clicks", () => {
    expect(source).toContain("data-leaderboard-profile-open=");
    expect(source).toContain("if (isLeaderboardProfileOpenTarget(event.target)) return;");
    expect(source).toContain('target?.closest("[data-leaderboard-profile-open]")');
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("event.stopPropagation();");
  });

  it("does not let leaderboard swipe handling capture weekly awards info clicks", () => {
    expect(source).toContain('className="iconBtn leaderboardWeeklyAwardsInfoBtn"');
    expect(source).toContain("function isLeaderboardAwardsInfoTarget");
    expect(source).toContain("if (isLeaderboardAwardsInfoTarget(event.target)) return;");
    expect(source).toContain('target?.closest(".leaderboardWeeklyAwardsInfoBtn")');
    expect(source).toContain("setWeeklyAwardsInfoOpen(true)");
  });

  it("routes friend leaderboard table rows through the Friend Info event", () => {
    expect(source).toContain("friendUidSet={leaderboardFriendUidSet}");
    expect(source).toContain('isFriend ? " isFriend" : ""');
    expect(source).not.toContain("leaderboardFriendBadge");
    expect(source).toContain("TASKTIMER_OPEN_FRIEND_PROFILE_EVENT");
    expect(source).toContain("setSelectedLeaderboardProfile(profile)");
    expect(source).toContain("detail: { friendUid: row.profile.uid }");
  });

  it("uses one leaderboard loading message without legacy per-panel copy", () => {
    expect(source).toContain('const LEADERBOARD_LOADING_TEXT = "Loading leaderboard standings";');
    expect(source).toContain('className="leaderboardLoadingText"');
    expect(source).toContain('aria-label={`${LEADERBOARD_LOADING_TEXT}...`}');
    expect(source).toContain('leaderboardState === "loading" ? renderLeaderboardLoadingText()');
    expect(source).not.toContain("Loading weekly leaderboard.");
    expect(source).not.toContain("Loading rivals.");
    expect(source).not.toContain("Loading leaderboard standings.");
  });

  it("keeps leaderboard loads visible for two seconds and ignores stale results", () => {
    expect(source).toContain("const LEADERBOARD_LOADING_MIN_MS = 2_000;");
    expect(source).toContain("waitForMinimumLoadingDuration");
    expect(source).toContain("leaderboardLoadSeqRef");
    expect(source).toContain("leaderboardLoadSeqRef.current !== loadSeq");
    expect(source).not.toContain("preserveReadyState");
  });

  it("styles leaderboard loading text with Orbitron and repeating dots", () => {
    expect(shellCss).toContain("#app[aria-label=\"TaskLaunch App\"] .leaderboardLoadingText");
    expect(shellCss).toContain("font-family: var(--font-orbitron), Orbitron, \"Segoe UI Variable\", \"Segoe UI\", Arial, sans-serif !important;");
    expect(shellCss).toContain("font-size: 15.12px !important;");
    expect(shellCss).toContain("@keyframes leaderboardLoadingDots");
    expect(shellCss).toContain("animation: leaderboardLoadingDots 1.2s steps(1, end) infinite;");
  });
});
