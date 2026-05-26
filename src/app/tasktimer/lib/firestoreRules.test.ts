import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rulesPath = resolve(process.cwd(), "firestore.rules");

function readRules() {
  return readFileSync(rulesPath, "utf8");
}

function leaderboardProfilesRuleBlock(rules: string) {
  const match = rules.match(/match \/leaderboardProfiles\/\{userId\} \{[\s\S]*?^\s*\}/m);
  if (!match) throw new Error("leaderboardProfiles rule block not found");
  return match[0];
}

describe("firestore leaderboard profile rules", () => {
  it("allows owner updates for any valid current leaderboard profile document", () => {
    const block = leaderboardProfilesRuleBlock(readRules());

    expect(block).toContain("allow update: if isOwner(userId) && isLeaderboardProfileDoc(userId);");
  });

  it("does not compare obsolete leaderboard metric fields on update", () => {
    const block = leaderboardProfilesRuleBlock(readRules());

    expect(block).not.toMatch(/currentStreak|longestStreak|focusScore|weeklyCompletedCount|weeklyGoalMinutes/);
  });
});
