import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function errorStatus(error: unknown) {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function normalizeAvailableMinutes(value: string | null) {
  if (value == null || value === "") return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw Object.assign(new Error("Available time must be between 1 and 1440 minutes."), { status: 400, code: "capacity/invalid-available-time" });
  }
  return minutes;
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function GET(req: Request) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    const db = getFirebaseAdminDb();
    if (await isDeletedAccountUid(db, uid)) {
      return withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 }));
    }
    const url = new URL(req.url);
    const timezone = asString(url.searchParams.get("timezone"), 120) || "UTC";
    const nowMs = Date.now();
    const availableMinutesCeiling = normalizeAvailableMinutes(url.searchParams.get("availableMinutes"));
    const date = localDateForRecommendationTimezone(timezone, nowMs);
    const result = await getDailyCapacity({
      uid,
      localDate: date,
      timezone,
      nowMs,
      availableMinutesCeiling,
      forceRefresh: url.searchParams.get("forceRefresh") === "true",
      repository: createFirestoreDailyCapacityRepository(db),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, snapshot: result.snapshot }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "capacity/internal");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not prepare today's capacity right now.";
    if (status >= 500) console.error("[api/executive-function/capacity/today] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}
