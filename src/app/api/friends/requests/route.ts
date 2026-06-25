import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
import { getFirebaseAdminDb, getFirebaseAdminMessaging } from "@/lib/firebaseAdmin";

const FRIEND_REQUEST_NOTIFICATION_TITLE = "You have a pending friend request";
const FRIEND_REQUEST_NOTIFICATION_BODY = "Tap to view the request";
const FRIEND_REQUEST_NOTIFICATION_ROUTE = "/friends";
const FRIEND_REQUEST_NOTIFICATION_TYPE = "friendRequest";
const MAX_PUSH_DEVICE_ROWS_PER_USER = 20;

type PushFailureDiagnostic = {
  deviceId: string;
  platform: string;
  native: boolean;
  errorCode: string;
  errorMessage: string;
  removable: boolean;
};

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeEmail(value: unknown) {
  return asString(value, 320).toLowerCase();
}

function emailLookupDocKey(email: string) {
  return encodeURIComponent(normalizeEmail(email));
}

function sortedPair(a: string, b: string): [string, string] {
  return [a, b].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)) as [string, string];
}

function requestDocId(senderUid: string, receiverUid: string) {
  return `pending:${senderUid}:${receiverUid}`;
}

function friendshipDocId(uidA: string, uidB: string) {
  const [a, b] = sortedPair(uidA, uidB);
  return `pair:${a}:${b}`;
}

function normalizeField(value: unknown, maxLength: number) {
  const normalized = asString(value, maxLength);
  return normalized || null;
}

function normalizeTotalXp(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : null;
}

function asBool(value: unknown) {
  return value === true;
}

function buildProfileSnapshot(data: FirebaseFirestore.DocumentData | undefined) {
  return {
    alias: normalizeField(data?.username, 40),
    avatarId: normalizeField(data?.avatarId, 120),
    rankThumbnailSrc: normalizeField(data?.rankThumbnailSrc, 900000),
    currentRankId: normalizeField(data?.rewardCurrentRankId, 120),
    totalXp: normalizeTotalXp(data?.rewardTotalXp),
  };
}

function asStringMap(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, String(entryValue || "")]));
}

function buildPushData(requestId: string) {
  return asStringMap({
    route: FRIEND_REQUEST_NOTIFICATION_ROUTE,
    requestId,
    type: FRIEND_REQUEST_NOTIFICATION_TYPE,
  });
}

function extractPushDeviceRows(snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>) {
  return snapshot.docs
    .map((docSnap) => ({
      id: docSnap.id,
      token: asString(docSnap.get("token")),
      enabled: docSnap.get("enabled") !== false,
      native: asBool(docSnap.get("native")),
      provider: asString(docSnap.get("provider")),
      platform: asString(docSnap.get("platform")).toLowerCase(),
    }))
    .filter((row) => !!row.token && row.enabled && row.provider === "fcm" && (row.native || row.platform === "web"));
}

async function loadUserPushPreferences(db: FirebaseFirestore.Firestore, uid: string) {
  const prefSnap = await db.collection("users").doc(uid).collection("preferences").doc("v1").get();
  if (!prefSnap.exists) {
    return { mobilePushAlertsEnabled: false, webPushAlertsEnabled: false };
  }
  const mobilePushAlertsEnabled = prefSnap.get("mobilePushAlertsEnabled") === true;
  const webPushAlertsEnabled =
    typeof prefSnap.get("webPushAlertsEnabled") === "boolean"
      ? prefSnap.get("webPushAlertsEnabled") === true
      : mobilePushAlertsEnabled;
  return { mobilePushAlertsEnabled, webPushAlertsEnabled };
}

function filterDeviceRowsByPushPreferences(
  deviceRows: ReturnType<typeof extractPushDeviceRows>,
  prefs: { mobilePushAlertsEnabled: boolean; webPushAlertsEnabled: boolean }
) {
  return deviceRows.filter((row) => (row.native ? prefs.mobilePushAlertsEnabled : prefs.webPushAlertsEnabled));
}

async function cleanupInvalidDeviceTokens(
  db: FirebaseFirestore.Firestore,
  uid: string,
  deviceRows: ReturnType<typeof extractPushDeviceRows>,
  response: { responses?: Array<{ success?: boolean; error?: { code?: string; message?: string } }> }
) {
  const removableCodes = new Set(["messaging/invalid-registration-token", "messaging/registration-token-not-registered"]);
  const responses = Array.isArray(response.responses) ? response.responses : [];
  const failedRows = responses
    .map((item, index) => ({
      success: item.success,
      errorCode: item.error?.code || "",
      errorMessage: asString(item.error?.message, 240),
      deviceId: deviceRows[index]?.id || "",
      platform: deviceRows[index]?.platform || "",
      native: deviceRows[index]?.native === true,
      removable: removableCodes.has(item.error?.code || ""),
    }))
    .filter((row) => !row.success);

  await Promise.all(
    failedRows
      .filter((row) => row.deviceId && row.removable)
      .map((row) =>
        db.collection("users").doc(uid).collection("devices").doc(row.deviceId).set(
          {
            token: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      )
  );

  return failedRows;
}

async function sendFriendRequestPushNotification(db: FirebaseFirestore.Firestore, receiverUid: string, requestId: string) {
  const [devicesSnap, prefs] = await Promise.all([
    db.collection("users").doc(receiverUid).collection("devices").get(),
    loadUserPushPreferences(db, receiverUid),
  ]);
  const deviceRows = filterDeviceRowsByPushPreferences(extractPushDeviceRows(devicesSnap), prefs).slice(0, MAX_PUSH_DEVICE_ROWS_PER_USER);
  const nativeRows = deviceRows.filter((row) => row.native);
  const webRows = deviceRows.filter((row) => !row.native);
  const messaging = getFirebaseAdminMessaging();
  const data = buildPushData(requestId);

  if (!deviceRows.length) {
    return { status: "no-devices" as const, successCount: 0, failureCount: 0, failedRows: [], invalidTokenCount: 0 };
  }

  const responses = [];
  const failedRows: PushFailureDiagnostic[] = [];
  if (nativeRows.length) {
    const nativeResponse = await messaging.sendEachForMulticast({
      tokens: nativeRows.map((row) => row.token),
      notification: {
        title: FRIEND_REQUEST_NOTIFICATION_TITLE,
        body: FRIEND_REQUEST_NOTIFICATION_BODY,
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
              title: FRIEND_REQUEST_NOTIFICATION_TITLE,
              body: FRIEND_REQUEST_NOTIFICATION_BODY,
            },
            sound: "default",
          },
        },
      },
      data,
    });
    responses.push(nativeResponse);
    failedRows.push(...(await cleanupInvalidDeviceTokens(db, receiverUid, nativeRows, nativeResponse)));
  }

  if (webRows.length) {
    const webResponse = await messaging.sendEachForMulticast({
      tokens: webRows.map((row) => row.token),
      notification: {
        title: FRIEND_REQUEST_NOTIFICATION_TITLE,
        body: FRIEND_REQUEST_NOTIFICATION_BODY,
      },
      webpush: {
        notification: {
          title: FRIEND_REQUEST_NOTIFICATION_TITLE,
          body: FRIEND_REQUEST_NOTIFICATION_BODY,
        },
        headers: {
          Urgency: "high",
        },
        fcmOptions: {
          link: FRIEND_REQUEST_NOTIFICATION_ROUTE,
        },
        data,
      },
      data,
    });
    responses.push(webResponse);
    failedRows.push(...(await cleanupInvalidDeviceTokens(db, receiverUid, webRows, webResponse)));
  }

  const totals = responses.reduce(
    (acc, item) => ({
      successCount: acc.successCount + (Number(item.successCount) || 0),
      failureCount: acc.failureCount + (Number(item.failureCount) || 0),
    }),
    { successCount: 0, failureCount: 0 }
  );
  return {
    status: totals.successCount > 0 ? ("sent" as const) : ("failed" as const),
    ...totals,
    failedRows: failedRows.slice(0, 5).map((row) => ({
      deviceId: row.deviceId,
      platform: row.platform,
      native: row.native,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      removable: row.removable,
    })),
    invalidTokenCount: failedRows.filter((row) => row.removable).length,
  };
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid: senderUid, email: senderEmail } = await verifyFirebaseRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "friend-request-send",
      uid: senderUid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 12,
      code: "friends/rate-limited",
      message: "Too many friend requests sent recently. Please wait before trying again.",
    });
    const receiverEmail = normalizeEmail(body.receiverEmail);
    if (!receiverEmail) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Email address is required." }, { status: 400 }));
    }
    if (senderEmail && receiverEmail === normalizeEmail(senderEmail)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "You cannot send a request to yourself." }, { status: 400 }));
    }

    const db = getFirebaseAdminDb();
    const lookupRef = db.collection("userEmailLookup").doc(emailLookupDocKey(receiverEmail));
    const lookupSnap = await lookupRef.get();
    if (!lookupSnap.exists) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "No user found for this email address." }, { status: 404 }));
    }

    const receiverUid = asString(lookupSnap.get("uid"), 120);
    if (!receiverUid) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "Could not resolve user account." }, { status: 400 }));
    }
    if (receiverUid === senderUid) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "You cannot send a request to yourself." }, { status: 400 }));
    }

    const requestId = requestDocId(senderUid, receiverUid);
    const reverseRequestId = requestDocId(receiverUid, senderUid);
    const requestRef = db.collection("friend_requests").doc(requestId);
    const reverseRequestRef = db.collection("friend_requests").doc(reverseRequestId);
    const pairRef = db.collection("friendships").doc(friendshipDocId(senderUid, receiverUid));
    const senderUserRef = db.collection("users").doc(senderUid);
    const receiverUserRef = db.collection("users").doc(receiverUid);

    const requestResult = await db.runTransaction(async (tx) => {
      const [existingSnap, reverseExistingSnap, friendshipSnap, senderUserSnap, receiverUserSnap] = await Promise.all([
        tx.get(requestRef),
        tx.get(reverseRequestRef),
        tx.get(pairRef),
        tx.get(senderUserRef),
        tx.get(receiverUserRef),
      ]);

      if (friendshipSnap.exists) {
        return { ok: false as const, status: 409, error: "You are already friends with this user." };
      }

      const senderProfile = buildProfileSnapshot(senderUserSnap.data());
      const receiverProfile = buildProfileSnapshot(receiverUserSnap.data());
      const receiverEmailValue = normalizeField(lookupSnap.get("email"), 320);
      const basePayload = {
        requestId,
        senderUid,
        receiverUid,
        senderEmail: senderEmail || null,
        receiverEmail: receiverEmailValue,
        senderAlias: senderProfile.alias,
        senderAvatarId: senderProfile.avatarId,
        senderRankThumbnailSrc: senderProfile.rankThumbnailSrc,
        senderCurrentRankId: senderProfile.currentRankId,
        senderTotalXp: senderProfile.totalXp,
        receiverAlias: receiverProfile.alias,
        receiverAvatarId: receiverProfile.avatarId,
        receiverRankThumbnailSrc: receiverProfile.rankThumbnailSrc,
        receiverCurrentRankId: receiverProfile.currentRankId,
        receiverTotalXp: receiverProfile.totalXp,
        status: "pending",
        notificationDeliveryMode: "api",
        updatedAt: FieldValue.serverTimestamp(),
        respondedAt: null,
        respondedBy: null,
      };

      if (existingSnap.exists) {
        const status = asString(existingSnap.get("status"), 24);
        if (status === "pending") {
          return { ok: false as const, status: 409, error: "A pending request already exists for this user." };
        }
        if (status !== "declined" && status !== "approved") {
          return { ok: false as const, status: 409, error: "Request state is invalid. Remove or fix the existing request first." };
        }
        if (reverseExistingSnap.exists && asString(reverseExistingSnap.get("status"), 24) === "pending") {
          return { ok: false as const, status: 409, error: "This user has already sent you a pending friend request." };
        }
        tx.update(requestRef, basePayload);
        return { ok: true as const };
      }

      if (reverseExistingSnap.exists && asString(reverseExistingSnap.get("status"), 24) === "pending") {
        return { ok: false as const, status: 409, error: "This user has already sent you a pending friend request." };
      }

      tx.set(requestRef, {
        ...basePayload,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ok: true as const };
    });

    if (!requestResult.ok) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: requestResult.error }, { status: requestResult.status }));
    }

    try {
      const pushResult = await sendFriendRequestPushNotification(db, receiverUid, requestId);
      if (pushResult.status !== "sent") {
        console.info("[api/friends/requests] Friend request push not sent", {
          requestId,
          receiverUid,
          status: pushResult.status,
          successCount: pushResult.successCount,
          failureCount: pushResult.failureCount,
          invalidTokenCount: pushResult.invalidTokenCount,
          failures: pushResult.failedRows,
        });
      }
    } catch (error) {
      console.error("[api/friends/requests] Friend request push failed", {
        requestId,
        receiverUid,
        message: error instanceof Error ? error.message : "Unknown push failure",
        error,
      });
    }

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, requestId }));
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: error.message, code: error.code }, { status: error.status }));
    }
    if (error instanceof Error && "status" in error) {
      return withAuthenticatedApiCors(req, createApiAuthErrorResponse(error, "Could not send friend request."));
    }
    return withAuthenticatedApiCors(
      req,
      createApiInternalErrorResponse(
        error,
        "Could not send friend request.",
        "[api/friends/requests] Request failed"
      )
    );
  }
}
