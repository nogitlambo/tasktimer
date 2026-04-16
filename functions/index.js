import {getApp, getApps, initializeApp} from "firebase-admin/app";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";

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
const UNSCHEDULED_GAP_REMINDER_EVENT = "unscheduledGapReminder";
const UNSCHEDULED_GAP_NOTIFICATION_KIND = "unscheduledGap";
const TIME_GOAL_COMPLETE_EVENT = "timeGoalComplete";
const TIME_GOAL_COMPLETE_NOTIFICATION_KIND = "timeGoalComplete";
const PUSH_ACTION_LAUNCH_TASK = "launchTask";
const PUSH_ACTION_SNOOZE_10M = "snooze10m";
const PUSH_ACTION_POSTPONE_NEXT_GAP = "postponeNextGap";
const MINUTE_MS = 60 * 1000;
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

const ADMIN_ACCOUNT_EMAIL = "aniven82@gmail.com";

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
  return normalizeEmailKey(email) === ADMIN_ACCOUNT_EMAIL;
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

async function cleanupInvalidDeviceTokens(uid, deviceRows, response) {
  const invalidRows = response.responses
    .map((item, index) => ({
      success: item.success,
      errorCode: item.error?.code || "",
      errorMessage: item.error?.message || "",
      deviceId: deviceRows[index]?.id || "",
    }))
    .filter((row) => !row.success);

  const removableCodes = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
  ]);

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

  return invalidRows;
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
      .filter((row) => row.native ? prefs.mobilePushAlertsEnabled : prefs.webPushAlertsEnabled);

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

export const setUserPlanAdmin = onCall({region}, async (request) => {
  const callerUid = asString(request.auth?.uid);
  const callerEmail = normalizeEmailKey(request.auth?.token?.email);
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in to update a plan.");
  }
  if (!isAdminAccountEmail(callerEmail)) {
    throw new HttpsError("permission-denied", "You do not have permission to update plans.");
  }
  const rawData = request.data && typeof request.data === "object" ? request.data : {};
  const targetUid = asString(rawData.uid);
  const targetPlan = normalizePlan(rawData.plan);
  try {
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

function localDayKeyFromMs(ts) {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    !asString(taskData.plannedStartTime) &&
    !normalizeScheduleDay(taskData.plannedStartDay) &&
    taskData.plannedStartOpenEnded !== true
  );
}

function buildScheduledBlocksForDay(taskRows, ts) {
  return taskRows
    .map((taskData) => {
      const durationMinutes = normalizeDayGoalMinutes(taskData);
      const startMinutes = parseScheduleTimeMinutes(taskData.plannedStartTime);
      if (durationMinutes == null || startMinutes == null) return null;
      if (taskData.plannedStartOpenEnded === true) return null;
      if (!scheduleDayMatches(taskData.plannedStartDay, ts)) return null;
      const endMinutes = startMinutes + durationMinutes;
      if (endMinutes > 24 * 60) return null;
      return {
        startMinutes,
        endMinutes,
      };
    })
    .filter(Boolean)
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
}) {
  const devicesSnap = await db.collection("users").doc(uid).collection("devices").get();
  const prefs = await loadUserPushPreferences(uid);
  const deviceRows = filterDeviceRowsByPushPreferences(extractAndroidDeviceRows(devicesSnap), prefs);
  const {nativeRows, webRows} = splitDeviceRows(deviceRows);
  const hasForegroundWebDevice = hasFreshForegroundWebDevice(deviceRows, nowMs);
  if (!deviceRows.length) {
    return {status: "no-devices"};
  }
  if (skipIfForeground && hasFreshForegroundDevice(deviceRows, nowMs)) {
    return {
      status: "foreground",
      successCount: 0,
      failureCount: 0,
      invalidTokenCount: 0,
      taskId,
      taskName,
    };
  }

  const responses = [];
  const invalidRows = [];

  if (nativeRows.length) {
    const nativeResponse = await messaging.sendEachForMulticast({
      tokens: nativeRows.map((row) => row.token),
      android: {
        priority: "high",
      },
      data: payloadData,
    });
    responses.push(nativeResponse);
    invalidRows.push(...await cleanupInvalidDeviceTokens(uid, nativeRows, nativeResponse));
  }

  if (allowWeb && webRows.length && !hasForegroundWebDevice) {
    const webResponse = await messaging.sendEachForMulticast({
      tokens: webRows.map((row) => row.token),
      notification: {
        title: webTitle,
        body: webBody,
      },
      webpush: {
        notification: {
          title: webTitle,
          body: webBody,
        },
        fcmOptions: {
          link: route,
        },
      },
      data: payloadData,
    });
    responses.push(webResponse);
    invalidRows.push(...await cleanupInvalidDeviceTokens(uid, webRows, webResponse));
  }

  const response = responses.reduce((acc, item) => ({
    successCount: acc.successCount + item.successCount,
    failureCount: acc.failureCount + item.failureCount,
  }), {successCount: 0, failureCount: 0});

  if (!response.successCount && !response.failureCount && hasForegroundWebDevice) {
    return {
      status: nativeRows.length ? "sent" : "foreground",
      successCount: 0,
      failureCount: 0,
      invalidTokenCount: invalidRows.length,
      taskId,
      taskName,
    };
  }

  return {
    status: response.successCount > 0 ? "sent" : "failed",
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokenCount: invalidRows.length,
    taskId,
    taskName,
  };
}

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
  const remindersEnabled = data.plannedStartPushRemindersEnabled !== false;
  const route = asString(data.route, "/tasklaunch") || "/tasklaunch";
  const snoozedUntilMs = asInt(data.snoozedUntilMs, null);

  if (!uid || !taskId || dueAtMs == null || dueAtMs > nowMs || baseEventType !== PLANNED_START_REMINDER_EVENT) {
    return {status: "skipped"};
  }
  if (sentDueAtMs != null && sentDueAtMs === dueAtMs) {
    return {status: "duplicate"};
  }
  if (!remindersEnabled || !plannedStartTime) {
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
  if (taskOpenEnded || !taskReminderEnabled || !taskPlannedStartTime) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  if (taskRunning) {
    const nextRunningDueAtMs = computeNextPlannedStartDueAtMs(taskPlannedStartDay, taskPlannedStartTime, nowMs);
    if (nextRunningDueAtMs != null) {
      await docSnap.ref.set({
        dueAtMs: nextRunningDueAtMs,
        eventType: PLANNED_START_REMINDER_EVENT,
        baseEventType: PLANNED_START_REMINDER_EVENT,
        effectiveEventType: PLANNED_START_REMINDER_EVENT,
        plannedStartDay: taskPlannedStartDay || null,
        plannedStartTime: taskPlannedStartTime,
        plannedStartPushRemindersEnabled: true,
        snoozedUntilMs: null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
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
  const nextDueAtMs = computeNextPlannedStartDueAtMs(taskPlannedStartDay, taskPlannedStartTime, nowMs);
  if (response.successCount > 0) {
    await docSnap.ref.set({
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      dueAtMs: nextDueAtMs,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime,
      snoozedUntilMs: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  return response;
}

async function processDueUnscheduledGapTasks(uid, docSnaps, nowMs) {
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
    await Promise.all(docSnaps.map((docSnap) =>
      docSnap.ref.set({
        dueAtMs: nowMs + MINUTE_MS,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true})
    ));
    return {status: "running"};
  }

  const gap = findCurrentGap(buildScheduledBlocksForDay(taskRows.map((row) => row.data), nowMs), nowMs);
  if (gap.status !== "gap") {
    await Promise.all(docSnaps.map((docSnap) =>
      docSnap.ref.set({
        dueAtMs: gap.nextDueAtMs,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true})
    ));
    return {status: "skipped"};
  }

  const gapDurationMinutes = Math.max(0, Math.floor((gap.gapEndMs - gap.gapStartMs) / MINUTE_MS));
  const docByTaskId = new Map(docSnaps.map((docSnap) => [asString((docSnap.data() || {}).taskId || docSnap.id), docSnap]));
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
    await Promise.all(docSnaps.map((docSnap) =>
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
  if (sentDueAtMs != null && sentDueAtMs === dueAtMs) {
    return {status: "duplicate"};
  }

  const taskSnap = await db.collection("users").doc(uid).collection("tasks").doc(taskId).get();
  if (!taskSnap.exists) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }

  const taskData = taskSnap.data() || {};
  const taskName = asString(taskData.name || data.taskName, "Task");
  const startMs = asInt(taskData.startMs, null);
  const accumulatedMs = Math.max(0, asInt(taskData.accumulatedMs, 0) || 0);
  const goalMinutes = taskData.timeGoalEnabled === true ? Math.max(0, asNumber(taskData.timeGoalMinutes, 0) || 0) : 0;
  const goalMs = goalMinutes * MINUTE_MS;

  if (taskData.running !== true || startMs == null || !(goalMs > 0)) {
    await docSnap.ref.delete().catch(() => {});
    return {status: "skipped"};
  }
  if (accumulatedMs + Math.max(0, nowMs - startMs) < goalMs) {
    await docSnap.ref.set({
      dueAtMs: startMs + Math.max(0, goalMs - accumulatedMs),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    return {status: "skipped"};
  }

  const payloadData = {
    eventType: TIME_GOAL_COMPLETE_EVENT,
    baseEventType: TIME_GOAL_COMPLETE_EVENT,
    effectiveEventType: TIME_GOAL_COMPLETE_EVENT,
    route,
    taskId,
    taskName,
    notificationKind: TIME_GOAL_COMPLETE_NOTIFICATION_KIND,
    dueAtMs: String(dueAtMs),
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
    allowWeb: false,
    skipIfForeground: true,
  });

  if (response.status === "sent" || response.status === "foreground") {
    await docSnap.ref.set({
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

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

  if (!remindersEnabled || !taskReminderEnabled || taskOpenEnded || !taskPlannedStartTime || baseEventType !== PLANNED_START_REMINDER_EVENT) {
    await scheduledRef.delete().catch(() => {});
    return {ok: true, applied: false, reason: "disabled"};
  }

  if (taskRunning) {
    const nextDueAtMs = computeNextPlannedStartDueAtMs(taskPlannedStartDay, taskPlannedStartTime, nowMs);
    await scheduledRef.set({
      dueAtMs: nextDueAtMs,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime,
      snoozedUntilMs: null,
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
    const nextDueAtMs = computeNextPlannedStartDueAtMs(taskPlannedStartDay, taskPlannedStartTime, nowMs);
    await scheduledRef.set({
      dueAtMs: nextDueAtMs,
      eventType: PLANNED_START_REMINDER_EVENT,
      baseEventType: PLANNED_START_REMINDER_EVENT,
      effectiveEventType: PLANNED_START_REMINDER_EVENT,
      plannedStartDay: taskPlannedStartDay || null,
      plannedStartTime: taskPlannedStartTime,
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      snoozedUntilMs: null,
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
    eventType: PLANNED_START_SNOOZED_EVENT,
    baseEventType: PLANNED_START_REMINDER_EVENT,
    effectiveEventType: PLANNED_START_SNOOZED_EVENT,
    plannedStartDay: taskPlannedStartDay || null,
    plannedStartTime: taskPlannedStartTime,
    snoozedUntilMs,
    sentAtMs: null,
    sentDueAtMs: null,
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
