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

function functionBlock(rules: string, functionName: string) {
  const match = rules.match(new RegExp(`function ${functionName}\\([^)]*\\) \\{[\\s\\S]*?^    \\}`, "m"));
  if (!match) throw new Error(`${functionName} rule function not found`);
  return match[0];
}

describe("firestore user root rules", () => {
  it("allows completed task count as an optional integer mirror", () => {
    const block = functionBlock(readRules(), "isUserDoc");

    expect(block).toContain('"completedTaskCount"');
    expect(block).toContain('(!("completedTaskCount" in request.resource.data) || request.resource.data.completedTaskCount is int)');
  });
});

describe("firestore leaderboard profile rules", () => {
  it("allows owner updates for any valid current leaderboard profile document", () => {
    const block = leaderboardProfilesRuleBlock(readRules());

    expect(block).toContain("allow update: if isOwner(userId) && isLeaderboardProfileDoc(userId);");
  });

  it("does not compare obsolete leaderboard metric fields on update", () => {
    const block = leaderboardProfilesRuleBlock(readRules());

    expect(block).not.toMatch(/currentStreak|longestStreak|focusScore|weeklyCompletedCount|weeklyGoalMinutes/);
  });

  it("requires completed task count as a public integer metric", () => {
    const block = functionBlock(readRules(), "isLeaderboardProfileDoc");

    expect(block).toContain('"completedTaskCount"');
    expect(block).toContain("request.resource.data.completedTaskCount is int");
  });
});

describe("firestore friendship profile rules", () => {
  it("allows completed task count as an optional friendship profile mirror", () => {
    const block = functionBlock(readRules(), "isFriendshipProfileValue");

    expect(block).toContain('"completedTaskCount"');
    expect(block).toContain('(!("completedTaskCount" in value) || value.completedTaskCount == null || value.completedTaskCount is int)');
  });
});

describe("firestore friend request rules", () => {
  it("allows notification delivery mode to survive receiver decision updates when present or absent", () => {
    const block = functionBlock(readRules(), "isFriendRequestDocShape");
    const decisionBlock = functionBlock(readRules(), "isFriendRequestDecisionUpdate");
    const retryBlock = functionBlock(readRules(), "isFriendRequestRetryUpdate");
    const cancelBlock = functionBlock(readRules(), "isFriendRequestSenderCancelUpdate");

    expect(block).toContain('"notificationDeliveryMode"');
    expect(block).toContain(
      '(!("notificationDeliveryMode" in request.resource.data) || request.resource.data.notificationDeliveryMode in ["api"])'
    );
    expect(readRules()).toContain("function friendRequestNotificationDeliveryModeUnchanged()");
    expect(readRules()).toContain('!("notificationDeliveryMode" in resource.data)');
    expect(readRules()).toContain('!("notificationDeliveryMode" in request.resource.data)');
    expect(decisionBlock).toContain("friendRequestNotificationDeliveryModeUnchanged()");
    expect(retryBlock).toContain("friendRequestNotificationDeliveryModeUnchanged()");
    expect(cancelBlock).toContain("friendRequestNotificationDeliveryModeUnchanged()");
  });
});

describe("firestore device rules", () => {
  it("allows push delivery error markers for client recovery", () => {
    const block = functionBlock(readRules(), "isDeviceDoc");

    expect(block).toContain('"lastPushErrorCode"');
    expect(block).toContain('"lastPushErrorMessage"');
    expect(block).toContain('"lastPushErrorAtMs"');
    expect(block).toContain('"lastPushErrorTokenHash"');
    expect(block).toContain('optionalNullableStringMax("lastPushErrorCode", 160)');
    expect(block).toContain('optionalNullableStringMax("lastPushErrorMessage", 240)');
    expect(block).toContain('request.resource.data.lastPushErrorAtMs == null || request.resource.data.lastPushErrorAtMs is int');
    expect(block).toContain('optionalNullableStringMax("lastPushErrorTokenHash", 40)');
  });
});
