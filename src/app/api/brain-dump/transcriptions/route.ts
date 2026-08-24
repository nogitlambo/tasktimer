import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getBrainDumpAiProvider } from "@/app/brain-dump/lib/brainDumpProvider";
import {
  BrainDumpInputError,
  BrainDumpProviderValidationError,
  transcribeVoiceBrainDump,
} from "@/app/brain-dump/lib/brainDumpProcessing";
import { createFirestoreBrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpSessionStore";
import { createFirebaseBrainDumpVoiceSourceStorage } from "@/app/brain-dump/lib/brainDumpVoiceStorage";
import { verifyFirebaseRequestUser } from "../../shared/auth";
import { assertExecutiveFunctionAvailableForUser } from "@/app/api/shared/plusEntitlement";
import { enforceUidRateLimit } from "@/app/api/shared/rateLimit";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../shared/cors";

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

function safeErrorField(error: unknown, field: string) {
  const value = (error as Record<string, unknown> | null)?.[field];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function durationBucket(durationMs: number) {
  const seconds = Math.max(0, Math.ceil(durationMs / 1000));
  if (seconds <= 30) return "0-30s";
  if (seconds <= 60) return "31-60s";
  if (seconds <= 180) return "1-3m";
  return "3-5m";
}

function sizeBucket(sizeBytes: number) {
  if (sizeBytes <= 1024 * 1024) return "0-1mb";
  if (sizeBytes <= 5 * 1024 * 1024) return "1-5mb";
  return "5-10mb";
}

export function OPTIONS(req: Request) {
  return authenticatedApiOptions(req);
}

export async function POST(req: Request) {
  const diagnosticId = randomUUID();
  let stage = "request";
  let durationMs = 0;
  let sourceContext: { mimeType?: string; sizeBytes?: number } = {};
  try {
    const body = (await req.json()) as Record<string, unknown>;
    durationMs = Number(body.durationMs || 0);
    stage = "authentication";
    const { uid } = await verifyFirebaseRequestUser(req, body);
    stage = "entitlement";
    await assertExecutiveFunctionAvailableForUser(uid);
    stage = "rate-limit";
    await enforceUidRateLimit({
      namespace: "brain-dump-transcription",
      uid,
      windowMs: 15 * 60 * 1000,
      maxEvents: 10,
      code: "brain-dump/transcription-rate-limited",
      message: "Too many Brain Dump transcription attempts. Please wait and try again.",
    });
    const transcription = await transcribeVoiceBrainDump({
      uid,
      brainDumpId: String(body.brainDumpId || ""),
      storagePath: String(body.storagePath || ""),
      durationMs,
      provider: getBrainDumpAiProvider(),
      store: createFirestoreBrainDumpSessionStore(),
      storage: createFirebaseBrainDumpVoiceSourceStorage(),
      onStage(nextStage, context) {
        stage = nextStage;
        sourceContext = { ...sourceContext, ...context };
        if (nextStage === "source-cleanup-failed" || nextStage === "recovery-session-save-failed") {
          console.warn("[api/brain-dump/transcriptions] Recovery action deferred", {
            diagnosticId,
            stage: nextStage,
            mimeType: sourceContext.mimeType,
            durationBucket: durationBucket(durationMs),
            fileSizeBucket: sourceContext.sizeBytes === undefined ? undefined : sizeBucket(sourceContext.sizeBytes),
          });
        }
      },
    });

    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, diagnosticId, ...transcription }));
  } catch (error) {
    const responseStatus = errorStatus(error);
    const responseCode = errorCode(error);
    console.error("[api/brain-dump/transcriptions] Request failed", {
      diagnosticId,
      stage: safeErrorField(error, "transcriptionStage") || stage,
      status: responseStatus,
      code: responseCode,
      model: safeErrorField(error, "model"),
      mimeType: sourceContext.mimeType,
      durationBucket: durationBucket(durationMs),
      fileSizeBucket: sourceContext.sizeBytes === undefined ? undefined : sizeBucket(sourceContext.sizeBytes),
      providerStatus: safeErrorField(error, "providerStatus"),
      providerCode: safeErrorField(error, "providerCode"),
      providerType: safeErrorField(error, "providerType"),
      providerParam: safeErrorField(error, "providerParam"),
      providerRequestId: safeErrorField(error, "providerRequestId"),
    });
    if (error instanceof Error && hasStatus(error) && errorCode(error).startsWith("auth/")) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not transcribe Brain Dump recording."), code: responseCode, diagnosticId },
          { status: responseStatus }
        )
      );
    }
    if (error instanceof BrainDumpInputError || error instanceof BrainDumpProviderValidationError || hasStatus(error)) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not transcribe Brain Dump recording."), code: responseCode, diagnosticId },
          { status: responseStatus }
        )
      );
    }
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({ error: "Could not transcribe Brain Dump recording.", code: "internal", diagnosticId }, { status: 500 })
    );
  }
}
