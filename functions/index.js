import {getApp, getApps, initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import {createHash} from "node:crypto";

if (!getApps().length) {
  initializeApp();
}

const app = getApp();
const region = String(process.env.FUNCTION_REGION || "us-central1").trim() || "us-central1";
// Keep the Functions Firestore target aligned with the app's named database.
const defaultDatabaseId = "timebase";
const databaseId = String(
  process.env.FIREBASE_DATABASE_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
  defaultDatabaseId
).trim() || defaultDatabaseId;
const db = getFirestore(app, databaseId);
const messaging = getMessaging(app);
const TASK_TIME_GOAL_ACTIVE_TTL_MS = 2 * 60 * 1000;
const PUSH_ACTION_SNOOZE_MS = 10 * 60 * 1000;
const PLANNED_START_REMINDER_EVENT = "plannedStartReminder";
const PLANNED_START_SNOOZED_EVENT = "plannedStartReminderSnoozed";
const PLANNED_START_NOTIFICATION_KIND = "plannedStart";
const MISSED_SCHEDULED_TASK_EVENT = "missedScheduledTask";
const UNSCHEDULED_GAP_REMINDER_EVENT = "unscheduledGapReminder";
const UNSCHEDULED_GAP_NOTIFICATION_KIND = "unscheduledGap";
const TIME_GOAL_COMPLETE_EVENT = "timeGoalComplete";
const TIME_GOAL_COMPLETE_NOTIFICATION_KIND = "timeGoalComplete";
const FRIEND_TASK_REMINDER_EVENT = "friendTaskReminder";
const FRIEND_TASK_REMINDER_NOTIFICATION_KIND = "friendTaskReminder";
const FRIEND_REQUEST_NOTIFICATION_TITLE = "You have a pending friend request";
const FRIEND_REQUEST_NOTIFICATION_BODY = "Tap to view the request";
const FRIEND_REQUEST_NOTIFICATION_ROUTE = "/friends";
const FRIEND_REQUEST_NOTIFICATION_TYPE = "friendRequest";
const PUSH_ACTION_LAUNCH_TASK = "launchTask";
const PUSH_ACTION_SNOOZE_10M = "snooze10m";
const PUSH_ACTION_POSTPONE_NEXT_GAP = "postponeNextGap";
const MINUTE_MS = 60 * 1000;
const SHARED_TASK_REMINDER_COOLDOWN_MS = 60 * MINUTE_MS;
const MAX_PUSH_DEVICE_ROWS_PER_USER = 20;
const MAX_DUE_PUSH_DOCS_PER_TICK = 500;
const STALE_SCHEDULE_DOC_TTL_MS = 30 * 24 * 60 * MINUTE_MS;
const protectedCallableOptions = {
  region,
  enforceAppCheck: true,
};

function asString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asInt(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
}

function asNumber(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function asBool(value) {
  return value === true;
}

function normalizePlan(value) {
  return String(value || "").trim().toLowerCase() === "pro" ? "pro" : "free";
}

function normalizeEmailKey(value) {
  return asString(value).toLowerCase();
}

function sortedPair(a, b) {
  return [asString(a), asString(b)].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}

function friendshipDocId(uidA, uidB) {
  const [a, b] = sortedPair(uidA, uidB);
  return `pair:${a}:${b}`;
}

function sharedTaskSummaryDocId(ownerUid, friendUid, taskId) {
  return `share:${ownerUid}:${friendUid}:${taskId}`;
}

const ADMIN_ACCOUNT_EMAIL = normalizeEmailKey(process.env.TASKLAUNCH_ADMIN_EMAIL);

function isActiveSubscriptionStatus(status) {
  const activeStatuses = new Set(["trialing", "active", "past_due"]);
  return activeStatuses.has(asString(status).toLowerCase());
}

function millisFromTimestampLike(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    try {
      return Number(value.toMillis()) || 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function isAdminAccountEmail(email) {
  return !!ADMIN_ACCOUNT_EMAIL && normalizeEmailKey(email) === ADMIN_ACCOUNT_EMAIL;
}

function isAdminRequest(request) {
  const token = request.auth?.token || {};
  if (token.taskLaunchAdmin === true || token.admin === true) return true;
  if (token.email_verified === true && isAdminAccountEmail(token.email)) return true;
  return false;
}

async function upsertUserPlan(uid, plan) {
  const normalizedUid = asString(uid);
  if (!normalizedUid) {
    throw new HttpsError("invalid-argument", "A valid user id is required.");
  }
  const normalizedPlan = normalizePlan(plan);
  const userRef = db.collection("users").doc(normalizedUid);
  const existingSnap = await userRef.get();
  const currentPlan = existingSnap.exists ? normalizePlan(existingSnap.get("plan")) : "free";
  const nextPlan = normalizedPlan || currentPlan || "free";
  await userRef.set({
    schemaVersion: 1,
    plan: nextPlan,
    planUpdatedAt: FieldValue.serverTimestamp(),
    createdAt: existingSnap.exists ? existingSnap.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return nextPlan;
}

async function restoreRetainedSubscriptionForUser(uid, email) {
  const normalizedUid = asString(uid);
  const normalizedEmail = normalizeEmailKey(email);
  if (!normalizedUid || !normalizedEmail) return "free";

  const retainedRef = db.collection("retainedSubscriptions").doc(normalizedEmail);
  const retainedSnap = await retainedRef.get();
  if (!retainedSnap.exists) return "free";

  const status = asString(retainedSnap.get("stripeSubscriptionStatus")).toLowerCase();
  const currentPeriodEndAt = retainedSnap.get("currentPeriodEndAt");
  const currentPeriodEndAtMs = millisFromTimestampLike(currentPeriodEndAt);
  if (!isActiveSubscriptionStatus(status) || currentPeriodEndAtMs <= Date.now()) {
    await retainedRef.delete().catch(() => {});
    return await upsertUserPlan(normalizedUid, "free");
  }

  const userRef = db.collection("users").doc(normalizedUid);
  const subscriptionRef = db.collection("userSubscriptions").doc(normalizedUid);
  const [userSnap, subscriptionSnap] = await Promise.all([userRef.get(), subscriptionRef.get()]);
  const stripeCustomerId = asString(retainedSnap.get("stripeCustomerId"));
  if (!stripeCustomerId) {
    await retainedRef.delete().catch(() => {});
    return await upsertUserPlan(normalizedUid, "free");
  }

  const batch = db.batch();
  batch.set(userRef, {
    schemaVersion: 1,
    plan: "pro",
    planUpdatedAt: FieldValue.serverTimestamp(),
    createdAt: userSnap.exists ? userSnap.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  batch.set(subscriptionRef, {
    schemaVersion: 1,
    stripeCustomerId,
    stripeSubscriptionId: asString(retainedSnap.get("stripeSubscriptionId")),
    stripePriceId: asString(retainedSnap.get("stripePriceId")),
    stripeSubscriptionStatus: status,
    currentPeriodEndAt,
    stripeSyncedAt: FieldValue.serverTimestamp(),
    createdAt: subscriptionSnap.exists ? subscriptionSnap.get("createdAt") || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  await batch.commit();
  return "pro";
}

function asStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [String(key || "").trim(), entryValue == null ? "" : String(entryValue)] )
    .filter(([key]) => !!key);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function asProfileDisplayName(value, fallback = "A friend") {
  const profile = value && typeof value === "object" ? value : {};
  return asString(profile.alias || profile.username || profile.displayName, fallback).slice(0, 60) || fallback;
}

async function resolveFriendReminderSenderName(callerUid, ownerUid) {
  const pairSnap = await db.collection("friendships").doc(friendshipDocId(callerUid, ownerUid)).get();
  if (!pairSnap.exists) return {ok: false, senderName: ""};
  const profileByUid = pairSnap.get("profileByUid") || {};
  const senderName = asProfileDisplayName(profileByUid[callerUid], "");
  if (senderName) return {ok: true, senderName};
  const userSnap = await db.collection("users").doc(callerUid).get().catch(() => null);
  return {
    ok: true,
    senderName: asString(userSnap?.get?.("username"), "A friend").slice(0, 60) || "A friend",
  };
}

async function cleanupInvalidDeviceTokens(uid, deviceRows, response, opts = {}) {
  const nowMs = Date.now();
  const invalidRows = response.responses
    .map((item, index) => ({
      success: item.success,
      errorCode: item.error?.code || "",
      errorMessage: item.error?.message || "",
      deviceId: deviceRows[index]?.id || "",
      platform: deviceRows[index]?.platform || "",
      native: deviceRows[index]?.native === true,
      appActive: deviceRows[index]?.appActive === true,
      appStateUpdatedAtMs: asInt(deviceRows[index]?.appStateUpdatedAtMs, 0),
      tokenLength: asString(deviceRows[index]?.token).length,
      tokenHash: tokenLogHash(deviceRows[index]?.token),
    }))
    .filter((row) => !row.success);

  const removableCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ]);

  if (opts.deleteInvalidTokens !== false) {
    await Promise.all(
      invalidRows
        .filter((row) => removableCodes.has(row.errorCode) && row.deviceId)
        .map((row) =>
          db
            .collection("users")
            .doc(uid)
            .collection("devices")
            .doc(row.deviceId)
            .set(
              {
                token: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              {merge: true}
            )
        )
    );
  } else {
    await Promise.all(
      invalidRows
        .filter((row) => removableCodes.has(row.errorCode) && row.deviceId)
        .map((row) =>
          db
            .collection("users")
            .doc(uid)
            .collection("devices")
            .doc(row.deviceId)
            .set(
              {
                lastPushErrorCode: asString(row.errorCode).slice(0, 160),
                lastPushErrorMessage: asString(row.errorMessage).slice(0, 240),
                lastPushErrorAtMs: nowMs,
                lastPushErrorTokenHash: asString(row.tokenHash).slice(0, 40),
                updatedAt: FieldValue.serverTimestamp(),
              },
              {merge: true}
            )
        )
    );
  }

  return invalidRows;
}

function tokenLogHash(token) {
  const normalizedToken = asString(token);
  if (!normalizedToken) return "";
  return createHash("sha256").update(normalizedToken).digest("hex").slice(0, 12);
}

export const sendPushTest = onCall(protectedCallableOptions, async (request) => {
  const uid = asString(request.auth?.uid);
  logger.info("sendPushTest App Check", {
    uid: uid || null,
    appId: request.app?.appId || null,
    appCheckAlreadyConsumed: request.app?.alreadyConsumed ?? null,
  });
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a push test.");
  }

  try {
    const rawData = request.data && typeof request.data === "object" ? request.data : {};
    const title = asString(rawData.title, "TaskLaunch Test") || "TaskLaunch Test";
    const body = asString(rawData.body, "Push messaging is configured correctly.") || "Push messaging is configured correctly.";
    const data = asStringMap(rawData.data);

    const snapshot = await db.collection("users").doc(uid).collection("devices").get();
    const prefs = await loadUserPushPreferences(uid);
    const deviceRows = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        token: asString(docSnap.get("token")),
        enabled: docSnap.get("enabled") !== false,
        native: asBool(docSnap.get("native")),
        platform: asString(docSnap.get("platform")).toLowerCase(),
      }))
      .filter((row) => !!row.token && row.enabled)
      .filter((row) => row.native || row.platform === "web")
      .filter((row) => row.native ? prefs.mobilePushAlertsEnabled : prefs.webPushAlertsEnabled)
      .slice(0, MAX_PUSH_DEVICE_ROWS_PER_USER);

    if (!deviceRows.length) {
      throw new HttpsError("failed-precondition", "No registered device tokens were found for this user.");
    }

    const response = await messaging.sendEachForMulticast({
      tokens: deviceRows.map((row) => row.token),
      notification: {title, body},
      android: {
        priority: "high",
        notification: {
          channelId: "tasklaunch-default",
        },
      },
      data,
    });

    const invalidRows = await cleanupInvalidDeviceTokens(uid, deviceRows, response);

    logger.info("sendPushTest completed", {
      uid,
      databaseId,
      tokenCount: deviceRows.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    return {
      ok: true,
      tokenCount: deviceRows.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokens: invalidRows.map((row) => ({
        deviceId: row.deviceId,
        errorCode: row.errorCode || "unknown",
        errorMessage: row.errorMessage || "Unknown send error",
      })),
    };
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    const message = error instanceof Error && error.message
      ? error.message
      : "Unexpected push send failure.";
    logger.error("sendPushTest failed", {
      uid,
      databaseId,
      region,
      message,
      error,
    });
    throw new HttpsError("internal", `Push test failed: ${message}`, {
      databaseId,
      region,
    });
  }
});

export const syncCurrentUserPlan = onCall(protectedCallableOptions, async (request) => {
  const uid = asString(request.auth?.uid);
  const email = normalizeEmailKey(request.auth?.token?.email);
  logger.info("syncCurrentUserPlan App Check", {
    uid: uid || null,
    email: email || null,
    appId: request.app?.appId || null,
    appCheckAlreadyConsumed: request.app?.alreadyConsumed ?? null,
  });
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to load your plan.");
  }
  try {
    const userRef = db.collection("users").doc(uid);
    const snap = await userRef.get();
    const existingPlan = snap.exists ? asString(snap.get("plan")).toLowerCase() : "";
    if (existingPlan === "free" || existingPlan === "pro") {
      return {ok: true, plan: existingPlan};
    }
    const restoredPlan = await restoreRetainedSubscriptionForUser(uid, email);
    if (restoredPlan === "pro") {
      return {ok: true, plan: restoredPlan, restoredFromRetention: true};
    }
    const plan = await upsertUserPlan(uid, "free");
    return {ok: true, plan};
  } catch (error) {
    const message = error instanceof Error && error.message
      ? error.message
      : "Unexpected plan sync failure.";
    logger.error("syncCurrentUserPlan failed", {
      uid,
      databaseId,
      region,
      message,
      error,
    });
    throw new HttpsError("internal", `Plan sync failed: ${message}`, {
      databaseId,
      region,
    });
  }
});

export const setUserPlanAdmin = onCall(protectedCallableOptions, async (request) => {
  const callerUid = asString(request.auth?.uid);
  const callerEmail = normalizeEmailKey(request.auth?.token?.email);
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in to update a plan.");
  }
  if (!isAdminRequest(request)) {
    throw new HttpsError("permission-denied", "You do not have permission to update plans.");
  }
  const rawData = request.data && typeof request.data === "object" ? request.data : {};
  const targetUid = asString(rawData.uid);
  const targetPlan = normalizePlan(rawData.plan);
  try {
    logger.warn("setUserPlanAdmin requested", {
      callerUid,
      callerEmail,
      targetUid,
      targetPlan,
      authorizedByClaim: request.auth?.token?.taskLaunchAdmin === true || request.auth?.token?.admin === true,
    });
    const plan = await upsertUserPlan(targetUid, targetPlan);
    return {ok: true, uid: targetUid, plan};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error && error.message
      ? error.message
      : "Unexpected admin plan update failure.";
    logger.error("setUserPlanAdmin failed", {
      callerUid,
      callerEmail,
      targetUid,
      targetPlan,
      databaseId,
      region,
      message,
      error,
    });
    throw new HttpsError("internal", `Plan update failed: ${message}`, {
      databaseId,
      region,
    });
  }
});

function extractAndroidDeviceRows(snapshot) {
  return snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      token: asString(docSnap.get("token")),
      enabled: docSnap.get("enabled") !== false,
      native: asBool(docSnap.get("native")),
      provider: asString(docSnap.get("provider")),
      platform: asString(docSnap.get("platform")).toLowerCase(),
      appActive: asBool(docSnap.get("appActive")),
      appStateUpdatedAtMs: asInt(docSnap.get("appStateUpdatedAtMs"), 0),
    }))
    .filter((row) => !!row.token && row.enabled && row.provider === "fcm" && (row.native || row.platform === "web"));
}

function hasFreshForegroundWebDevice(deviceRows, nowMs) {
  return deviceRows.some((row) => !row.native && row.appActive && nowMs - row.appStateUpdatedAtMs <= TASK_TIME_GOAL_ACTIVE_TTL_MS);
}

function hasFreshForegroundNativeDevice(deviceRows, nowMs) {
  return deviceRows.some((row) => row.native && row.appActive && nowMs - row.appStateUpdatedAtMs <= TASK_TIME_GOAL_ACTIVE_TTL_MS);
}

function hasFreshForegroundDevice(deviceRows, nowMs) {
  return deviceRows.some((row) => row.appActive && nowMs - row.appStateUpdatedAtMs <= TASK_TIME_GOAL_ACTIVE_TTL_MS);
}

function splitDeviceRows(deviceRows) {
  const nativeRows = [];
  const webRows = [];
  deviceRows.forEach((row) => {
    if (row.native) nativeRows.push(row);
    else webRows.push(row);
  });
  return {nativeRows, webRows};
}

async function loadUserPushPreferences(uid) {
  const prefSnap = await db.collection("users").doc(uid).collection("preferences").doc("v1").get();
  if (!prefSnap.exists) {
    return {mobilePushAlertsEnabled: false, webPushAlertsEnabled: false};
  }
  const mobilePushAlertsEnabled = prefSnap.get("mobilePushAlertsEnabled") === true;
  const webPushAlertsEnabled =
    typeof prefSnap.get("webPushAlertsEnabled") === "boolean"
      ? prefSnap.get("webPushAlertsEnabled") === true
      : mobilePushAlertsEnabled;
  return {mobilePushAlertsEnabled, webPushAlertsEnabled};
}

function filterDeviceRowsByPushPreferences(deviceRows, prefs) {
  return deviceRows.filter((row) => row.native ? prefs.mobilePushAlertsEnabled : prefs.webPushAlertsEnabled);
}

function buildScheduledPushData(route, payloadData) {
  return {
    ...(asStringMap(payloadData) || {}),
    route: asString(route, "/tasklaunch") || "/tasklaunch",
  };
}

function buildWebPushPayload(route, title, body, payloadData) {
  return {
    notification: {
      title,
      body,
    },
    headers: {
      Urgency: "high",
    },
    fcmOptions: {
      link: asString(route, "/tasklaunch") || "/tasklaunch",
    },
    data: buildScheduledPushData(route, payloadData),
  };
}

function isStaleScheduleDoc(dueAtMs, nowMs) {
  return dueAtMs != null && nowMs - dueAtMs > STALE_SCHEDULE_DOC_TTL_MS;
}

function computeNextPlannedStartDueAtMs(plannedStartDay, plannedStartTime, fromMs) {
  const match = asString(plannedStartTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Math.max(0, Math.min(23, Number(match[1] || 0)));
  const minutes = Math.max(0, Math.min(59, Number(match[2] || 0)));
  const normalizedDay = asString(plannedStartDay).toLowerCase();
  const dayMap = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const next = new Date(fromMs);
  if (Object.prototype.hasOwnProperty.call(dayMap, normalizedDay)) {
    const diffDays = (dayMap[normalizedDay] - next.getDay() + 7) % 7;
    next.setDate(next.getDate() + diffDays);
  }
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= fromMs) {
    next.setDate(next.getDate() + (Object.prototype.hasOwnProperty.call(dayMap, normalizedDay) ? 7 : 1));
  }
  return next.getTime();
}

function normalizePlannedStartByDay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const result = {};
  for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const time = asString(value[day]);
    if (/^\d{1,2}:\d{2}$/.test(time)) result[day] = time;
  }
  return Object.keys(result).length ? result : null;
}

function getPlannedStartEntries(plannedStartDay, plannedStartTime, plannedStartByDay) {
  const byDay = normalizePlannedStartByDay(plannedStartByDay);
  if (byDay) {
    return Object.entries(byDay).map(([day, time]) => ({day, time}));
  }
  const time = asString(plannedStartTime);
  if (!/^\d{1,2}:\d{2}$/.test(time)) return [];
  const day = normalizeScheduleDay(plannedStartDay);
  if (day) return [{day, time}];
  return [{day: "", time}];
}

function computeNextPlannedStartDueAtMsFromSchedule(plannedStartDay, plannedStartTime, plannedStartByDay, fromMs) {
  const entries = getPlannedStartEntries(plannedStartDay, plannedStartTime, plannedStartByDay);
  let nextDueAtMs = null;
  for (const entry of entries) {
    const dueAtMs = computeNextPlannedStartDueAtMs(entry.day, entry.time, fromMs);
    if (dueAtMs != null && (nextDueAtMs == null || dueAtMs < nextDueAtMs)) {
      nextDueAtMs = dueAtMs;
    }
  }
  return nextDueAtMs;
}

function localDayKeyFromMs(ts) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTaskCompletedForScheduleDay(taskData, scheduleMs) {
  const completedDayKey = asString(taskData && taskData.timeGoalCompletedDayKey);
  if (!completedDayKey) return false;
  return completedDayKey === localDayKeyFromMs(scheduleMs);
}

function normalizeWeekStarting(raw) {
  const value = asString(raw).toLowerCase();
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].includes(value) ? value : "mon";
}

function startOfLocalWeekMs(ts, weekStarting) {
  const date = new Date(startOfLocalDayMs(ts));
  const dayMap = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekStartsOn = dayMap[normalizeWeekStarting(weekStarting)] ?? 1;
  const diffDays = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - diffDays);
  return date.getTime();
}

function weekKeyFromMs(ts, weekStarting) {
  return localDayKeyFromMs(startOfLocalWeekMs(ts, weekStarting));
}

function isTaskCompletedForSchedulePeriod(taskData, scheduleMs, weekStarting) {
  const period = asString(taskData && taskData.timeGoalPeriod) === "day" ? "day" : "week";
  if (period === "day") return isTaskCompletedForScheduleDay(taskData, scheduleMs);
  const completedWeekKey = asString(taskData && taskData.timeGoalCompletedWeekKey);
  if (!completedWeekKey) return false;
  return completedWeekKey === weekKeyFromMs(scheduleMs, weekStarting);
}

function normalizeSessionNoteAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const id = asString(item.id);
      const type = asString(item.type).toLowerCase();
      const name = asString(item.name).slice(0, 160);
      const url = asString(item.url);
      if (!id || !name || !url) return null;
      if (!["image", "file"].includes(type)) return null;
      const normalized = {id, type, name, url};
      const size = asInt(item.size, null);
      const mimeType = asString(item.mimeType);
      if (size != null && size >= 0) normalized.size = size;
      if (mimeType) normalized.mimeType = mimeType.slice(0, 120);
      return normalized;
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeHistoryEntry(row) {
  if (!row || typeof row !== "object") return null;
  const entry = {
    ts: Math.max(0, asInt(row.ts, 0) || 0),
    name: asString(row.name, "Task") || "Task",
    ms: Math.max(0, asInt(row.ms, 0) || 0),
  };
  const color = asString(row.color);
  const note = asString(row.note);
  const sessionId = asString(row.sessionId);
  const completionDifficulty = asString(row.completionDifficulty);
  const attachments = normalizeSessionNoteAttachments(row.attachments);
  if (color) entry.color = color;
  if (note) entry.note = note;
  if (sessionId) entry.sessionId = sessionId;
  if (["tiny", "small", "medium", "big"].includes(completionDifficulty)) entry.completionDifficulty = completionDifficulty;
  if (attachments.length) entry.attachments = attachments;
  return entry;
}

function historyEntryIdentityFingerprint(taskId, entry) {
  const normalizedTaskId = asString(taskId);
  const sessionId = asString(entry && entry.sessionId);
  if (sessionId) return `${normalizedTaskId}|session|${sessionId}`;
  const ts = Math.max(0, asInt(entry && entry.ts, 0) || 0);
  const ms = Math.max(0, asInt(entry && entry.ms, 0) || 0);
  const name = asString(entry && entry.name);
  const note = asString(entry && entry.note);
  const color = asString(entry && entry.color);
  const completionDifficulty = asString(entry && entry.completionDifficulty);
  return [normalizedTaskId, ts, ms, name, color, note, completionDifficulty].join("|");
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  const text = String(input || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildCanonicalHistoryEntryDocId(taskId, entry) {
  const normalizedTaskId = asString(taskId);
  const ts = Math.max(0, asInt(entry && entry.ts, 0) || 0);
  const ms = Math.max(0, asInt(entry && entry.ms, 0) || 0);
  const sessionId = asString(entry && entry.sessionId);
  if (sessionId) return `${normalizedTaskId}-session-${fnv1a32(historyEntryIdentityFingerprint(taskId, entry))}`;
  return `${normalizedTaskId}-${ts}-${ms}-${fnv1a32(historyEntryIdentityFingerprint(taskId, entry))}`;
}

function buildHistoryDocPayload(taskId, entry) {
  return {
    taskId,
    ts: Math.max(0, asInt(entry && entry.ts, 0) || 0),
    name: asString(entry && entry.name, "Task") || "Task",
    ms: Math.max(0, asInt(entry && entry.ms, 0) || 0),
    ...(asString(entry && entry.color) ? {color: asString(entry && entry.color)} : {}),
    ...(asString(entry && entry.note) ? {note: asString(entry && entry.note)} : {}),
    ...(asString(entry && entry.sessionId) ? {sessionId: asString(entry && entry.sessionId)} : {}),
    ...(Array.isArray(entry && entry.attachments) && entry.attachments.length ? {attachments: entry.attachments} : {}),
    ...(asString(entry && entry.completionDifficulty) ? {completionDifficulty: asString(entry && entry.completionDifficulty)} : {}),
  };
}

function startOfLocalDayMs(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function nextLocalDayStartMs(ts) {
  const date = new Date(ts);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

function parseScheduleTimeMinutes(raw) {
  const match = asString(raw).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeDayGoalMinutes(taskData) {
  if (taskData.timeGoalEnabled !== true) return null;
  if (asString(taskData.timeGoalPeriod) !== "day") return null;
  const minutes = asInt(taskData.timeGoalMinutes, null);
  return minutes != null && minutes > 0 ? minutes : null;
}

function normalizeScheduleDay(raw) {
  const value = asString(raw).toLowerCase();
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(value) ? value : "";
}

function scheduleDayMatches(day, ts) {
  const normalizedDay = normalizeScheduleDay(day);
  if (!normalizedDay) return true;
  const dayMap = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return dayMap[normalizedDay] === new Date(ts).getDay();
}

function isUnscheduledGapCandidateTask(taskData) {
  return (
    normalizeDayGoalMinutes(taskData) != null &&
    !getPlannedStartEntries(taskData.plannedStartDay, taskData.plannedStartTime, taskData.plannedStartByDay).length &&
    taskData.plannedStartOpenEnded !== true
  );
}

function buildScheduledBlocksForDay(taskRows, ts) {
  return taskRows
    .flatMap((taskData) => {
      const durationMinutes = normalizeDayGoalMinutes(taskData);
      if (durationMinutes == null) return [];
      if (taskData.plannedStartOpenEnded === true) return [];
      return getPlannedStartEntries(taskData.plannedStartDay, taskData.plannedStartTime, taskData.plannedStartByDay)
        .filter((entry) => scheduleDayMatches(entry.day, ts))
        .map((entry) => {
          const startMinutes = parseScheduleTimeMinutes(entry.time);
          if (startMinutes == null) return null;
          const endMinutes = startMinutes + durationMinutes;
          if (endMinutes > 24 * 60) return null;
          return {
            startMinutes,
            endMinutes,
          };
        })
        .filter(Boolean);
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

function findCurrentGap(blocks, nowMs) {
  const dayStartMs = startOfLocalDayMs(nowMs);
  const nowMinutes = Math.max(0, Math.floor((nowMs - dayStartMs) / MINUTE_MS));
  const covering = blocks.find((block) => nowMinutes >= block.startMinutes && nowMinutes < block.endMinutes);
  if (covering) {
    return {
      status: "occupied",
      nextDueAtMs: dayStartMs + (covering.endMinutes * MINUTE_MS),
    };
  }
  const nextBlock = blocks.find((block) => block.startMinutes > nowMinutes);
  if (nextBlock) {
    return {
      status: "gap",
      gapStartMs: nowMs,
      gapEndMs: dayStartMs + (nextBlock.startMinutes * MINUTE_MS),
      nextDueAtMs: dayStartMs + (nextBlock.startMinutes * MINUTE_MS),
    };
  }
  return {
    status: "gap",
    gapStartMs: nowMs,
    gapEndMs: nextLocalDayStartMs(nowMs),
    nextDueAtMs: nextLocalDayStartMs(nowMs),
  };
}

async function activateTaskFromPush(uid, taskId, nowMs) {
  const tasksRef = db.collection("users").doc(uid).collection("tasks");
  const targetRef = tasksRef.doc(taskId);
  const [targetSnap, runningSnap] = await Promise.all([
    targetRef.get(),
    tasksRef.where("running", "==", true).get(),
  ]);
  if (!targetSnap.exists) {
    return {ok: false, reason: "missing-task"};
  }

  const batch = db.batch();
  runningSnap.docs.forEach((docSnap) => {
    const row = docSnap.data() || {};
    const rowId = asString(docSnap.id);
    if (!rowId || rowId === taskId) return;
    const startMs = asInt(row.startMs, null);
    const accumulatedMs = Math.max(0, asInt(row.accumulatedMs, 0) || 0);
    const nextAccumulatedMs = startMs != null ? accumulatedMs + Math.max(0, nowMs - startMs) : accumulatedMs;
    batch.set(docSnap.ref, {
      accumulatedMs: nextAccumulatedMs,
      running: false,
      startMs: null,
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    }, {merge: true});
  });

  batch.set(targetRef, {
    running: true,
    startMs: nowMs,
    hasStarted: true,
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  }, {merge: true});
  await batch.commit();
  return {ok: true};
}

async function hasLoggedTimeToday(uid, taskId, dayStartMs, dayEndMs) {
  const historySnap = await db.collection("users").doc(uid).collection("tasks").doc(taskId)
    .collection("history")
    .where("ts", ">=", dayStartMs)
    .where("ts", "<", dayEndMs)
    .get();
  return historySnap.docs.some((docSnap) => asInt(docSnap.get("ms"), 0) > 0);
}

async function loadUserTimeGoalPreferences(uid) {
  const prefSnap = await db.collection("users").doc(uid).collection("preferences").doc("v1").get();
  return {
    weekStarting: prefSnap.exists ? normalizeWeekStarting(prefSnap.get("weekStarting")) : "mon",
  };
}

async function loadCanonicalTaskHistory(uid, taskId) {
  const historySnap = await db.collection("users").doc(uid).collection("historyEntries")
    .where("taskId", "==", taskId)
    .get();
  return historySnap.docs
    .map((docSnap) => normalizeHistoryEntry(docSnap.data() || {}))
    .filter(Boolean);
}

function sumHistoryMsForPeriod(entries, period, nowMs, weekStarting) {
  const startMs = period === "day" ? startOfLocalDayMs(nowMs) : startOfLocalWeekMs(nowMs, weekStarting);
  const endMs = period === "day" ? nextLocalDayStartMs(nowMs) : startMs + 7 * 24 * 60 * MINUTE_MS;
  return (Array.isArray(entries) ? entries : []).reduce((sum, entry) => {
    const ts = asInt(entry && entry.ts, 0);
    if (ts < startMs || ts >= endMs) return sum;
    return sum + Math.max(0, asInt(entry && entry.ms, 0) || 0);
  }, 0);
}

function resolveTimeGoalCompletionState({taskId, taskData, activeSessionData, historyEntries, nowMs, weekStarting}) {
  const period = asString(taskData && taskData.timeGoalPeriod) === "day" ? "day" : "week";
  const goalMinutes = taskData.timeGoalEnabled === true ? Math.max(0, asNumber(taskData.timeGoalMinutes, 0) || 0) : 0;
  const goalMs = Math.max(0, Math.floor(goalMinutes * MINUTE_MS));
  const startMs = asInt(taskData && taskData.startMs, null);
  const accumulatedMs = Math.max(0, asInt(taskData && taskData.accumulatedMs, 0) || 0);
  if (taskData.running !== true || startMs == null || !(goalMs > 0)) {
    return {status: "inactive", period, goalMs};
  }
  const periodHistoryMs = sumHistoryMsForPeriod(historyEntries, period, nowMs, weekStarting);
  const runningNowMs = Math.max(0, nowMs - startMs);
  const currentContributionNowMs = accumulatedMs + runningNowMs;
  const remainingBeforeCurrentSessionMs = Math.max(0, goalMs - periodHistoryMs);
  const remainingAtStartMs = Math.max(0, remainingBeforeCurrentSessionMs - accumulatedMs);
  const completedAtMs = startMs + remainingAtStartMs;
  const reached = periodHistoryMs + currentContributionNowMs >= goalMs;
  const sessionId = asString(activeSessionData && activeSessionData.sessionId) || `${asString(taskId)}:${startMs}`;
  return {
    status: reached ? "reached" : "pending",
    period,
    goalMs,
    completedAtMs,
    correctedDueAtMs: completedAtMs,
    historyEntryMs: Math.max(0, Math.min(currentContributionNowMs, remainingBeforeCurrentSessionMs)),
    sessionId,
    periodHistoryMs,
  };
}

async function sendScheduledTaskNotification({
  uid,
  nowMs,
  route,
  taskId,
  taskName,
  payloadData,
  webTitle,
  webBody,
  allowWeb = true,
  skipIfForeground = false,
  cleanupInvalidTokens = true,
}) {
  const devicesSnap = await db.collection("users").doc(uid).collection("devices").get();
  const prefs = await loadUserPushPreferences(uid);
  const deviceRows = filterDeviceRowsByPushPreferences(extractAndroidDeviceRows(devicesSnap), prefs)
    .slice(0, MAX_PUSH_DEVICE_ROWS_PER_USER);
  const {nativeRows, webRows} = splitDeviceRows(deviceRows);
  const hasForegroundNativeDevice = hasFreshForegroundNativeDevice(deviceRows, nowMs);
  const pushData = buildScheduledPushData(route, payloadData);
  if (!deviceRows.length) {
    return {status: "no-devices"};
  }
  if (skipIfForeground && hasFreshForegroundDevice(deviceRows, nowMs) && !allowWeb) {
    return {
      status: "foreground",
      successCount: 0,
      failureCount: 0,
      invalidTokenCount: 0,
      failures: [],
      taskId,
      taskName,
    };
  }

  const responses = [];
  const invalidRows = [];

  if (nativeRows.length && !(skipIfForeground && hasForegroundNativeDevice)) {
    const nativeResponse = await messaging.sendEachForMulticast({
      tokens: nativeRows.map((row) => row.token),
      notification: {
        title: webTitle,
        body: webBody,
      },
      android: {
        priority: "high",
        notification: {
          channelId: "tasklaunch-default",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: webTitle,
              body: webBody,
            },
            sound: "default",
          },
        },
      },
      data: pushData,
    });
    responses.push(nativeResponse);
    invalidRows.push(...await cleanupInvalidDeviceTokens(uid, nativeRows, nativeResponse, {
      deleteInvalidTokens: cleanupInvalidTokens,
    }));
  }

  if (allowWeb && webRows.length) {
    const webResponse = await messaging.sendEachForMulticast({
      tokens: webRows.map((row) => row.token),
      notification: {
        title: webTitle,
        body: webBody,
      },
      webpush: buildWebPushPayload(route, webTitle, webBody, payloadData),
      data: pushData,
    });
    responses.push(webResponse);
    invalidRows.push(...await cleanupInvalidDeviceTokens(uid, webRows, webResponse, {
      deleteInvalidTokens: cleanupInvalidTokens,
    }));
  }

  const response = responses.reduce((acc, item) => ({
    successCount: acc.successCount + item.successCount,
    failureCount: acc.failureCount + item.failureCount,
  }), {successCount: 0, failureCount: 0});

  if (!response.successCount && !response.failureCount && skipIfForeground && hasForegroundNativeDevice) {
    return {
      status: "foreground",
      successCount: 0,
      failureCount: 0,
      invalidTokenCount: invalidRows.length,
      failures: invalidRows,
      taskId,
      taskName,
    };
  }

  return {
    status: response.successCount > 0 ? "sent" : "failed",
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokenCount: invalidRows.length,
    failures: invalidRows,
    taskId,
    taskName,
  };
}

function snapshotData(snapshot) {
  if (!snapshot || snapshot.exists === false || typeof snapshot.data !== "function") return null;
  return snapshot.data() || {};
}

async function sendFriendRequestPendingNotification(event) {
  const requestId = asString(event?.params?.requestId);
  const beforeData = snapshotData(event?.data?.before);
  const afterData = snapshotData(event?.data?.after);
  if (!afterData) {
    return {ok: false, status: "missing-after"};
  }

  const status = asString(afterData.status);
  const previousStatus = beforeData ? asString(beforeData.status) : "";
  if (status !== "pending") {
    return {ok: false, status: "not-pending"};
  }
  if (previousStatus === "pending") {
    return {ok: false, status: "already-pending"};
  }
  const receiverUid = asString(afterData.receiverUid);
  if (!receiverUid) {
    return {ok: false, status: "missing-receiver"};
  }

  const normalizedRequestId = asString(afterData.requestId, requestId) || requestId;
  const result = await sendScheduledTaskNotification({
    uid: receiverUid,
    nowMs: Date.now(),
    route: FRIEND_REQUEST_NOTIFICATION_ROUTE,
    taskId: normalizedRequestId,
    taskName: "Friend request",
    payloadData: {
      route: FRIEND_REQUEST_NOTIFICATION_ROUTE,
      requestId: normalizedRequestId,
      type: FRIEND_REQUEST_NOTIFICATION_TYPE,
    },
    webTitle: FRIEND_REQUEST_NOTIFICATION_TITLE,
    webBody: FRIEND_REQUEST_NOTIFICATION_BODY,
    allowWeb: true,
    skipIfForeground: false,
    cleanupInvalidTokens: false,
  });

  logger.info("Friend request push notification processed", {
    requestId: normalizedRequestId,
    receiverUid,
    resultStatus: result.status,
    successCount: result.successCount || 0,
    failureCount: result.failureCount || 0,
    invalidTokenCount: result.invalidTokenCount || 0,
    failures: Array.isArray(result.failures) ? result.failures : [],
  });

  return {
    ok: true,
    requestId: normalizedRequestId,
    ...result,
  };
}

export const notifyFriendRequestPending = onDocumentWritten(
  {
    region,
    database: databaseId,
    document: "friend_requests/{requestId}",
  },
  sendFriendRequestPendingNotification
);

export const sendSharedTaskReminder = onCall(protectedCallableOptions, async (request) => {
  const requesterUid = asString(request.auth?.uid);
  if (!requesterUid) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a task reminder.");
  }

  const rawData = request.data && typeof request.data === "object" ? request.data : {};
  const ownerUid = asString(rawData.ownerUid);
  const taskId = asString(rawData.taskId);
  const nowMs = Date.now();

  if (!ownerUid || !taskId) {
    throw new HttpsError("invalid-argument", "A valid owner and task are required.");
  }
  if (ownerUid === requesterUid) {
    return {ok: false, status: "not-shared"};
  }

  try {
    const [shareSnap, senderResult, taskSnap] = await Promise.all([
      db.collection("shared_task_summaries").doc(sharedTaskSummaryDocId(ownerUid, requesterUid, taskId)).get(),
      resolveFriendReminderSenderName(requesterUid, ownerUid),
      db.collection("users").doc(ownerUid).collection("tasks").doc(taskId).get(),
    ]);

    if (!shareSnap.exists || !senderResult.ok) {
      return {ok: false, status: "not-shared"};
    }
    if (!taskSnap.exists) {
      return {ok: false, status: "missing-task"};
    }

    const taskData = taskSnap.data() || {};
    if (taskData.running === true) {
      return {ok: false, status: "already-running"};
    }

    const taskName = asString(taskData.name || shareSnap.get("taskName"), "Task") || "Task";
    const senderName = senderResult.senderName || "A friend";
    const stateRef = db.collection("shared_task_reminder_state").doc(`${ownerUid}__${taskId}`);
    const cooldown = await db.runTransaction(async (tx) => {
      const stateSnap = await tx.get(stateRef);
      const lastSentAtMs = stateSnap.exists ? asInt(stateSnap.get("lastSentAtMs"), 0) || 0 : 0;
      const nextAllowedAtMs = lastSentAtMs + SHARED_TASK_REMINDER_COOLDOWN_MS;
      if (lastSentAtMs > 0 && nextAllowedAtMs > nowMs) {
        return {blocked: true, nextAllowedAtMs};
      }
      tx.set(stateRef, {
        ownerUid,
        taskId,
        lastSentAtMs: nowMs,
        lastSentByUid: requesterUid,
        lastSenderDisplayName: senderName,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, {merge: true});
      return {blocked: false, nextAllowedAtMs: nowMs + SHARED_TASK_REMINDER_COOLDOWN_MS};
    });
    if (cooldown.blocked) {
      return {ok: false, status: "cooldown", nextAllowedAtMs: cooldown.nextAllowedAtMs};
    }

    const response = await sendScheduledTaskNotification({
      uid: ownerUid,
      nowMs,
      route: "/tasklaunch",
      taskId,
      taskName,
      payloadData: {
        eventType: FRIEND_TASK_REMINDER_EVENT,
        baseEventType: FRIEND_TASK_REMINDER_EVENT,
        effectiveEventType: FRIEND_TASK_REMINDER_EVENT,
        route: "/tasklaunch",
        taskId,
        taskName,
        notificationKind: FRIEND_TASK_REMINDER_NOTIFICATION_KIND,
        requesterUid,
        requesterName: senderName,
        dueAtMs: String(nowMs),
      },
      webTitle: "Task Reminder",
      webBody: `${senderName} reminded you to start ${taskName}.`,
      allowWeb: true,
      skipIfForeground: false,
    });

    if (response.status === "sent") {
      return {ok: true, status: "sent", nextAllowedAtMs: cooldown.nextAllowedAtMs};
    }

    await stateRef.delete().catch(() => {});
    if (response.status === "no-devices") {
      return {ok: false, status: "no-devices"};
    }
    return {ok: false, status: "disabled"};
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const message = error instanceof Error && error.message ? error.message : "Unexpected shared task reminder failure.";
    logger.error("sendSharedTaskReminder failed", {
      requesterUid,
      ownerUid,
      taskId,
      databaseId,
      region,
      message,
      error,
    });
    throw new HttpsError("internal", `Shared task reminder failed: ${message}`, {
      databaseId,
      region,
    });
  }
});

async function processDuePlannedStartTask(docSnap, nowMs) {
  const data = docSnap.data() || {};
  const uid = asString(data.ownerUid);
  const taskId = asString(data.taskId || docSnap.id);
  const dueAtMs = asInt(data.dueAtMs, null);
  const sentDueAtMs = asInt(data.sentDueAtMs, null);
  const eventType = asString(data.eventType);
  const baseEventType = asString(data.baseEventType, PLANNED_START_REMINDER_EVENT) || PLANNED_START_REMINDER_EVENT;
  const effectiveEventType = asString(data.effectiveEventType, eventType || baseEventType) || baseEventType;
  const plannedStartDay = asString(data.plannedStartDay);
  const plannedStartTime = asString(data.plannedStartTime);
  const plannedStartByDay = normalizePlannedStartByDay(data.plannedStartByDay);
  const remindersEnabled = data.plannedStartPushRemindersEnabled !== false;
  const route = asString(data.route, "/tasklaunch") || "/tasklaunch";
  const snoozedUntilMs = asInt(data.snoozedUntilMs, null);
  const isMissedCheck = effectiveEventType === MISSED_SCHEDULED_TASK_EVENT;
  const missedScheduledStartDueAtMs = asInt(data.missedScheduledStartDueAtMs, null);

  if (!uid || !taskId || dueAtMs == null || dueAtMs > nowMs || baseEventType !== PLANNED_START_REMINDER_EVENT) {
    return {status: "skipped"};
  }
  if (isStaleScheduleDoc(dueAtMs, nowMs)) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  if (!remindersEnabled || !getPlannedStartEntries(plannedStartDay, plannedStartTime, plannedStartByDay).length) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }

  const taskSnap = await db.collection("users").doc(uid).collection("tasks").doc(taskId).get();
  if (!taskSnap.exists) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }

  const taskData = taskSnap.data() || {};
  const taskName = asString(taskData.name || data.taskName, "Task");
  const taskRunning = taskData.running === true;
  const taskOpenEnded = taskData.plannedStartOpenEnded === true;
  const taskReminderEnabled = taskData.plannedStartPushRemindersEnabled !== false;
  const taskPlannedStartDay = asString(taskData.plannedStartDay || plannedStartDay);
  const taskPlannedStartTime = asString(taskData.plannedStartTime || plannedStartTime);
  const taskPlannedStartByDay = normalizePlannedStartByDay(taskData.plannedStartByDay) || plannedStartByDay;
  const hasTaskPlannedStart = getPlannedStartEntries(taskPlannedStartDay, taskPlannedStartTime, taskPlannedStartByDay).length > 0;
  const reschedulePlannedStart = async (fromMs) => {
    const nextDueAtMs = computeNextPlannedStartDueAtMsFromSchedule(
      taskPlannedStartDay,
      taskPlannedStartTime,
      taskPlannedStartByDay,
      fromMs
    );
    if (nextDueAtMs != null) {
      await docSnap.ref.set({
        dueAtMs: nextDueAtMs,
        notificationKind: PLANNED_START_NOTIFICATION_KIND,
        eventType: PLANNED_START_REMINDER_EVENT,
        baseEventType: PLANNED_START_REMINDER_EVENT,
        effectiveEventType: PLANNED_START_REMINDER_EVENT,
        plannedStartDay: taskPlannedStartDay || null,
        plannedStartTime: taskPlannedStartTime || null,
        plannedStartByDay: taskPlannedStartByDay || null,
        plannedStartPushRemindersEnabled: true,
        snoozedUntilMs: null,
        missedCheckDueAtMs: null,
        missedScheduledStartDueAtMs: null,
        nextPlannedStartDueAtMs: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    } else {
      await docSnap.ref.delete().catch(() => {});
    }
    return nextDueAtMs;
  };
  if (taskOpenEnded || !taskReminderEnabled || !hasTaskPlannedStart) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  const scheduledOccurrenceMs = missedScheduledStartDueAtMs || (sentDueAtMs != null && sentDueAtMs !== dueAtMs ? sentDueAtMs : dueAtMs);
  if (isMissedCheck || sentDueAtMs === dueAtMs) {
    await reschedulePlannedStart(Math.max(nowMs, nextLocalDayStartMs(scheduledOccurrenceMs)));
    return {status: "skipped"};
  }
  if (localDayKeyFromMs(dueAtMs) !== localDayKeyFromMs(nowMs)) {
    await reschedulePlannedStart(Math.max(nowMs, nextLocalDayStartMs(dueAtMs)));
    return {status: "skipped"};
  }
  if (isTaskCompletedForScheduleDay(taskData, scheduledOccurrenceMs)) {
    await reschedulePlannedStart(nextLocalDayStartMs(scheduledOccurrenceMs));
    return {status: "skipped"};
  }
  const nextDueAtMs = computeNextPlannedStartDueAtMsFromSchedule(taskPlannedStartDay, taskPlannedStartTime, taskPlannedStartByDay, nowMs);
  if (taskRunning) {
    await reschedulePlannedStart(nowMs);
    return {status: "running"};
  }

  const payloadData = {
    eventType: effectiveEventType === PLANNED_START_SNOOZED_EVENT ? PLANNED_START_SNOOZED_EVENT : PLANNED_START_REMINDER_EVENT,
    baseEventType: PLANNED_START_REMINDER_EVENT,
    effectiveEventType: effectiveEventType === PLANNED_START_SNOOZED_EVENT ? PLANNED_START_SNOOZED_EVENT : PLANNED_START_REMINDER_EVENT,
    route,
    taskId,
    taskName,
    notificationKind: PLANNED_START_NOTIFICATION_KIND,
    plannedStartDay: taskPlannedStartDay || "",
    dueAtMs: dueAtMs == null ? "" : String(dueAtMs),
    snoozedUntilMs: snoozedUntilMs == null ? "" : String(snoozedUntilMs),
  };
  const response = await sendScheduledTaskNotification({
    uid,
    nowMs,
    route,
    taskId,
    taskName,
    payloadData,
    webTitle: "Task Reminder",
    webBody: `${taskName} is scheduled to start now.`,
  });
  if (response.successCount > 0) {
    await docSnap.ref.set({
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      dueAtMs: nextDueAtMs,
      notificationKind: PLANNED_START_NOTIFICATION_KIND,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime || null,
      plannedStartByDay: taskPlannedStartByDay || null,
      snoozedUntilMs: null,
      missedCheckDueAtMs: null,
      missedScheduledStartDueAtMs: null,
      nextPlannedStartDueAtMs: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  } else {
    await reschedulePlannedStart(nowMs);
  }

  return response;
}

async function processDueUnscheduledGapTasks(uid, docSnaps, nowMs) {
  const activeDocSnaps = [];
  await Promise.all(docSnaps.map(async (docSnap) => {
    const dueAtMs = asInt((docSnap.data() || {}).dueAtMs, null);
    if (isStaleScheduleDoc(dueAtMs, nowMs)) {
      await docSnap.ref.delete().catch(() => {});
      return;
    }
    activeDocSnaps.push(docSnap);
  }));
  if (!activeDocSnaps.length) return {status: "skipped"};

  const dayStartMs = startOfLocalDayMs(nowMs);
  const dayEndMs = nextLocalDayStartMs(nowMs);
  const todayKey = localDayKeyFromMs(nowMs);
  const tasksSnap = await db.collection("users").doc(uid).collection("tasks").get();
  const taskRows = tasksSnap.docs.map((taskSnap) => ({
    id: taskSnap.id,
    data: taskSnap.data() || {},
  }));

  const runningTask = taskRows.find((row) => row.data.running === true);
  if (runningTask) {
    await Promise.all(activeDocSnaps.map((docSnap) =>
      docSnap.ref.set({
        dueAtMs: nowMs + MINUTE_MS,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true})
    ));
    return {status: "running"};
  }

  const gap = findCurrentGap(buildScheduledBlocksForDay(taskRows.map((row) => row.data), nowMs), nowMs);
  if (gap.status !== "gap") {
    await Promise.all(activeDocSnaps.map((docSnap) =>
      docSnap.ref.set({
        dueAtMs: gap.nextDueAtMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true})
    ));
    return {status: "skipped"};
  }

  const gapDurationMinutes = Math.max(0, Math.floor((gap.gapEndMs - gap.gapStartMs) / MINUTE_MS));
  const docByTaskId = new Map(activeDocSnaps.map((docSnap) => [asString((docSnap.data() || {}).taskId || docSnap.id), docSnap]));
  const eligibleRows = [];
  const deferredDueAtByTaskId = new Map();

  for (const {id, data: taskData} of taskRows) {
    const docSnap = docByTaskId.get(id);
    if (!docSnap) continue;
    const dueAtMs = asInt((docSnap.data() || {}).dueAtMs, null);
    if (dueAtMs == null || dueAtMs > nowMs) continue;
    if (!isUnscheduledGapCandidateTask(taskData)) continue;
    const taskMinutes = normalizeDayGoalMinutes(taskData);
    if (taskMinutes == null || taskMinutes > gapDurationMinutes) continue;
    if (isTaskCompletedForScheduleDay(taskData, nowMs)) {
      deferredDueAtByTaskId.set(id, dayEndMs);
      continue;
    }
    if (await hasLoggedTimeToday(uid, id, dayStartMs, dayEndMs)) {
      deferredDueAtByTaskId.set(id, dayEndMs);
      continue;
    }
    const docData = docSnap.data() || {};
    const lastGapAlertDayKey = asString(docData.lastGapAlertDayKey);
    const postponedGapDayKey = asString(docData.postponedGapDayKey);
    const postponedGapStartMs = asInt(docData.postponedGapStartMs, null);
    const postponedGapEndMs = asInt(docData.postponedGapEndMs, null);
    if (lastGapAlertDayKey === todayKey && postponedGapDayKey !== todayKey) {
      deferredDueAtByTaskId.set(id, dayEndMs);
      continue;
    }
    if (postponedGapDayKey === todayKey && postponedGapStartMs === gap.gapStartMs && postponedGapEndMs === gap.gapEndMs) {
      deferredDueAtByTaskId.set(id, gap.nextDueAtMs);
      continue;
    }
    eligibleRows.push({
      taskId: id,
      taskName: asString(taskData.name, "Task"),
      timeGoalMinutes: taskMinutes,
      docSnap,
    });
  }

  if (!eligibleRows.length) {
    await Promise.all(activeDocSnaps.map((docSnap) =>
      docSnap.ref.set({
        dueAtMs: deferredDueAtByTaskId.get(asString((docSnap.data() || {}).taskId || docSnap.id)) || gap.nextDueAtMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true})
    ));
    return {status: "skipped"};
  }

  eligibleRows.sort((a, b) => {
    if (a.timeGoalMinutes !== b.timeGoalMinutes) return a.timeGoalMinutes - b.timeGoalMinutes;
    return a.taskName.localeCompare(b.taskName);
  });
  const selected = eligibleRows[0];
  const payloadData = {
    eventType: UNSCHEDULED_GAP_REMINDER_EVENT,
    baseEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
    effectiveEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
    route: "/tasklaunch",
    taskId: selected.taskId,
    taskName: selected.taskName,
    notificationKind: UNSCHEDULED_GAP_NOTIFICATION_KIND,
    gapDayKey: todayKey,
    gapStartMs: String(gap.gapStartMs),
    gapEndMs: String(gap.gapEndMs),
  };
  const response = await sendScheduledTaskNotification({
    uid,
    nowMs,
    route: "/tasklaunch",
    taskId: selected.taskId,
    taskName: selected.taskName,
    payloadData,
    webTitle: "Open Gap Available",
    webBody: `You have time to start ${selected.taskName} before your next scheduled task.`,
    allowWeb: false,
  });

  if (response.status === "sent") {
    await selected.docSnap.ref.set({
      notificationKind: UNSCHEDULED_GAP_NOTIFICATION_KIND,
      eventType: UNSCHEDULED_GAP_REMINDER_EVENT,
      baseEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
      effectiveEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
      dueAtMs: dayEndMs,
      timeGoalMinutes: selected.timeGoalMinutes,
      sentAtMs: nowMs,
      sentDueAtMs: asInt((selected.docSnap.data() || {}).dueAtMs, null),
      activeGapDayKey: todayKey,
      activeGapStartMs: gap.gapStartMs,
      activeGapEndMs: gap.gapEndMs,
      lastGapAlertDayKey: todayKey,
      lastGapAlertStartMs: gap.gapStartMs,
      lastGapAlertEndMs: gap.gapEndMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    await Promise.all(
      eligibleRows
        .slice(1)
        .map((row) =>
          row.docSnap.ref.set({
            dueAtMs: gap.nextDueAtMs,
            activeGapDayKey: todayKey,
            activeGapStartMs: gap.gapStartMs,
            activeGapEndMs: gap.gapEndMs,
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true})
        )
    );
  }

  return response;
}

async function processDueTimeGoalCompleteTask(docSnap, nowMs) {
  const data = docSnap.data() || {};
  const uid = asString(data.ownerUid);
  const taskId = asString(data.taskId || docSnap.id);
  const dueAtMs = asInt(data.dueAtMs, null);
  const sentDueAtMs = asInt(data.sentDueAtMs, null);
  const route = asString(data.route, "/tasklaunch") || "/tasklaunch";

  if (!uid || !taskId || dueAtMs == null || dueAtMs > nowMs) {
    return {status: "skipped"};
  }
  if (isStaleScheduleDoc(dueAtMs, nowMs)) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  if (sentDueAtMs != null && sentDueAtMs === dueAtMs) {
    return {status: "duplicate"};
  }

  const userRef = db.collection("users").doc(uid);
  const taskRef = userRef.collection("tasks").doc(taskId);
  const activeSessionRef = taskRef.collection("activeSession").doc("current");
  const [taskSnap, activeSessionSnap, prefs, historyEntries] = await Promise.all([
    taskRef.get(),
    activeSessionRef.get(),
    loadUserTimeGoalPreferences(uid),
    loadCanonicalTaskHistory(uid, taskId),
  ]);
  if (!taskSnap.exists) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }

  const taskData = taskSnap.data() || {};
  const taskName = asString(taskData.name || data.taskName, "Task");
  const weekStarting = normalizeWeekStarting(data.weekStarting || prefs.weekStarting);
  if (isTaskCompletedForSchedulePeriod(taskData, dueAtMs, weekStarting)) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }

  const completion = resolveTimeGoalCompletionState({
    taskId,
    taskData,
    activeSessionData: activeSessionSnap.exists ? activeSessionSnap.data() || {} : null,
    historyEntries,
    nowMs,
    weekStarting,
  });
  if (completion.status === "inactive") {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  if (completion.status === "pending") {
    await docSnap.ref.set({
      dueAtMs: completion.correctedDueAtMs,
      timeGoalPeriod: completion.period,
      timeGoalGoalMs: completion.goalMs,
      timeGoalCompletionDayKey: localDayKeyFromMs(completion.correctedDueAtMs),
      timeGoalCompletionWeekKey: weekKeyFromMs(completion.correctedDueAtMs, weekStarting),
      weekStarting,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {status: "skipped"};
  }

  const entry = normalizeHistoryEntry({
    ts: completion.completedAtMs,
    name: taskName,
    ms: completion.historyEntryMs,
    color: taskData.color || (activeSessionSnap.exists ? activeSessionSnap.get("color") : null),
    note: activeSessionSnap.exists ? activeSessionSnap.get("note") : null,
    attachments: activeSessionSnap.exists ? activeSessionSnap.get("attachments") : null,
    sessionId: completion.sessionId,
  });
  const batch = db.batch();
  if (entry && entry.ms > 0) {
    const historyDocId = buildCanonicalHistoryEntryDocId(taskId, entry);
    const historyRef = userRef.collection("historyEntries").doc(historyDocId);
    batch.set(historyRef, {
      ...buildHistoryDocPayload(taskId, entry),
      createdAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }
  batch.set(taskRef, {
    accumulatedMs: 0,
    running: false,
    startMs: null,
    hasStarted: false,
    resumePendingSinceDayKey: null,
    timeGoalCompletedDayKey: localDayKeyFromMs(completion.completedAtMs),
    timeGoalCompletedWeekKey: weekKeyFromMs(completion.completedAtMs, weekStarting),
    timeGoalCompletedAtMs: completion.completedAtMs,
    timeGoalCompletedReason: "goal",
    timeGoalCompletedElapsedMs: completion.goalMs,
    bgTimeGoalPushEligible: false,
    bgTimeGoalPushDueAtMs: null,
    bgTimeGoalPushSentAtMs: null,
    bgTimeGoalPushSentDueAtMs: null,
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  }, {merge: true});
  batch.delete(activeSessionRef);
  batch.delete(docSnap.ref);
  await batch.commit();

  const payloadData = {
    eventType: TIME_GOAL_COMPLETE_EVENT,
    baseEventType: TIME_GOAL_COMPLETE_EVENT,
    effectiveEventType: TIME_GOAL_COMPLETE_EVENT,
    route,
    taskId,
    taskName,
    notificationKind: TIME_GOAL_COMPLETE_NOTIFICATION_KIND,
    dueAtMs: String(completion.completedAtMs),
    timeGoalPeriod: completion.period,
    timeGoalGoalMs: String(completion.goalMs),
    timeGoalCompletionDayKey: localDayKeyFromMs(completion.completedAtMs),
    timeGoalCompletionWeekKey: weekKeyFromMs(completion.completedAtMs, weekStarting),
  };
  const response = await sendScheduledTaskNotification({
    uid,
    nowMs,
    route,
    taskId,
    taskName,
    payloadData,
    webTitle: "Time Goal Reached",
    webBody: `Return to TaskLaunch to view XP awarded for ${taskName}.`,
    allowWeb: true,
    skipIfForeground: false,
  });
  return response;
}

export const applyScheduledPushAction = onCall(protectedCallableOptions, async (request) => {
  const uid = asString(request.auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to apply a push action.");
  }

  const rawData = request.data && typeof request.data === "object" ? request.data : {};
  const actionId = asString(rawData.actionId);
  const taskId = asString(rawData.taskId);
  const route = asString(rawData.route, "/tasklaunch") || "/tasklaunch";
  const deviceId = asString(rawData.deviceId);
  const nowMs = Date.now();

  if (!taskId) {
    throw new HttpsError("invalid-argument", "A valid task id is required.");
  }
  if (
    actionId !== PUSH_ACTION_LAUNCH_TASK &&
    actionId !== PUSH_ACTION_SNOOZE_10M &&
    actionId !== PUSH_ACTION_POSTPONE_NEXT_GAP
  ) {
    throw new HttpsError("invalid-argument", "Unsupported push action.");
  }

  const scheduledRef = db.collection("scheduled_time_goal_pushes").doc(`${uid}__${taskId}`);
  const scheduledSnap = await scheduledRef.get();
  if (!scheduledSnap.exists) {
    return {ok: true, applied: false, reason: "missing-schedule"};
  }

  const data = scheduledSnap.data() || {};
  const plannedStartDay = asString(data.plannedStartDay);
  const plannedStartTime = asString(data.plannedStartTime);
  const plannedStartByDay = normalizePlannedStartByDay(data.plannedStartByDay);
  const dueAtMs = asInt(data.dueAtMs, null);
  const remindersEnabled = data.plannedStartPushRemindersEnabled !== false;
  const eventType = asString(data.eventType, PLANNED_START_REMINDER_EVENT) || PLANNED_START_REMINDER_EVENT;
  const baseEventType = asString(data.baseEventType, eventType) || eventType;
  const notificationKind = asString(data.notificationKind);

  const taskSnap = await db.collection("users").doc(uid).collection("tasks").doc(taskId).get();
  if (!taskSnap.exists) {
    await scheduledRef.delete().catch(() => {});
    return {ok: true, applied: false, reason: "missing-task"};
  }
  const taskData = taskSnap.data() || {};
  const taskRunning = taskData.running === true;
  const taskOpenEnded = taskData.plannedStartOpenEnded === true;
  const taskReminderEnabled = taskData.plannedStartPushRemindersEnabled !== false;
  const taskPlannedStartDay = asString(taskData.plannedStartDay || plannedStartDay);
  const taskPlannedStartTime = asString(taskData.plannedStartTime || plannedStartTime);
  const taskPlannedStartByDay = normalizePlannedStartByDay(taskData.plannedStartByDay) || plannedStartByDay;
  const taskHasPlannedStart = getPlannedStartEntries(taskPlannedStartDay, taskPlannedStartTime, taskPlannedStartByDay).length > 0;

  if (baseEventType === UNSCHEDULED_GAP_REMINDER_EVENT) {
    if (!isUnscheduledGapCandidateTask(taskData)) {
      await scheduledRef.delete().catch(() => {});
      return {ok: true, applied: false, reason: "disabled"};
    }
    if (actionId === PUSH_ACTION_POSTPONE_NEXT_GAP) {
      const activeGapDayKey = asString(data.activeGapDayKey);
      const activeGapStartMs = asInt(data.activeGapStartMs, null);
      const activeGapEndMs = asInt(data.activeGapEndMs, null);
      const nextDueAtMs = activeGapEndMs != null ? activeGapEndMs : nextLocalDayStartMs(nowMs);
      await scheduledRef.set({
        route,
        notificationKind: notificationKind || UNSCHEDULED_GAP_NOTIFICATION_KIND,
        eventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        baseEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        effectiveEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        dueAtMs: nextDueAtMs,
        postponedGapDayKey: activeGapDayKey || localDayKeyFromMs(nowMs),
        postponedGapStartMs: activeGapStartMs,
        postponedGapEndMs: activeGapEndMs,
        lastActionAtMs: nowMs,
        lastActionByDeviceId: deviceId || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {ok: true, applied: true, actionId, dueAtMs: nextDueAtMs};
    }
  if (actionId === PUSH_ACTION_LAUNCH_TASK) {
    const activation = await activateTaskFromPush(uid, taskId, nowMs);
    if (!activation.ok) {
      return {ok: true, applied: false, reason: activation.reason || "missing-task"};
    }
    await scheduledRef.set({
      route,
      notificationKind: notificationKind || UNSCHEDULED_GAP_NOTIFICATION_KIND,
        eventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        baseEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        effectiveEventType: UNSCHEDULED_GAP_REMINDER_EVENT,
        lastActionAtMs: nowMs,
        lastActionByDeviceId: deviceId || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      return {ok: true, applied: true, actionId};
    }
    return {ok: true, applied: false, reason: "unsupported-action"};
  }

  if (!remindersEnabled || !taskReminderEnabled || taskOpenEnded || !taskHasPlannedStart || baseEventType !== PLANNED_START_REMINDER_EVENT) {
    await scheduledRef.delete().catch(() => {});
    return {ok: true, applied: false, reason: "disabled"};
  }

  if (taskRunning) {
    const nextDueAtMs = computeNextPlannedStartDueAtMsFromSchedule(taskPlannedStartDay, taskPlannedStartTime, taskPlannedStartByDay, nowMs);
    await scheduledRef.set({
      dueAtMs: nextDueAtMs,
      notificationKind: PLANNED_START_NOTIFICATION_KIND,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime || null,
      plannedStartByDay: taskPlannedStartByDay || null,
      snoozedUntilMs: null,
      missedCheckDueAtMs: null,
      missedScheduledStartDueAtMs: null,
      nextPlannedStartDueAtMs: null,
      lastActionAtMs: nowMs,
      lastActionByDeviceId: deviceId || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {ok: true, applied: false, reason: "running"};
  }

  if (actionId === PUSH_ACTION_LAUNCH_TASK) {
    const activation = await activateTaskFromPush(uid, taskId, nowMs);
    if (!activation.ok) {
      return {ok: true, applied: false, reason: activation.reason || "missing-task"};
    }
    const nextDueAtMs = computeNextPlannedStartDueAtMsFromSchedule(taskPlannedStartDay, taskPlannedStartTime, taskPlannedStartByDay, nowMs);
    await scheduledRef.set({
      dueAtMs: nextDueAtMs,
      notificationKind: PLANNED_START_NOTIFICATION_KIND,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime || null,
      plannedStartByDay: taskPlannedStartByDay || null,
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      snoozedUntilMs: null,
      missedCheckDueAtMs: null,
      missedScheduledStartDueAtMs: null,
      nextPlannedStartDueAtMs: null,
      lastActionAtMs: nowMs,
      lastActionByDeviceId: deviceId || null,
      route,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {ok: true, applied: true, actionId, dueAtMs: nextDueAtMs};
  }

  const snoozedUntilMs = nowMs + PUSH_ACTION_SNOOZE_MS;
  await scheduledRef.set({
    dueAtMs: snoozedUntilMs,
    route,
    notificationKind: PLANNED_START_NOTIFICATION_KIND,
    eventType: PLANNED_START_SNOOZED_EVENT,
    baseEventType: PLANNED_START_REMINDER_EVENT,
    effectiveEventType: PLANNED_START_SNOOZED_EVENT,
    plannedStartDay: taskPlannedStartDay || null,
    plannedStartTime: taskPlannedStartTime || null,
    plannedStartByDay: taskPlannedStartByDay || null,
    snoozedUntilMs,
    sentAtMs: null,
    sentDueAtMs: null,
    missedCheckDueAtMs: null,
    missedScheduledStartDueAtMs: null,
    nextPlannedStartDueAtMs: null,
    lastActionAtMs: nowMs,
    lastActionByDeviceId: deviceId || null,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return {ok: true, applied: true, actionId, dueAtMs: snoozedUntilMs};
});

export const sendDueTimeGoalPushes = onSchedule(
  {
    region,
    schedule: "every 1 minutes",
    timeoutSeconds: 300,
  },
  async () => {
    const nowMs = Date.now();
    let dueSnap;
    try {
      dueSnap = await db.collection("scheduled_time_goal_pushes")
        .where("dueAtMs", "<=", nowMs)
        .orderBy("dueAtMs", "asc")
        .limit(MAX_DUE_PUSH_DOCS_PER_TICK)
        .get();
    } catch (error) {
      logger.error("sendDueTimeGoalPushes schedule query failed", {
        databaseId,
        nowMs,
        code: error && typeof error === "object" && "code" in error ? error.code : null,
        message: error instanceof Error ? error.message : "Unknown query failure",
        details: error && typeof error === "object" && "details" in error ? error.details : null,
        error,
      });
      throw error;
    }

    let sentCount = 0;
    let duplicateCount = 0;
    let skippedCount = 0;
    let foregroundCount = 0;
    let noDeviceCount = 0;
    const plannedDocs = [];
    const unscheduledByUid = new Map();

    dueSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const baseEventType = asString(data.baseEventType, asString(data.eventType));
      if (baseEventType === TIME_GOAL_COMPLETE_EVENT) {
        plannedDocs.push(docSnap);
        return;
      }
      if (baseEventType === UNSCHEDULED_GAP_REMINDER_EVENT) {
        const uid = asString(data.ownerUid);
        if (!uid) return;
        const existing = unscheduledByUid.get(uid) || [];
        existing.push(docSnap);
        unscheduledByUid.set(uid, existing);
        return;
      }
      plannedDocs.push(docSnap);
    });

    for (const docSnap of plannedDocs) {
      try {
        const data = docSnap.data() || {};
        const baseEventType = asString(data.baseEventType, asString(data.eventType));
        const result = baseEventType === TIME_GOAL_COMPLETE_EVENT
          ? await processDueTimeGoalCompleteTask(docSnap, nowMs)
          : await processDuePlannedStartTask(docSnap, nowMs);
        if (result.status === "sent") sentCount += 1;
        else if (result.status === "duplicate") duplicateCount += 1;
        else if (result.status === "foreground") foregroundCount += 1;
        else if (result.status === "no-devices") noDeviceCount += 1;
        else skippedCount += 1;
      } catch (error) {
        logger.error("sendDueTimeGoalPushes task processing failed", {
          path: docSnap.ref.path,
          message: error instanceof Error ? error.message : "Unknown error",
          error,
        });
      }
    }

    for (const [uid, docSnaps] of unscheduledByUid.entries()) {
      try {
        const result = await processDueUnscheduledGapTasks(uid, docSnaps, nowMs);
        if (result.status === "sent") sentCount += 1;
        else if (result.status === "foreground") foregroundCount += 1;
        else if (result.status === "no-devices") noDeviceCount += 1;
        else skippedCount += 1;
      } catch (error) {
        logger.error("sendDueTimeGoalPushes unscheduled-gap processing failed", {
          uid,
          docCount: docSnaps.length,
          message: error instanceof Error ? error.message : "Unknown error",
          error,
        });
      }
    }

    logger.info("sendDueTimeGoalPushes completed", {
      databaseId,
      dueCount: dueSnap.size,
      sentCount,
      duplicateCount,
      foregroundCount,
      noDeviceCount,
      skippedCount,
    });
  }
);

export const __testing = {
  buildScheduledPushData,
  buildWebPushPayload,
  buildScheduledBlocksForDay,
  extractAndroidDeviceRows,
  isUnscheduledGapCandidateTask,
  sendFriendRequestPendingNotification,
  sendScheduledTaskNotification,
  processDuePlannedStartTask,
  processDueTimeGoalCompleteTask,
};
