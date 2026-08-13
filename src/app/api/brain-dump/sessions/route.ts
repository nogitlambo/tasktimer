import { NextResponse } from "next/server";

import { getBrainDumpAiProvider } from "@/app/brain-dump/lib/brainDumpProvider";
import {
  BrainDumpInputError,
  BrainDumpProviderValidationError,
  processTypedBrainDump,
  processVoiceTranscriptBrainDump,
  toBrainDumpReviewResponse,
} from "@/app/brain-dump/lib/brainDumpProcessing";
import { createFirestoreBrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpSessionStore";
import { createFirestoreBrainDumpWorkspaceRepository } from "@/app/brain-dump/lib/brainDumpWorkspaceStore";
import { verifyFirebaseRequestUser } from "../../shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";

function createSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `brain-dump-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid } = await verifyFirebaseRequestUser(req, body);
    await assertExecutiveFunctionAvailableForUser(uid);
    const workspace = createFirestoreBrainDumpWorkspaceRepository();
    const store = createFirestoreBrainDumpSessionStore();
    const workspaceTasks = await workspace.loadTasks(uid);
    const archivedTaskMeta = workspace.loadTaskStatusMeta ? await workspace.loadTaskStatusMeta(uid) : {};
    const voiceSessionId = typeof body.brainDumpId === "string" ? body.brainDumpId.trim() : "";
    const sharedInput = {
      uid,
      text: String(body.text || ""),
      timezone: typeof body.timezone === "string" ? body.timezone : undefined,
      provider: getBrainDumpAiProvider(),
      store,
      workspaceTasks,
      archivedTaskMeta,
    };
    const session = voiceSessionId
      ? await processVoiceTranscriptBrainDump({ ...sharedInput, sessionId: voiceSessionId })
      : await processTypedBrainDump({ ...sharedInput, createId: createSessionId });

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, session: toBrainDumpReviewResponse(session) }));
  } catch (error) {
    if (error instanceof Error && hasStatus(error) && errorCode(error).startsWith("auth/")) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not process Brain Dump."), code: errorCode(error) },
          { status: errorStatus(error) }
        )
      );
    }
    if (error instanceof BrainDumpInputError || error instanceof BrainDumpProviderValidationError || hasStatus(error)) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not process Brain Dump."), code: errorCode(error) },
          { status: errorStatus(error) }
        )
      );
    }
    console.error("[api/brain-dump/sessions] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: errorCode(error),
    });
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({ error: "Could not process Brain Dump.", code: "internal" }, { status: 500 })
    );
  }
}
