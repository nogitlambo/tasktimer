import { NextResponse } from "next/server";

import type { ArchieTelemetryEventRequest } from "@/app/tasktimer/lib/archieAssistant";
import { enforceUidRateLimit } from "../../shared/rateLimit";
import { createArchieErrorResponse, recordArchieTelemetryEvent, verifyArchieRequestUser } from "../shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ArchieTelemetryEventRequest & Record<string, unknown>;
    const { uid } = await verifyArchieRequestUser(req, body);
    await enforceUidRateLimit({
      namespace: "archie-events",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 120,
      code: "archie/events-rate-limited",
      message: "Too many Archie telemetry events recently. Please wait before trying again.",
    });
    const result = await recordArchieTelemetryEvent(uid, body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[api/archie/events] Request failed", error);
    return createArchieErrorResponse(error, "Archie could not record that telemetry event.");
  }
}
