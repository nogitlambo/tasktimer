import { NextResponse } from "next/server";

import { isDeletedAccountUid } from "@/app/api/account/deletedAccountUid";
import { verifyFirebaseRequestUser } from "@/app/api/shared/auth";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "@/app/api/shared/cors";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { localDateForRecommendationTimezone } from "@/app/nextbestaction/lib/nextBestActionRepository";

import { createFirestoreDailyCapacityRepository } from "@/app/adaptivecapacity/lib/dailyCapacityRepository";
import { getDailyCapacity } from "@/app/adaptivecapacity/lib/dailyCapacityService";
import type { DailyCapacityManualOverride } from "@/app/adaptivecapacity/lib/dailyCapacityContract";

const overrideStates = new Set(["REDUCED", "LIGHT", "STANDARD", "STRONG"]);

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

function parseOverride(body: Record<string, unknown>, nowMs: number): DailyCapacityManualOverride {
  const type = asString(body.type, 20);
  const createdAt = new Date(nowMs).toISOString();
  if (type === "STATE") {
    const state = asString(body.state, 40);
    if (!overrideStates.has(state)) throw Object.assign(new Error("Choose a valid capacity state."), { status: 400, code: "capacity/invalid-override" });
    return { type: "STATE", state: state as "REDUCED" | "LIGHT" | "STANDARD" | "STRONG", createdAt };
  }
  if (type === "MINUTES") {
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw Object.assign(new Error("Custom capacity must be between 1 and 1440 minutes."), { status: 400, code: "capacity/invalid-override" });
    return { type: "MINUTES", minutes, createdAt };
  }
  throw Object.assign(new Error("Choose a capacity state or custom minutes."), { status: 400, code: "capacity/invalid-override" });
}

type OverrideRouteContext =
  | { response: Response }
  | { uid: string; db: ReturnType<typeof getFirebaseAdminDb>; url: URL; timezone: string; nowMs: number };

async function resolveContext(req: Request): Promise<OverrideRouteContext> {
  const { uid } = await verifyFirebaseRequestUser(req);
  const db = getFirebaseAdminDb();
  if (await isDeletedAccountUid(db, uid)) {
    return { response: withAuthenticatedApiCors(req, NextResponse.json({ error: "This account has been deleted.", code: "auth/account-deleted" }, { status: 410 })) };
  }
  const url = new URL(req.url);
  const timezone = asString(url.searchParams.get("timezone"), 120) || "UTC";
  const nowMs = Date.now();
  return { uid, db, url, timezone, nowMs };
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const context = await resolveContext(req);
    if ("response" in context) return context.response;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const override = parseOverride(body, context.nowMs);
    const availableMinutesCeiling = normalizeAvailableMinutes(context.url.searchParams.get("availableMinutes"));
    const result = await getDailyCapacity({
      uid: context.uid,
      localDate: localDateForRecommendationTimezone(context.timezone, context.nowMs),
      timezone: context.timezone,
      nowMs: context.nowMs,
      availableMinutesCeiling,
      manualOverride: override,
      forceRefresh: true,
      repository: createFirestoreDailyCapacityRepository(context.db),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, snapshot: result.snapshot }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "capacity/override-failed");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not update today's capacity right now.";
    if (status >= 500) console.error("[api/executive-function/capacity/today/override] Request failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}

export async function DELETE(req: Request): Promise<Response> {
  try {
    const context = await resolveContext(req);
    if ("response" in context) return context.response;
    const availableMinutesCeiling = normalizeAvailableMinutes(context.url.searchParams.get("availableMinutes"));
    const result = await getDailyCapacity({
      uid: context.uid,
      localDate: localDateForRecommendationTimezone(context.timezone, context.nowMs),
      timezone: context.timezone,
      nowMs: context.nowMs,
      availableMinutesCeiling,
      manualOverride: null,
      forceRefresh: true,
      repository: createFirestoreDailyCapacityRepository(context.db),
    });
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, reused: result.reused, snapshot: result.snapshot }));
  } catch (error) {
    const status = errorStatus(error);
    const code = asString((error as { code?: unknown })?.code, 120) || (status === 401 ? "auth/invalid-session" : "capacity/override-clear-failed");
    const message = status < 500 && error instanceof Error ? error.message : "TaskLaunch could not reset today's capacity right now.";
    if (status >= 500) console.error("[api/executive-function/capacity/today/override] Clear failed", { code, status });
    return withAuthenticatedApiCors(req, NextResponse.json({ error: message, code }, { status }));
  }
}
