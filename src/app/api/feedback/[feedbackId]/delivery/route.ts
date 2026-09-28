import { NextResponse } from "next/server";
import { getFirebaseAdminDb } from "@/lib/firebaseAdmin";
import { FeedbackApiError, verifyFeedbackRequestUser } from "../../shared";
import { authenticatedApiOptions, withAuthenticatedApiCors } from "../../../shared/cors";

export const dynamic = "force-dynamic";
export const OPTIONS = authenticatedApiOptions;

export async function GET(req: Request, context: { params: Promise<{ feedbackId: string }> }) {
  const respond = (body: unknown, status = 200) => withAuthenticatedApiCors(req, NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }));
  try {
    const { uid } = await verifyFeedbackRequestUser(req);
    const { feedbackId } = await context.params;
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(feedbackId)) return respond({ error: "Feedback not found." }, 404);
    const job = (await getFirebaseAdminDb().collection("feedback_email_outbox").doc(feedbackId).get()).data();
    if (!job || job.ownerUid !== uid) return respond({ error: "Feedback not found." }, 404);
    return respond({ feedbackId, emailDeliveryStatus: job.status === "sent" || job.status === "failed" ? job.status : "pending" });
  } catch (error) {
    if (error instanceof FeedbackApiError) return respond({ error: error.message, code: error.code }, error.status);
    return respond({ error: "Could not check email delivery." }, 500);
  }
}
