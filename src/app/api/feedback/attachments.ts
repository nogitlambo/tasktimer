import { randomUUID } from "node:crypto";
import { getFirebaseAdminStorageBucket } from "@/lib/firebaseAdmin";

export type FeedbackAttachment = { filename: string; mimeType: string; data: Uint8Array };
export type StoredFeedbackAttachment = { path: string; filename: string; size: number; sha256: string };

export async function storeFeedbackAttachments(feedbackId: string, attachments: FeedbackAttachment[], hashes: string[]) {
  const stored: StoredFeedbackAttachment[] = [];
  if (!attachments.length) return stored;
  const bucket = getFirebaseAdminStorageBucket();
  const attemptId = randomUUID();
  try {
    for (const [index, attachment] of attachments.entries()) {
      const path = `feedback-email/${feedbackId}/${attemptId}/${index}.png`;
      // Track even an ambiguous upload so cleanup can remove it.
      stored.push({ path, filename: attachment.filename, size: attachment.data.byteLength, sha256: hashes[index] });
      await bucket.file(path).save(Buffer.from(attachment.data), {
        resumable: false,
        contentType: "image/png",
        metadata: { cacheControl: "private, no-store" },
      });
    }
    return stored;
  } catch (error) {
    await deleteFeedbackAttachments(stored);
    throw error;
  }
}

export async function deleteFeedbackAttachments(attachments: StoredFeedbackAttachment[]) {
  if (!attachments.length) return;
  const bucket = getFirebaseAdminStorageBucket();
  const results = await Promise.allSettled(attachments.map((file) => bucket.file(file.path).delete({ ignoreNotFound: true })));
  if (results.some((result) => result.status === "rejected")) {
    console.warn("[feedback-email] Upload cleanup deferred to sweeper");
  }
}
