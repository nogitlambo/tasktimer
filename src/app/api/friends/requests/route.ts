import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { createApiAuthErrorResponse, createApiInternalErrorResponse, verifyFirebaseRequestUser } from "../../shared/auth";
import { ApiRateLimitError, enforceUidRateLimit } from "../../shared/rateLimit";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";

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

function buildProfileSnapshot(data: FirebaseFirestore.DocumentData | undefined) {
  return {
    alias: normalizeField(data?.username, 40),
    avatarId: normalizeField(data?.avatarId, 120),
    rankThumbnailSrc: normalizeField(data?.rankThumbnailSrc, 900000),
    currentRankId: normalizeField(data?.rewardCurrentRankId, 120),
    totalXp: normalizeTotalXp(data?.rewardTotalXp),
  };
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
      return NextResponse.json({ error: "Email address is required." }, { status: 400 });
    }
    if (senderEmail && receiverEmail === normalizeEmail(senderEmail)) {
      return NextResponse.json({ error: "You cannot send a request to yourself." }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const lookupRef = db.collection("userEmailLookup").doc(emailLookupDocKey(receiverEmail));
    const lookupSnap = await lookupRef.get();
    if (!lookupSnap.exists) {
      return NextResponse.json({ error: "No user found for this email address." }, { status: 404 });
    }

    const receiverUid = asString(lookupSnap.get("uid"), 120);
    if (!receiverUid) {
      return NextResponse.json({ error: "Could not resolve user account." }, { status: 400 });
    }
    if (receiverUid === senderUid) {
      return NextResponse.json({ error: "You cannot send a request to yourself." }, { status: 400 });
    }

    const requestId = requestDocId(senderUid, receiverUid);
    const requestRef = db.collection("friend_requests").doc(requestId);
    const pairRef = db.collection("friendships").doc(friendshipDocId(senderUid, receiverUid));
    const senderUserRef = db.collection("users").doc(senderUid);
    const receiverUserRef = db.collection("users").doc(receiverUid);

    const requestResult = await db.runTransaction(async (tx) => {
      const [existingSnap, friendshipSnap, senderUserSnap, receiverUserSnap] = await Promise.all([
        tx.get(requestRef),
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
        tx.update(requestRef, basePayload);
        return { ok: true as const };
      }

      tx.set(requestRef, {
        ...basePayload,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ok: true as const };
    });

    if (!requestResult.ok) {
      return NextResponse.json({ error: requestResult.error }, { status: requestResult.status });
    }

    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    if (error instanceof ApiRateLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof Error && "status" in error) {
      return createApiAuthErrorResponse(error, "Could not send friend request.");
    }
    return createApiInternalErrorResponse(
      error,
      "Could not send friend request.",
      "[api/friends/requests] Request failed"
    );
  }
}
