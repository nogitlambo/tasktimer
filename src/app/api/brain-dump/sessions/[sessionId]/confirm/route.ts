import { NextResponse } from "next/server";

import { createFirestoreBrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpSessionStore";
import { confirmBrainDumpReviewSession } from "@/app/brain-dump/lib/brainDumpTaskCreation";
import { createFirestoreBrainDumpWorkspaceRepository } from "@/app/brain-dump/lib/brainDumpWorkspaceStore";
import { verifyFirebaseRequestUser } from "../../../../shared/auth";
import { withAuthenticatedApiCors } from "../../../../shared/cors";

type RouteContext = {
  params: Promise<{ sessionId?: string }>;
};

function createTaskId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `brain-dump-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function errorStatus(error: unknown) {
  return Number.isFinite(Number((error as { status?: unknown })?.status)) ? Number((error as { status?: unknown }).status) : 500;
}

function errorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error;
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const params = await context.params;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    const batch = await confirmBrainDumpReviewSession({
      uid,
      sessionId: String(params.sessionId || ""),
      idempotencyKey: String(body.idempotencyKey || ""),
      itemUpdates: Array.isArray(body.itemUpdates) ? body.itemUpdates : [],
      store: createFirestoreBrainDumpSessionStore(),
      workspace: createFirestoreBrainDumpWorkspaceRepository(),
      createId: createTaskId,
    });

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, batch }));
  } catch (error) {
    if (hasStatus(error)) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not create Brain Dump tasks."), code: errorCode(error) },
          { status: errorStatus(error) }
        )
      );
    }
    console.error("[api/brain-dump/sessions/sessionId/confirm] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: errorCode(error),
    });
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({ error: "Could not create Brain Dump tasks.", code: "internal" }, { status: 500 })
    );
  }
}
