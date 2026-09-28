import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({verify: vi.fn(), get: vi.fn()}));
vi.mock("../../shared", async (original) => ({...await original<typeof import("../../shared")>(), verifyFeedbackRequestUser: mocks.verify}));
vi.mock("@/lib/firebaseAdmin", () => ({getFirebaseAdminDb: () => ({collection: () => ({doc: () => ({get: mocks.get})})})}));
import { GET, OPTIONS } from "./route";
import { FeedbackApiError } from "../../shared";
describe("feedback email delivery status", () => {
  const request = () => new Request("https://tasklaunch.app/api/feedback/test/delivery/", {headers: {origin: "https://localhost"}});
  const context = {params: Promise.resolve({feedbackId: "test"})};
  beforeEach(() => {vi.clearAllMocks(); mocks.verify.mockResolvedValue({uid: "owner"});});
  it.each(["pending", "processing", "sent", "failed"])("returns only safe owner-visible status: %s", async (status) => {
    mocks.get.mockResolvedValue({data: () => ({ownerUid: "owner", status, payload: {authorEmail: "private"}})});
    const response = await GET(request(), context);
    expect(await response.json()).toEqual({feedbackId: "test", emailDeliveryStatus: status === "processing" ? "pending" : status});
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
  });
  it("conceals another user's job", async () => {
    mocks.get.mockResolvedValue({data: () => ({ownerUid: "other", status: "sent"})});
    expect((await GET(request(), context)).status).toBe(404);
  });
  it("requires authentication", async () => {
    mocks.verify.mockRejectedValue(new FeedbackApiError("feedback/unauthenticated", "Sign in required", 401));
    expect((await GET(request(), context)).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("supports native preflight", () => expect(OPTIONS(request()).status).toBe(204));
});
