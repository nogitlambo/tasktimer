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

function asString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asInt(value, fallback = null) {
  return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : fallback;
}

function asBool(value) {
  return value === true;
}

function normalizePlan(value) {
  return String(value || "").trim().toLowerCase() === "pro" ? "pro" : "free";
}

function planAdminUids() {
  return String(process.env.TASKTIMER_PLAN_ADMIN_UIDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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

export const sendPushTest = onCall({region}, async (request) => {
  const uid = asString(request.auth?.uid);
  if (!uid) {
    throw new HttpsError("unauthenticated", "You must be signed in to send a push test.");
  }

  try {
    const rawData = request.data && typeof request.data === "object" ? request.data : {};
    const title = asString(rawData.title, "TaskLaunch Test") || "TaskLaunch Test";
    const body = asString(rawData.body, "Push messaging is configured correctly.") || "Push messaging is configured correctly.";
    const data = asStringMap(rawData.data);

    const snapshot = await db.collection("users").doc(uid).collection("devices").get();
    const deviceRows = snapshot.docs
      .map((docSnap) => ({
        id: docSnap.id,
        token: asString(docSnap.get("token")),
      }))
      .filter((row) => !!row.token);

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

export const syncCurrentUserPlan = onCall({region}, async (request) => {
  const uid = asString(request.auth?.uid);
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
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "You must be signed in to update a plan.");
  }
  const adminUids = planAdminUids();
  if (!adminUids.includes(callerUid)) {
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
      native: asBool(docSnap.get("native")),
      provider: asString(docSnap.get("provider")),
      platform: asString(docSnap.get("platform")).toLowerCase(),
      appActive: asBool(docSnap.get("appActive")),
      appStateUpdatedAtMs: asInt(docSnap.get("appStateUpdatedAtMs"), 0),
    }))
    .filter((row) => !!row.token && row.native && row.provider === "fcm" && row.platform === "android");
}

function hasFreshForegroundDevice(deviceRows, nowMs) {
  return deviceRows.some((row) => row.appActive && nowMs - row.appStateUpdatedAtMs <= TASK_TIME_GOAL_ACTIVE_TTL_MS);
}

async function processDueTimeGoalTask(docSnap, nowMs) {
  const data = docSnap.data() || {};
  const uid = asString(data.ownerUid);
  const taskId = asString(data.taskId || docSnap.id);
  const taskName = asString(data.taskName, "Task");
  const dueAtMs = asInt(data.dueAtMs, null);
  const sentDueAtMs = asInt(data.sentDueAtMs, null);
  const timeGoalMinutes = Number(data.timeGoalMinutes || 0);
  const route = asString(data.route, "/tasklaunch") || "/tasklaunch";

  if (!uid || !taskId || !(timeGoalMinutes > 0) || dueAtMs == null || dueAtMs > nowMs) {
    return {status: "skipped"};
  }
  if (sentDueAtMs != null && sentDueAtMs === dueAtMs) {
    return {status: "duplicate"};
  }

  const devicesSnap = await db.collection("users").doc(uid).collection("devices").get();
  const deviceRows = extractAndroidDeviceRows(devicesSnap);
  if (!deviceRows.length) {
    return {status: "no-devices"};
  }
  if (hasFreshForegroundDevice(deviceRows, nowMs)) {
    return {status: "foreground"};
  }

  const response = await messaging.sendEachForMulticast({
    tokens: deviceRows.map((row) => row.token),
    notification: {
      title: "Time Goal Reached",
      body: `${taskName} reached its time goal.`,
    },
    android: {
      priority: "high",
      notification: {
        channelId: "tasklaunch-default",
      },
    },
    data: {
      eventType: "timeGoalReached",
      route,
      taskId,
      taskName,
    },
  });

  const invalidRows = await cleanupInvalidDeviceTokens(uid, deviceRows, response);
  if (response.successCount > 0) {
    await docSnap.ref.set({
      sentAtMs: nowMs,
      sentDueAtMs: dueAtMs,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  return {
    status: response.successCount > 0 ? "sent" : "failed",
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokenCount: invalidRows.length,
  };
}

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

    for (const docSnap of dueSnap.docs) {
      try {
        const result = await processDueTimeGoalTask(docSnap, nowMs);
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
