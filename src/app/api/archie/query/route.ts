import { NextResponse } from "next/server";

import type { ArchieQueryRequest } from "@/app/tasktimer/lib/archieAssistant";
import { normalizeArchieAssistantPage } from "@/app/tasktimer/lib/archieAssistant";
import { buildArchieQueryResponse } from "@/app/tasktimer/lib/archieEngine";
import { maybeRefineArchieResponse } from "@/app/tasktimer/lib/archieModel";
import {
  attachArchieDraftSession,
  buildDraft,
  createArchieErrorResponse,
  loadArchieWorkspaceContext,
  saveArchieDraft,
  verifyArchieRequestUser,
  writeArchieSession,
} from "../shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const startedAt = Date.now();
    const body = (await req.json()) as ArchieQueryRequest;
    const { uid } = await verifyArchieRequestUser(req, body as Record<string, unknown>);
    const requestBody: ArchieQueryRequest = {
      message: String(body?.message || "").trim(),
      activePage: normalizeArchieAssistantPage(body?.activePage),
      intentHint: body?.intentHint || null,
      focusSessionNotesByTaskId: body?.focusSessionNotesByTaskId || {},
    };
    const context = await loadArchieWorkspaceContext(uid, requestBody);
    const baseResponse = buildArchieQueryResponse(requestBody.message, context, buildDraft);
    if (baseResponse.draft) {
      await saveArchieDraft(uid, baseResponse.draft);
    }
    const response = await maybeRefineArchieResponse({
      userMessage: requestBody.message,
      baseResponse,
      draft: baseResponse.draft,
    });
    const sessionId = await writeArchieSession(uid, {
      request: requestBody,
      response,
      latencyMs: Date.now() - startedAt,
    });
    if (baseResponse.draft?.id) {
      await attachArchieDraftSession(uid, baseResponse.draft.id, sessionId);
    }
    return NextResponse.json({ ...response, sessionId });
  } catch (error) {
    console.error("[api/archie/query] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not answer that request.");
  }
}
