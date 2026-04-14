import { NextResponse } from "next/server";

import type { ArchieQueryRequest } from "@/app/tasktimer/lib/archieAssistant";
import { normalizeArchieAssistantPage } from "@/app/tasktimer/lib/archieAssistant";
import { buildArchieQueryResponse } from "@/app/tasktimer/lib/archieEngine";
import { maybeGenerateArchieDraftSeed, maybeRefineArchieResponse } from "@/app/tasktimer/lib/archieModel";
import {
  attachArchieDraftSession,
  buildDraft,
  buildArchieUpgradeResponse,
  canUseArchieAi,
  createArchieErrorResponse,
  loadArchieUserPlan,
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
    const plan = await loadArchieUserPlan(uid);
    if (!canUseArchieAi(plan)) {
      if (baseResponse.mode === "product_answer" || baseResponse.mode === "fallback") {
        return NextResponse.json(baseResponse);
      }
      return NextResponse.json(buildArchieUpgradeResponse());
    }
    let responseBase = baseResponse;
    if (baseResponse.mode === "workflow_advice" && baseResponse.draft) {
      const { id: _id, createdAt: _createdAt, status: _status, ...fallbackSeed } = baseResponse.draft;
      void _id;
      void _createdAt;
      void _status;
      const nextSeed = await maybeGenerateArchieDraftSeed({
        userMessage: requestBody.message,
        context,
        fallbackSeed,
      });
      const nextDraft = buildDraft(nextSeed);
      responseBase = {
        ...baseResponse,
        message: nextDraft.summary,
        draftId: nextDraft.id,
        draft: nextDraft,
        suggestedAction: { kind: "reviewDraft", label: "Review Draft", draftId: nextDraft.id },
      };
    }
    if (responseBase.draft) {
      await saveArchieDraft(uid, responseBase.draft);
    }
    const response = await maybeRefineArchieResponse({
      userMessage: requestBody.message,
      baseResponse: responseBase,
      draft: responseBase.draft,
    });
    const sessionId = await writeArchieSession(uid, {
      request: requestBody,
      response,
      latencyMs: Date.now() - startedAt,
    });
    if (responseBase.draft?.id) {
      await attachArchieDraftSession(uid, responseBase.draft.id, sessionId);
    }
    return NextResponse.json({ ...response, sessionId });
  } catch (error) {
    console.error("[api/archie/query] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not answer that request.");
  }
}
