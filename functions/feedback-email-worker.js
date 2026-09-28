import {createHash, randomUUID} from "node:crypto";

export const SUPPORT_EMAIL = "support@tasklaunch.app";
export const RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const FAILED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;
const RETRY_DELAYS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[char]);
}

export function buildFeedbackEmail(job, attachments) {
  const payload = job.payload;
  const category = {bug: "Bug", feature: "Feature", general: "General"}[payload.type] || "General";
  const lines = [
    `Category: ${category}`, `Title: ${payload.title}`, `Feedback reference: ${job.feedbackId}`,
    `Submitted: ${new Date(job.createdAtMs).toISOString()}`, `Firebase user ID: ${job.ownerUid}`,
    `Anonymous: ${payload.isAnonymous ? "Yes" : "No"}`,
  ];
  if (!payload.isAnonymous) lines.push(`Name: ${payload.authorDisplayName || "Not provided"}`, `Email: ${payload.authorEmail || "Not provided"}`);
  lines.push("", "Details:", payload.details);
  return {
    from: `TaskLaunch <${SUPPORT_EMAIL}>`, to: SUPPORT_EMAIL,
    ...(!payload.isAnonymous && payload.authorEmail ? {replyTo: {address: payload.authorEmail}} : {}),
    subject: `[TaskLaunch Feedback][${category}] ${String(payload.title).replace(/[\r\n]/g, " ")}`,
    messageId: `<feedback-${job.feedbackId}@tasklaunch.app>`,
    text: lines.join("\n"),
    html: `<div style="white-space:pre-wrap">${escapeHtml(lines.join("\n"))}</div>`,
    attachments,
    disableFileAccess: true, disableUrlAccess: true,
  };
}

export function createFeedbackEmailWorker({db, bucket, createTransport, logger, now = Date.now}) {
  const jobs = db.collection("feedback_email_outbox");

  async function processJob(ref) {
    const leaseId = randomUUID();
    const job = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      const at = now();
      if (!data || !["pending", "processing"].includes(data.status) || data.nextAttemptAtMs > at || data.leaseUntilMs > at) return null;
      if (at >= data.retryStartedAtMs + RETRY_WINDOW_MS) {
        tx.update(ref, {status: "failed", failedAtMs: at, updatedAtMs: at, nextAttemptAtMs: null, leaseId: null, leaseUntilMs: 0});
        return {expired: true};
      }
      const claimed = {...data, status: "processing", attempts: data.attempts + 1, leaseId, leaseUntilMs: at + LEASE_MS, nextAttemptAtMs: at + LEASE_MS, updatedAtMs: at};
      tx.update(ref, {status: claimed.status, attempts: claimed.attempts, leaseId, leaseUntilMs: claimed.leaseUntilMs, nextAttemptAtMs: claimed.nextAttemptAtMs, updatedAtMs: at});
      return claimed;
    });
    if (!job) return;
    if (job.expired) {
      logger.error("feedback_email_delivery_exhausted", {feedbackId: ref.id});
      return;
    }
    let transport;
    let timer;
    let accepted = false;
    try {
      const attachments = [];
      for (const file of job.attachments) {
        if (!file.path.startsWith(`feedback-email/${job.feedbackId}/`)) throw new Error("Invalid attachment path");
        const [content] = await bucket.file(file.path).download();
        if (content.length !== file.size || createHash("sha256").update(content).digest("hex") !== file.sha256) throw new Error("Attachment integrity failure");
        attachments.push({filename: file.filename, content, contentType: "image/png"});
      }
      // Confirm lease ownership after downloads, before starting SMTP.
      const current = (await ref.get()).data();
      if (current?.leaseId !== leaseId || current.leaseUntilMs < now() + 60_000) return;
      transport = createTransport();
      const result = await Promise.race([
        transport.sendMail(buildFeedbackEmail(job, attachments)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SMTP deadline exceeded")), 45_000); }),
      ]);
      accepted = Array.isArray(result?.accepted) && result.accepted.some((address) => String(typeof address === "string" ? address : address.address).toLowerCase() === SUPPORT_EMAIL);
      if (!accepted) throw new Error("Support recipient not accepted");
      const committed = await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.leaseId !== leaseId) return false;
        tx.update(ref, {status: "sent", sentAtMs: now(), updatedAtMs: now(), nextAttemptAtMs: null, leaseId: null, leaseUntilMs: 0});
        return true;
      });
      if (committed) {
        logger.info("feedback_email_sent", {feedbackId: ref.id, attempt: job.attempts});
        const deleted = await Promise.allSettled(job.attachments.map((file) => bucket.file(file.path).delete({ignoreNotFound: true})));
        if (deleted.some((result) => result.status === "rejected")) logger.warn("feedback_email_cleanup_pending", {feedbackId: ref.id});
      }
    } catch {
      // Never log SMTP errors: provider responses can contain addresses or message text.
      const at = now();
      const expired = at >= job.retryStartedAtMs + RETRY_WINDOW_MS;
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (current?.leaseId !== leaseId || current.status === "sent") return;
        tx.update(ref, {
          status: expired ? "failed" : "pending", failedAtMs: expired ? at : null,
          nextAttemptAtMs: expired ? null : Math.min(at + RETRY_DELAYS[Math.min(job.attempts - 1, RETRY_DELAYS.length - 1)], job.retryStartedAtMs + RETRY_WINDOW_MS),
          leaseId: null, leaseUntilMs: 0, updatedAtMs: at,
        });
      });
      logger[expired ? "error" : "warn"]("feedback_email_delivery_failed", {feedbackId: ref.id, attempt: job.attempts, smtpAcceptanceUncertain: accepted});
    } finally {
      clearTimeout(timer);
      transport?.close();
    }
  }

  async function run() {
    const due = await jobs.where("nextAttemptAtMs", ">=", 0).where("nextAttemptAtMs", "<=", now()).orderBy("nextAttemptAtMs").limit(5).get();
    for (const doc of due.docs) await processJob(doc.ref);
  }

  async function sweep() {
    const cursorRef = db.collection("feedback_email_maintenance").doc("storage-sweep");
    const cursor = (await cursorRef.get()).data()?.pageToken;
    const [files, next] = await bucket.getFiles({prefix: "feedback-email/", maxResults: 200, autoPaginate: false, ...(cursor ? {pageToken: cursor} : {})});
    for (const file of files) {
      const feedbackId = file.name.split("/")[1];
      if (!feedbackId) continue;
      const ref = jobs.doc(feedbackId);
      // Keep the transaction open across deletion so operator requeue cannot race cleanup.
      await db.runTransaction(async (tx) => {
        const job = (await tx.get(ref)).data();
        const referenced = job?.attachments?.some((attachment) => attachment.path === file.name);
        const old = Date.parse(file.metadata.timeCreated) < now() - 24 * 60 * 60 * 1000;
        const terminal = job?.status === "sent" || (job?.status === "failed" && job.failedAtMs + FAILED_RETENTION_MS <= now());
        if ((!referenced && old) || (referenced && terminal)) {
          await file.delete({ignoreNotFound: true});
          if (referenced) tx.update(ref, {attachmentsDeletedAtMs: now()});
        }
      });
    }
    await cursorRef.set({pageToken: next?.pageToken || null, updatedAtMs: now()});
  }
  return {run, processJob, sweep};
}
