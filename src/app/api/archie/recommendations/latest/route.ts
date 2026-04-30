import { NextResponse } from "next/server";

import type { ArchieRecentDraftResponse } from "@/app/tasktimer/lib/archieAssistant";
import { enforceUidRateLimit } from "../../../shared/rateLimit";
import { assertArchieEnabled, assertCanUseArchieAi, createArchieErrorResponse, getLatestOpenArchieDraft, loadArchieUserPlan, verifyArchieRequestUser } from "../../shared";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    assertArchieEnabled();
    const { uid } = await verifyArchieRequestUser(req);
    await enforceUidRateLimit({
      namespace: "archie-recommendation-latest",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 30,
      code: "archie/latest-rate-limited",
      message: "Too many Archie draft refreshes recently. Please wait before trying again.",
    });
    assertCanUseArchieAi(await loadArchieUserPlan(uid));
    const draft = await getLatestOpenArchieDraft(uid);
    const response: ArchieRecentDraftResponse = draft
      ? {
          draft,
          sessionId: draft.sessionId || null,
          suggestedAction: { kind: "reviewDraft", label: "Reopen Last Draft", draftId: draft.id },
        }
      : { draft: null };
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/archie/recommendations/latest] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not load the latest draft.");
  }
}
