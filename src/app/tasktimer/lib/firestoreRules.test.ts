import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const indexesPath = resolve(process.cwd(), "firestore.indexes.json");

function readRules() {
  return readFileSync(rulesPath, "utf8");
}

function readIndexes() {
  return JSON.parse(readFileSync(indexesPath, "utf8")) as {
    indexes: Array<{
      collectionGroup: string;
      queryScope: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;
  };
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
  it("allows every mirrored TaskTimer plan value", () => {
    const block = functionBlock(readRules(), "isValidUserPlanValue");

    expect(block).toContain('["free", "plus", "plus_monthly", "plus_yearly", "plus_lifetime", "pro"]');
  });

  it("allows completed task count as an optional integer mirror", () => {
    const block = functionBlock(readRules(), "isUserDoc");

    expect(block).toContain('"completedTaskCount"');
    expect(block).toContain('(!("completedTaskCount" in request.resource.data) || request.resource.data.completedTaskCount is int)');
  });

  it("blocks owner writes for deleted account uids", () => {
    const rules = readRules();

    expect(functionBlock(rules, "deletedAccountUidExists")).toContain("/deletedAccountUids/$(userId)");
    expect(functionBlock(rules, "isActiveOwner")).toContain("!deletedAccountUidExists(userId)");
    expect(rules).toContain("allow create, update: if isActiveOwner(userId) && isUserDoc();");
    expect(rules).toContain("match /deletedAccountUids/{userId}");
    expect(rules).toContain("allow create, update, delete: if false;");
  });
});

describe("firestore leaderboard profile rules", () => {
  it("allows owner updates for any valid current leaderboard profile document", () => {
    const block = leaderboardProfilesRuleBlock(readRules());

    expect(block).toContain("allow update: if isActiveOwner(userId) && isLeaderboardProfileDoc(userId);");
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

  it("requires weekly period fields for rollover-scoped weekly metrics", () => {
    const block = functionBlock(readRules(), "isLeaderboardProfileDoc");

    expect(block).toContain('"weeklyPeriodStartMs"');
    expect(block).toContain('"weeklyPeriodEndMs"');
    expect(block).toContain('(!("weeklyPeriodStartMs" in request.resource.data) || request.resource.data.weeklyPeriodStartMs is int)');
    expect(block).toContain('(!("weeklyPeriodEndMs" in request.resource.data) || request.resource.data.weeklyPeriodEndMs is int)');
  });

  it("defines the weekly period leaderboard index", () => {
    const indexes = readIndexes();

    expect(indexes.indexes).toContainEqual({
      collectionGroup: "leaderboardProfiles",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "weeklyPeriodStartMs", order: "ASCENDING" },
        { fieldPath: "weeklyXpGain", order: "DESCENDING" },
      ],
    });
  });

  it("denies known test usernames at write time", () => {
    const rules = readRules();

    expect(functionBlock(rules, "isAllowedLeaderboardProfileUsername")).toContain("codexemaillin_yixnc2");
    expect(functionBlock(rules, "isAllowedLeaderboardProfileUsername")).toContain("codexemaillinktest");
    expect(functionBlock(rules, "isLeaderboardProfileDoc")).toContain("isAllowedLeaderboardProfileUsername()");
  });
});

describe("firestore friendship profile rules", () => {
  it("allows completed task count as an optional friendship profile mirror", () => {
    const block = functionBlock(readRules(), "isFriendshipProfileValue");

    expect(block).toContain('"completedTaskCount"');
    expect(block).toContain('(!("completedTaskCount" in value) || value.completedTaskCount == null || value.completedTaskCount is int)');
  });
});

describe("firestore shared task summary rules", () => {
  it("allows the task color field written by task sharing", () => {
    const block = functionBlock(readRules(), "isSharedTaskSummaryV1");

    expect(block).toContain('"taskColor"');
    expect(block).toContain(
      '(!("taskColor" in request.resource.data) || request.resource.data.taskColor == null || request.resource.data.taskColor is string)'
    );
  });

  it("allows import config snapshots for shared task imports", () => {
    const summaryBlock = functionBlock(readRules(), "isSharedTaskSummaryV1");
    const configBlock = functionBlock(readRules(), "isSharedTaskImportConfig");

    expect(summaryBlock).toContain('"importConfig"');
    expect(summaryBlock).toContain("isSharedTaskImportConfig(request.resource.data.importConfig)");
    expect(configBlock).toContain('"plannedStartByDay"');
    expect(configBlock).toContain('"timeGoalMinutes"');
    expect(configBlock).toContain('"milestones"');
    expect(configBlock).toContain('"presetIntervalNextSeq"');
  });

  it("does not allow obsolete checkpoint toast fields", () => {
    const rules = readRules();
    const taskBlock = functionBlock(rules, "isTaskDoc");
    const configBlock = functionBlock(rules, "isSharedTaskImportConfig");

    expect(taskBlock).not.toContain("checkpointToastEnabled");
    expect(taskBlock).not.toContain("checkpointToastMode");
    expect(configBlock).not.toContain("checkpointToastEnabled");
    expect(configBlock).not.toContain("checkpointToastMode");
  });
});

describe("firestore task document rules", () => {
  it("allows nullable YYYY-MM-DD planned start dates", () => {
    const block = functionBlock(readRules(), "isTaskDoc");

    expect(block).toContain('"plannedStartDate"');
    expect(block).toContain("request.resource.data.plannedStartDate.matches('^\\\\d{4}-\\\\d{2}-\\\\d{2}$')");
  });

  it("allows manual completion and Next Best Action snooze timestamps", () => {
    const block = functionBlock(readRules(), "isTaskDoc");

    for (const field of ["markedDoneAtMs", "markedDoneUntilMs", "nextBestActionSnoozedUntilMs"]) {
      expect(block).toContain(`"${field}"`);
      expect(block).toContain(`request.resource.data.${field} == null || request.resource.data.${field} is int`);
    }
  });

  it("allows imported shared task source metadata", () => {
    const block = functionBlock(readRules(), "isTaskDoc");

    expect(block).toContain('"sharedSourceOwnerUid"');
    expect(block).toContain('"sharedSourceTaskId"');
    expect(block).toContain('"sharedSourceShareDocId"');
    expect(block).toContain('"sharedSourceImportedAtMs"');
    expect(block).toContain('(!("sharedSourceImportedAtMs" in request.resource.data) || request.resource.data.sharedSourceImportedAtMs == null || request.resource.data.sharedSourceImportedAtMs is int)');
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

describe("firestore preference rules", () => {
  it("allows every current client preference field written by the normalized preference document", () => {
    const block = functionBlock(readRules(), "isPreferencesV1");

    for (const field of [
      "timeGoalCompleteNextTasksEnabled",
      "dashboardPreviousWeekVisible",
      "fullColorTaskCardsEnabled",
      "executiveFunctionEnabled",
      "checkpointAlertVibrationEnabled",
      "checkpointAlertFlashEnabled",
    ]) {
      expect(block).toContain(`"${field}"`);
      expect(block).toContain(`request.resource.data.${field} is bool`);
    }

    expect(block).toContain('request.resource.data.startupModule in ["dashboard", "tasks", "notes", "executive", "friends", "leaderboard"]');
    expect(block).toContain('"menuButtonStyle"');
    expect(block).toContain('request.resource.data.menuButtonStyle == "square"');
  });
});

describe("firestore adaptive capacity rules", () => {
  it("keeps capacity snapshots and aggregates owner-readable and server-maintained", () => {
    const rules = readRules();

    expect(rules).toContain("match /users/{userId}/dailyCapacity/{dateId}");
    expect(rules).toContain("match /users/{userId}/behaviourFeatures/{featureId}");
    expect(rules).toContain("match /users/{userId}/scheduleRepairs/{repairId}");
    expect(rules).toContain("match /users/{userId}/recoverySessions/{recoveryId}");
    expect(rules).toContain("match /users/{userId}/recoveryState/{stateId}");
    expect(rules).toContain("allow read: if isOwner(userId);");
    expect(rules).toContain("allow create, update, delete: if false;");
  });
});

describe("firestore Trusted Automation rules", () => {
  it("keeps policy readable by active owners while denying client writes to automation state", () => {
    const rules = readRules();

    expect(rules).toContain('match /users/{userId}/automationSettings/{docId}');
    expect(rules).toContain('allow read: if isActiveOwner(userId) && docId == "settings";');
    expect(rules).toContain('match /users/{userId}/automationExecutions/{executionId}');
    expect(rules).toContain('match /users/{userId}/automationHistory/{historyId}');
    expect(rules).toContain('match /users/{userId}/automationLocks/{lockId}');
    expect(rules).toContain('match /users/{userId}/automationQueues/{queueItemId}');
    expect(rules).toContain('match /users/{userId}/automationDeadLetters/{deadLetterId}');
    expect(rules).toContain('allow read: if isActiveOwner(userId)');
    expect(rules).toContain('allow read, create, update, delete: if false;');
  });
});

describe("firestore Proactive Executive Nudge rules", () => {
  it("keeps preferences and delivery history active-owner readable and server-maintained", () => {
    const rules = readRules();

    expect(rules).toContain('match /users/{userId}/nudgePreferences/{docId}');
    expect(rules).toContain('allow read: if isActiveOwner(userId) && docId == "current";');
    expect(rules).toContain('match /users/{userId}/nudgeDeliveries/{deliveryId}');
    expect(rules).toContain('allow read: if isActiveOwner(userId);');
    expect(rules).toContain('allow create, update, delete: if false;');
  });
});
