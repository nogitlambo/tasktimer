import {beforeEach, describe, expect, it, vi} from "vitest";
import {createHash} from "node:crypto";
import {buildFeedbackEmail, createFeedbackEmailWorker, RETRY_WINDOW_MS, FAILED_RETENTION_MS} from "./feedback-email-worker.js";
import {memoryFirestore} from "../src/test/feedback-firestore.js";

describe("feedback email delivery", () => {
  let db, bucket, logger, transport, worker, time, job;
  const content = Buffer.from([137, 80, 78, 71]);
  beforeEach(() => {
    time = 1_800_000_000_000;
    job = {feedbackId: "feedback-1", ownerUid: "uid-1", status: "pending", attempts: 0, nextAttemptAtMs: time,
      leaseUntilMs: 0, createdAtMs: time, retryStartedAtMs: time,
      payload: {type: "bug", title: "<title>", details: "<script>unsafe</script>\nDetails", isAnonymous: false, authorEmail: "pilot@example.test", authorDisplayName: "Pilot"},
      attachments: [{path: "feedback-email/feedback-1/attempt/0.png", filename: "screen.png", size: content.length, sha256: createHash("sha256").update(content).digest("hex")}],
    };
    db = memoryFirestore({"feedback_email_outbox/feedback-1": job});
    bucket = {file: vi.fn(() => ({download: vi.fn(async () => [content]), delete: vi.fn(async () => {})})), getFiles: vi.fn()};
    logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn()};
    transport = {sendMail: vi.fn(async () => ({accepted: ["support@tasklaunch.app"]})), close: vi.fn()};
    worker = createFeedbackEmailWorker({db, bucket, createTransport: () => transport, logger, now: () => time});
  });
  const row = (db) => db.rows.get("feedback_email_outbox/feedback-1");

  it("sends details and exact screenshot bytes, then marks sent and deletes attachments", async () => {
    await worker.run();
    expect(row(db).status).toBe("sent");
    const mail = transport.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({to: "support@tasklaunch.app", from: "TaskLaunch <support@tasklaunch.app>", replyTo: {address: "pilot@example.test"}, messageId: "<feedback-feedback-1@tasklaunch.app>"});
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.text).toContain("uid-1");
    expect(mail.attachments[0].content).toEqual(content);
    expect(bucket.file.mock.results.at(-1).value.delete).toHaveBeenCalled();
    await worker.run();
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("omits name/email/Reply-To for anonymous feedback but retains internal ID", () => {
    job.payload.isAnonymous = true;
    const mail = buildFeedbackEmail(job, []);
    expect(mail.replyTo).toBeUndefined();
    expect(mail.text).not.toContain("pilot@example.test");
    expect(mail.text).not.toContain("Pilot");
    expect(mail.text).toContain("uid-1");
  });

  it.each(["reject", "not-accepted"])("retries SMTP %s without deleting screenshots", async (mode) => {
    if (mode === "reject") transport.sendMail.mockRejectedValue(new Error("private SMTP details"));
    else transport.sendMail.mockResolvedValue({accepted: [], rejected: ["support@tasklaunch.app"]});
    await worker.run();
    expect(row(db)).toMatchObject({status: "pending", attempts: 1, nextAttemptAtMs: time + 60_000});
    expect(bucket.file).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private SMTP details");
    time += 60_000;
    await worker.run();
    expect(row(db).nextAttemptAtMs).toBe(time + 300_000);
  });

  it("times out SMTP and closes the connection", async () => {
    vi.useFakeTimers();
    try {
      transport.sendMail.mockImplementation(() => new Promise(() => {}));
      const run = worker.run();
      await vi.advanceTimersByTimeAsync(45_001);
      await run;
      expect(row(db).status).toBe("pending");
      expect(transport.close).toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });

  it("allows only one worker to send a concurrently claimed job", async () => {
    await Promise.all([worker.run(), worker.run()]);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });

  it("recovers an expired lease after a worker restart", async () => {
    Object.assign(row(db), {status: "processing", leaseId: "old", leaseUntilMs: time - 1});
    await worker.run();
    expect(row(db).status).toBe("sent");
  });

  it("does not claim an active lease", async () => {
    Object.assign(row(db), {status: "processing", leaseUntilMs: time + 1000});
    await worker.run();
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it("marks exhausted jobs failed without sending", async () => {
    time += RETRY_WINDOW_MS;
    await worker.run();
    expect(row(db)).toMatchObject({status: "failed", failedAtMs: time});
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not send when a screenshot is missing or corrupt", async () => {
    bucket.file.mockReturnValue({download: vi.fn(async () => [Buffer.from("corrupt")])});
    await worker.run();
    expect(row(db).status).toBe("pending");
    expect(transport.sendMail).not.toHaveBeenCalled();
  });

  it.each(["pending", "failed-retained", "failed-expired", "sent", "orphan-old", "orphan-new"])("sweeps attachments safely: %s", async (scenario) => {
    const file = {name: job.attachments[0].path, metadata: {timeCreated: new Date(time - 2 * 86400_000).toISOString()}, delete: vi.fn(async () => {})};
    if (scenario.startsWith("failed")) Object.assign(row(db), {status: "failed", failedAtMs: time - (scenario === "failed-expired" ? FAILED_RETENTION_MS + 1 : 1000)});
    if (scenario === "sent") row(db).status = "sent";
    if (scenario.startsWith("orphan")) db.rows.delete("feedback_email_outbox/feedback-1");
    if (scenario === "orphan-new") file.metadata.timeCreated = new Date(time).toISOString();
    bucket.getFiles.mockResolvedValue([[file], {pageToken: "next-page"}]);
    await worker.sweep();
    expect(file.delete).toHaveBeenCalledTimes(["sent", "failed-expired", "orphan-old"].includes(scenario) ? 1 : 0);
    expect(db.rows.get("feedback_email_maintenance/storage-sweep").pageToken).toBe("next-page");
  });
});
