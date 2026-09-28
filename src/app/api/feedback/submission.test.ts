import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), profile: vi.fn(), save: vi.fn(), vote: vi.fn(),  rateLimit: vi.fn(),
}));

vi.mock("./shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("./shared")>(),
  verifyFeedbackRequestUser: mocks.verify,
  loadFeedbackAuthorProfile: mocks.profile,
  validateAndRecordFeedbackSubmission: mocks.save,
  toggleFeedbackVoteWithLimits: mocks.vote,
}));
vi.mock("../shared/rateLimit", async (importOriginal) => ({
  ...await importOriginal<typeof import("../shared/rateLimit")>(),
  enforceUidRateLimit: mocks.rateLimit,
}));

import { OPTIONS, POST, PATCH } from "./route";
import { FeedbackApiError } from "./shared";

describe("feedback submission endpoint", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected external call"); }));
    mocks.verify.mockResolvedValue({ uid: "user-1", email: "pilot@example.com" });
    mocks.profile.mockResolvedValue({ displayName: "Pilot" });
    mocks.save.mockResolvedValue({ feedbackId: "feedback-1", emailDeliveryStatus: "pending", deduplicated: false });
  });

  it.each(["https://tasklaunch.app", "https://localhost", "capacitor://localhost"])(
    "accepts preflight and saves JSON feedback from %s", async (origin) => {
      const headers = { origin, "content-type": "application/json", "x-firebase-auth": "token" };
      const preflight = OPTIONS(new Request("https://tasklaunch.app/api/feedback/", { method: "OPTIONS", headers }));
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
      const response = await POST(new Request("https://tasklaunch.app/api/feedback/", {
        method: "POST", headers,
        body: JSON.stringify({ title: "Broken button", details: "Cannot submit", type: "bug", authorEmail: "spoof@example.com" }),
      }));
      expect(response.status).toBe(200);
      expect(fetch).not.toHaveBeenCalled();
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(await response.json()).toMatchObject({ ok: true, feedbackId: "feedback-1" });
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
        uid: "user-1", privatePayload: expect.objectContaining({ authorEmail: "pilot@example.com" }),
      }));
    },
  );

  it("queues anonymous multipart feedback with its screenshots", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const body = new FormData();
      body.set("title", "Screenshot report");
      body.set("details", "Button failure");
      body.set("isAnonymous", "true");
      body.set("authToken", "token");
      body.append("attachments", new File([new Uint8Array([137, 80, 78, 71])], "screen.png", { type: "image/png" }));
      const response = await POST(new Request("https://tasklaunch.app/api/feedback/", { method: "POST", body }));
      expect(response.status).toBe(200);
      expect(fetch).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ ok: true, feedbackId: "feedback-1", emailDeliveryStatus: "pending", jiraIssueBrowseUrl: null });
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
        createPayload: expect.objectContaining({ isAnonymous: true, authorDisplayName: null }),
        privatePayload: undefined,
        attachments: [expect.objectContaining({ filename: "screen.png", data: new Uint8Array([137, 80, 78, 71]) })],
      }));
      expect(mocks.profile).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it("returns an auth error with native CORS headers without saving feedback", async () => {
    mocks.verify.mockRejectedValue(new FeedbackApiError("feedback/unauthenticated", "Sign in required", 401));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(new Request("https://tasklaunch.app/api/feedback/", {
        method: "POST", headers: { origin: "https://localhost", "content-type": "application/json" }, body: "{}",
      }));
      expect(response.status).toBe(401);
      expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
      expect(mocks.save).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it.each([
    [9, 1, "image/png", "8 screenshots"],
    [1, 6 * 1024 * 1024 + 1, "image/png", "6 MB"],
    [3, 6 * 1024 * 1024, "image/png", "15 MB"],
    [1, 4, "image/jpeg", "PNG"],
  ])("rejects invalid screenshot batches (%s files, %s bytes)", async (count, size, type, message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const body = new FormData();
      body.set("title", "Test"); body.set("details", "Test");
      for (let i = 0; i < Number(count); i++) body.append("attachments", new File([new Uint8Array(Number(size))], "test.png", {type: String(type)}));
      const response = await POST(new Request("https://tasklaunch.app/api/feedback/", {method: "POST", body}));
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain(message);
      expect(mocks.save).not.toHaveBeenCalled();
    } finally {log.mockRestore();}
  });

  it("updates votes without calling Jira even for historical linked feedback", async () => {
    mocks.vote.mockResolvedValue({upvoted: true, upvoteCount: 2, jiraIssueBrowseUrl: "https://example.atlassian.net/browse/TL-1"});
    const response = await PATCH(new Request("https://tasklaunch.app/api/feedback/", {
      method: "PATCH", body: JSON.stringify({feedbackId: "feedback-1"}),
    }));
    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

});
