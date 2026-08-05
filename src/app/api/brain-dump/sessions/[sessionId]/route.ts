import { NextResponse } from "next/server";

import { getBrainDumpReviewSessionForUser, toBrainDumpReviewResponse } from "@/app/brain-dump/lib/brainDumpProcessing";
import { createFirestoreBrainDumpSessionStore } from "@/app/brain-dump/lib/brainDumpSessionStore";
import { verifyFirebaseRequestUser } from "../../../shared/auth";
import { withAuthenticatedApiCors } from "../../../shared/cors";

type RouteContext = {
  params: Promise<{ sessionId?: string }>;
};

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

export async function GET(req: Request, context: RouteContext) {
  try {
    const { uid } = await verifyFirebaseRequestUser(req);
    const params = await context.params;
    const session = await getBrainDumpReviewSessionForUser({
      uid,
      sessionId: String(params.sessionId || ""),
      store: createFirestoreBrainDumpSessionStore(),
    });
    if (!session) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: "Brain Dump session was not found.", code: "brain-dump/not-found" },
          { status: 404 }
        )
      );
    }
    return withAuthenticatedApiCors(req, NextResponse.json({ ok: true, session: toBrainDumpReviewResponse(session) }));
  } catch (error) {
    if (error instanceof Error && hasStatus(error) && errorCode(error).startsWith("auth/")) {
      return withAuthenticatedApiCors(
        req,
        NextResponse.json(
          { error: errorMessage(error, "Could not load Brain Dump session."), code: errorCode(error) },
          { status: errorStatus(error) }
        )
      );
    }
    console.error("[api/brain-dump/sessions/sessionId] Request failed", {
      name: error instanceof Error ? error.name : "unknown",
      code: errorCode(error),
    });
    return withAuthenticatedApiCors(
      req,
      NextResponse.json({ error: "Could not load Brain Dump session.", code: "internal" }, { status: 500 })
    );
  }
}
