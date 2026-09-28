import {getApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {defineSecret} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {logger} from "firebase-functions";
import nodemailer from "nodemailer";
import {createFeedbackEmailWorker} from "./feedback-email-worker.js";

const smtpPass = defineSecret("SMTP_PASS");
function worker() {
  const app = getApp();
  return createFeedbackEmailWorker({
    db: getFirestore(app, process.env.FIREBASE_DATABASE_ID || "timebase"),
    bucket: getStorage(app).bucket(process.env.FEEDBACK_STORAGE_BUCKET || `${app.options.projectId || process.env.GCLOUD_PROJECT}.firebasestorage.app`),
    logger,
    createTransport: () => nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.hostinger.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE !== "false",
      auth: {user: process.env.SMTP_USER || "support@tasklaunch.app", pass: smtpPass.value()},
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
      logger: false, debug: false,
    }),
  });
}

export const sendFeedbackEmails = onSchedule({
  region: "us-central1", schedule: "every 1 minutes", secrets: [smtpPass],
  timeoutSeconds: 300, memory: "512MiB", maxInstances: 1, concurrency: 1,
}, async () => {
  try { await worker().run(); } catch { logger.error("feedback_email_worker_failed"); throw new Error("Feedback email worker failed"); }
});

export const cleanupFeedbackEmailAttachments = onSchedule({
  region: "us-central1", schedule: "every 60 minutes", timeoutSeconds: 300,
  memory: "256MiB", maxInstances: 1, concurrency: 1,
}, async () => {
  try { await worker().sweep(); } catch { logger.error("feedback_email_cleanup_failed"); throw new Error("Feedback email cleanup failed"); }
});
