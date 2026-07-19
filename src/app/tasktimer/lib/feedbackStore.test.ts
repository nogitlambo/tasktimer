import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFirebaseFirestoreClient: vi.fn(),
  isNativeOrFileRuntime: vi.fn(),
}));

vi.mock("@/lib/firebaseFirestoreClient", () => ({
  getFirebaseFirestoreClient: mocks.getFirebaseFirestoreClient,
}));

vi.mock("@/lib/firebaseClient", () => ({
  isNativeOrFileRuntime: mocks.isNativeOrFileRuntime,
}));

import { createFeedbackItem, toggleFeedbackUpvote } from "./feedbackStore";

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
    expect(fetch).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/feedback",
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
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("patches feedback votes to the hosted API origin in native runtime", async () => {
    mocks.isNativeOrFileRuntime.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(Response.json({ ok: true, upvoted: true, upvoteCount: 1 }))));

    const result = await toggleFeedbackUpvote("feedback-1", "uid-1", "id-token");

    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "https://tasklaunch.app/api/feedback",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "x-firebase-auth": "id-token" }),
      })
    );
  });
});
