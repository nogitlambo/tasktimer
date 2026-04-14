import { NextResponse } from "next/server";

import type { ArchieRecentDraftResponse } from "@/app/tasktimer/lib/archieAssistant";
import { createArchieErrorResponse, getLatestOpenArchieDraft, verifyArchieRequestUser } from "../../shared";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { uid } = await verifyArchieRequestUser(req);
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
