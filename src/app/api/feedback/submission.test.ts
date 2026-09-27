import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), profile: vi.fn(), save: vi.fn(), jira: vi.fn(), upload: vi.fn(), rateLimit: vi.fn(),
}));

vi.mock("./shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("./shared")>(),
  verifyFeedbackRequestUser: mocks.verify,
  loadFeedbackAuthorProfile: mocks.profile,
  validateAndRecordFeedbackSubmission: mocks.save,
}));
vi.mock("../jira/feedback/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("../jira/feedback/shared")>(),
  createJiraIssue: mocks.jira,
  uploadJiraIssueAttachment: mocks.upload,
}));
vi.mock("../shared/rateLimit", async (importOriginal) => ({
  ...await importOriginal<typeof import("../shared/rateLimit")>(),
  enforceUidRateLimit: mocks.rateLimit,
}));

import { OPTIONS, POST } from "./route";
import { FeedbackApiError } from "./shared";

describe("feedback submission endpoint", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verify.mockResolvedValue({ uid: "user-1", email: "pilot@example.com" });
    mocks.profile.mockResolvedValue({ displayName: "Pilot" });
    mocks.save.mockResolvedValue({ feedbackId: "feedback-1" });
    mocks.jira.mockResolvedValue({ jiraIssueKey: "TL-1", jiraIssueBrowseUrl: "https://example.atlassian.net/browse/TL-1" });
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
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(await response.json()).toMatchObject({ ok: true, feedbackId: "feedback-1" });
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
        uid: "user-1", privatePayload: expect.objectContaining({ authorEmail: "pilot@example.com" }),
      }));
    },
  );

  it("saves anonymous multipart feedback even when Jira fetch fails", async () => {
    mocks.jira.mockRejectedValue(new TypeError("fetch failed"));
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
      expect(await response.json()).toMatchObject({ ok: true, feedbackId: "feedback-1", jiraIssueBrowseUrl: null });
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
        createPayload: expect.objectContaining({ isAnonymous: true, authorDisplayName: null }),
        privatePayload: undefined,
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
      expect(mocks.jira).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
