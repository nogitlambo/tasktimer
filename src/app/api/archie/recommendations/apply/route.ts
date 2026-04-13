import { NextResponse } from "next/server";

import type { ArchieRecommendationApplyRequest } from "@/app/tasktimer/lib/archieAssistant";
import { applyArchieDraft, createArchieErrorResponse, verifyArchieRequestUser } from "../../shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ArchieRecommendationApplyRequest & Record<string, unknown>;
    const { uid } = await verifyArchieRequestUser(req, body);
    const result = await applyArchieDraft(uid, body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/archie/recommendations/apply] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not apply that draft.");
  }
}
