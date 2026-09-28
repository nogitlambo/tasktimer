import {cert, initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";

const feedbackId = process.argv[2];
const write = process.argv.includes("--write");
if (!feedbackId || !/^[a-zA-Z0-9_-]{1,120}$/.test(feedbackId)) {
  throw new Error("Usage: node --env-file=.env.local scripts/requeue-feedback-email.mjs <feedbackId> [--write]");
}
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Set FIREBASE_ADMIN_PROJECT_ID or GOOGLE_CLOUD_PROJECT.");
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const app = initializeApp({projectId, ...(clientEmail && privateKey ? {credential: cert({projectId, clientEmail, privateKey})} : {})});
const db = getFirestore(app, process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "timebase");
const bucket = getStorage(app).bucket(process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`);
const ref = db.collection("feedback_email_outbox").doc(feedbackId);
try {
  await db.runTransaction(async (tx) => {
    const job = (await tx.get(ref)).data();
    if (!job || job.status !== "failed") throw new Error("Only an existing failed email can be requeued.");
    if (job.attachments.length && (job.attachmentsDeletedAtMs || Date.now() >= job.failedAtMs + 30 * 86400_000)) {
      throw new Error("Screenshot retention has expired; this email cannot be requeued.");
    }
    for (const file of job.attachments) {
      if (!file.path.startsWith(`feedback-email/${feedbackId}/`)) throw new Error("Invalid screenshot reference.");
      if (!(await bucket.file(file.path).exists())[0]) throw new Error("A screenshot is no longer available.");
    }
    if (write) tx.update(ref, {status: "pending", attempts: 0, retryStartedAtMs: Date.now(), nextAttemptAtMs: Date.now(), updatedAtMs: Date.now(), failedAtMs: null, leaseId: null, leaseUntilMs: 0});
  });
  console.log(`${write ? "Requeued" : "Ready to requeue (dry run)"}: ${feedbackId}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Requeue failed.");
  process.exitCode = 1;
}
