import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryFirestore } from "@/test/feedback-firestore.js";

const mocks = vi.hoisted(() => ({ db: null as unknown, store: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: () => mocks.db }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "TIMESTAMP" } }));
vi.mock("./attachments", () => ({ storeFeedbackAttachments: mocks.store, deleteFeedbackAttachments: mocks.remove }));
import { validateAndRecordFeedbackSubmission } from "./shared";

describe("feedback transactional outbox", () => {
  const input = {
    uid: "user-1", type: "bug" as const, title: "Bug", details: "Details",
    submissionId: "11111111-1111-4111-8111-111111111111",
    attachments: [{ filename: "screen.png", mimeType: "image/png", data: new Uint8Array([1, 2]) }],
    createPayload: { isAnonymous: false, authorDisplayName: "Pilot" },
    privatePayload: { authorEmail: "pilot@example.test" },
  };
  let db: ReturnType<typeof memoryFirestore>;
  beforeEach(() => {
    db = memoryFirestore(); mocks.db = db;
    vi.clearAllMocks();
    mocks.store.mockResolvedValue([{ path: "feedback-email/test/a.png" }]);
    mocks.remove.mockResolvedValue(undefined);
  });

  it("atomically saves feedback, private details, delivery job and rate limit", async () => {
    const result = await validateAndRecordFeedbackSubmission(input);
    expect(result.emailDeliveryStatus).toBe("pending");
    expect(db.rows.size).toBe(4);
    expect(db.rows.get(`feedback_email_outbox/${result.feedbackId}`)).toMatchObject({
      ownerUid: "user-1", status: "pending", attempts: 0,
      payload: { authorEmail: "pilot@example.test", authorDisplayName: "Pilot" },
    });
  });

  it("reuses the same record/job on a retry without uploading again", async () => {
    const first = await validateAndRecordFeedbackSubmission(input);
    const second = await validateAndRecordFeedbackSubmission(input);
    expect(second).toMatchObject({feedbackId: first.feedbackId, deduplicated: true});
    expect(db.rows.size).toBe(4);
    expect(mocks.store).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent requests and deletes only the losing attempt's uploads", async () => {
    mocks.store.mockResolvedValueOnce([{path: "first"}]).mockResolvedValueOnce([{path: "second"}]);
    const results = await Promise.all([validateAndRecordFeedbackSubmission(input), validateAndRecordFeedbackSubmission(input)]);
    expect(results.filter((result) => result.deduplicated)).toHaveLength(1);
    expect(db.rows.size).toBe(4);
    expect(mocks.remove).toHaveBeenCalledWith([{path: "second"}]);
  });

  it("rejects reusing an ID with changed content or attachments", async () => {
    await validateAndRecordFeedbackSubmission(input);
    await expect(validateAndRecordFeedbackSubmission({...input, details: "Changed"})).rejects.toMatchObject({status: 409});
    await expect(validateAndRecordFeedbackSubmission({...input, attachments: []})).rejects.toMatchObject({status: 409});
  });

  it("does not persist anything if screenshot upload fails", async () => {
    mocks.store.mockRejectedValue(new Error("upload failed"));
    await expect(validateAndRecordFeedbackSubmission(input)).rejects.toThrow();
    expect(db.rows.size).toBe(0);
  });

  it("cleans uploads after a rate-limit rejection without enqueueing", async () => {
    db.rows.set("feedback_limits/user-1", {submissionEvents: [1, 2, 3].map((n) => ({atMs: Date.now(), fingerprint: `other-${n}`}))});
    await expect(validateAndRecordFeedbackSubmission(input)).rejects.toMatchObject({status: 429});
    expect(db.rows.size).toBe(1);
    expect(mocks.remove).toHaveBeenCalledWith([{path: "feedback-email/test/a.png"}]);
  });

  it("keeps referenced screenshots if the transaction committed but its response was lost", async () => {
    const real = db.runTransaction;
    db.runTransaction = async (fn) => {await real(fn); throw new Error("response lost");};
    await expect(validateAndRecordFeedbackSubmission(input)).rejects.toThrow("response lost");
    expect(db.rows.size).toBe(4);
    expect(mocks.remove).toHaveBeenCalledWith([]);
    db.runTransaction = real;
    expect((await validateAndRecordFeedbackSubmission(input)).deduplicated).toBe(true);
  });

  it("strips identity from anonymous queue payloads", async () => {
    const result = await validateAndRecordFeedbackSubmission({...input, createPayload: {...input.createPayload, isAnonymous: true}});
    expect(db.rows.get(`feedback_email_outbox/${result.feedbackId}`)).toMatchObject({ownerUid: "user-1", payload: {authorEmail: null, authorDisplayName: null}});
  });
});
