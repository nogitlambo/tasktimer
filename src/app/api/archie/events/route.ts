import { NextResponse } from "next/server";

import type { ArchieTelemetryEventRequest } from "@/app/tasktimer/lib/archieAssistant";
import { createArchieErrorResponse, recordArchieTelemetryEvent, verifyArchieRequestUser } from "../shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ArchieTelemetryEventRequest & Record<string, unknown>;
    const { uid } = await verifyArchieRequestUser(req, body);
    const result = await recordArchieTelemetryEvent(uid, body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/archie/events] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not record that telemetry event.");
  }
}
