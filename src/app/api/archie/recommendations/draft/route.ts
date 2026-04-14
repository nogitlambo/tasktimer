import { NextResponse } from "next/server";

import type { ArchieRecommendationDraftRequest } from "@/app/tasktimer/lib/archieAssistant";
import { normalizeArchieAssistantPage } from "@/app/tasktimer/lib/archieAssistant";
import { buildRecommendationDraft } from "@/app/tasktimer/lib/archieEngine";
import { maybeGenerateArchieDraftSeed } from "@/app/tasktimer/lib/archieModel";
import {
  assertCanUseArchieAi,
  buildDraft,
  createArchieErrorResponse,
  loadArchieUserPlan,
  loadArchieWorkspaceContext,
  saveArchieDraft,
  verifyArchieRequestUser,
} from "../../shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ArchieRecommendationDraftRequest;
    const { uid } = await verifyArchieRequestUser(req, body as Record<string, unknown>);
    assertCanUseArchieAi(await loadArchieUserPlan(uid));
    const requestBody: ArchieRecommendationDraftRequest = {
      message: String(body?.message || "").trim(),
      activePage: normalizeArchieAssistantPage(body?.activePage),
      intentHint: body?.intentHint || null,
      focusSessionNotesByTaskId: body?.focusSessionNotesByTaskId || {},
      source: body?.source || "manual",
    };
    const context = await loadArchieWorkspaceContext(uid, requestBody);
    const seed = buildRecommendationDraft(context, requestBody.message);
    if (!seed) {
      return NextResponse.json({ error: "Archie could not create a recommendation draft from the current workspace.", code: "archie/no-draft" }, { status: 422 });
    }
    const nextSeed = await maybeGenerateArchieDraftSeed({
      userMessage: requestBody.message,
      context,
      fallbackSeed: seed,
    });
    const draft = buildDraft(nextSeed);
    await saveArchieDraft(uid, draft);
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    console.error("[api/archie/recommendations/draft] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not create a draft.");
  }
}
