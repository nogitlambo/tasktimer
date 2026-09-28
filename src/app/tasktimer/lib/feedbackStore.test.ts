import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFirebaseFirestoreClient: vi.fn(),
  isNativeOrFileRuntime: vi.fn(),
  recordNonFatal: vi.fn(),
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: mocks.getFirebaseFirestoreClient,
}));

vi.mock("@/lib/firebaseClient", () => ({
  isNativeOrFileRuntime: mocks.isNativeOrFileRuntime,
}));

vi.mock("@/lib/firebaseTelemetry", () => ({
  recordNonFatal: mocks.recordNonFatal,
}));

import { createFeedbackItem, getFeedbackEmailStatus, toggleFeedbackUpvote } from "./feedbackStore";

describe("feedbackStore API calls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirebaseFirestoreClient.mockReturnValue(null);
    mocks.isNativeOrFileRuntime.mockReturnValue(false);
    process.env.NEXT_PUBLIC_APP_URL = "https://tasklaunch.app";
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ ok: true, jiraIssueBrowseUrl: "https://tasklaunch.atlassian.net/browse/TL-1" }))));
  });

  it("posts feedback to the hosted API origin in native runtime", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);

    const result = await createFeedbackItem({
      authToken: "id-token",
      ownerUid: "uid-1",
      authorEmail: "pilot@example.com",
      authorDisplayName: "Pilot",
      authorRankThumbnailSrc: null,
      authorCurrentRankId: null,
      isAnonymous: false,
      type: "bug",
      title: "Mobile feedback",
      details: "Submitting feedback from mobile should reach the hosted API.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.emailDeliveryStatus).toBe("pending");
    expect(fetch).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/feedback/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-firebase-auth": "id-token" }),
      })
    );
  });

  it("keeps feedback POST relative in hosted web runtime", async () => {
    await createFeedbackItem({
      authToken: "id-token",
      ownerUid: "uid-1",
      authorEmail: "pilot@example.com",
      authorDisplayName: "Pilot",
      authorRankThumbnailSrc: null,
      authorCurrentRankId: null,
      isAnonymous: false,
      type: "general",
      title: "Desktop feedback",
      details: "Desktop feedback should keep same-origin API routing.",
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/feedback/",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("reports pending email delivery after feedback is saved", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({
      ok: true, feedbackId: "feedback-1", jiraIssueBrowseUrl: null,
    }))));
    const result = await createFeedbackItem({
      ownerUid: "uid-1", isAnonymous: true, type: "bug",
      title: "Missing Jira item", details: "Feedback was saved but Jira failed.",
    });
    expect(result).toMatchObject({
      ok: true,
      emailDeliveryStatus: "pending",
      item: { feedbackId: "feedback-1", jiraIssueBrowseUrl: null },
    });
  });

  it("patches feedback votes to the hosted API origin in native runtime", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ ok: true, upvoted: true, upvoteCount: 1 }))));

    const result = await toggleFeedbackUpvote("feedback-1", "uid-1", "id-token");

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/feedback/",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "x-firebase-auth": "id-token" }),
      })
    );
  });

  it("records native-only diagnostics when feedback submit fetch fails", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    const result = await createFeedbackItem({
      authToken: "id-token",
      ownerUid: "uid-1",
      authorEmail: "pilot@example.com",
      authorDisplayName: "Pilot",
      authorRankThumbnailSrc: null,
      authorCurrentRankId: null,
      isAnonymous: false,
      type: "bug",
      title: "Mobile feedback",
      details: "Submitting feedback from mobile should report fetch failures.",
    });

    expect(result).toEqual({ ok: false, message: "Failed to fetch" });
    expect(mocks.recordNonFatal).toHaveBeenCalledWith(
      expect.any(TypeError),
      expect.objectContaining({
        flow: "feedback_submit",
        stage: "fetch-error",
        url: "https://tasklaunch.app/api/feedback/",
        method: "POST",
        body_kind: "json",
        attachment_count: 0,
        has_auth_header: true,
        error_name: "TypeError",
        error_message: "Failed to fetch",
      })
    );
  });

  it("does not record feedback submit diagnostics in hosted web runtime", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    const result = await createFeedbackItem({
      authToken: "id-token",
      ownerUid: "uid-1",
      authorEmail: "pilot@example.com",
      authorDisplayName: "Pilot",
      authorRankThumbnailSrc: null,
      authorCurrentRankId: null,
      isAnonymous: false,
      type: "bug",
      title: "Desktop feedback",
      details: "Desktop feedback should not report native diagnostics.",
    });

    expect(result).toEqual({ ok: false, message: "Failed to fetch" });
    expect(mocks.recordNonFatal).not.toHaveBeenCalled();
  });
  it.each([false, true])("forwards a stable submission UUID for JSON and multipart (attachments=%s)", async (attached) => {
    const submissionId = "11111111-1111-4111-8111-111111111111";
    const input = {ownerUid: "uid-1", submissionId, isAnonymous: true, type: "bug" as const, title: "Title", details: "Details"};
    const file = new File([new Uint8Array([137, 80, 78, 71])], "screen.png", {type: "image/png"});
    await createFeedbackItem({...input, attachments: attached ? [{file, filename: file.name, mimeType: file.type, sizeBytes: file.size, width: 1, height: 1}] : []});
    const body = vi.mocked(fetch).mock.calls[0][1]?.body;
    expect(body instanceof FormData ? body.get("submissionId") : JSON.parse(String(body)).submissionId).toBe(submissionId);
  });

  it("checks delivery through the hosted authenticated native API", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(Response.json({emailDeliveryStatus: "sent"}));
    expect(await getFeedbackEmailStatus("feedback-1", "id-token")).toBe("sent");
    expect(fetch).toHaveBeenCalledWith("https://tasklaunch.app/api/feedback/feedback-1/delivery/", expect.objectContaining({headers: {"x-firebase-auth": "id-token"}, cache: "no-store"}));
  });

});
