import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyFirebaseRequestUser: vi.fn(), getFirebaseAdminDb: vi.fn(), isDeletedAccountUid: vi.fn(), dismissRecommendation: vi.fn() }));
vi.mock("@/app/api/shared/auth", async () => ({ ...(await vi.importActual<typeof import("@/app/api/shared/auth")>("@/app/api/shared/auth")), verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/nextbestaction/lib/nextBestActionRepository", () => ({ createFirestoreNextBestActionRepository: vi.fn(() => ({ dismissRecommendation: mocks.dismissRecommendation })) }));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new Request("https://tasklaunch.app/api/recommendations/next-best-action/nba-1/dismiss", { method: "POST", headers: { "Content-Type": "application/json", "x-firebase-auth": "token" }, body: JSON.stringify(body) });
}

describe("POST /api/recommendations/next-best-action/[recommendationId]/dismiss", () => {
  beforeEach(() => vi.clearAllMocks());
  it("rejects unknown feedback and records supported feedback without Task content", async () => {
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.dismissRecommendation.mockResolvedValue("dismissed");

    const invalid = await POST(request({ feedbackCode: "rewrite_ranking" }), { params: Promise.resolve({ recommendationId: "nba-1" }) });
    const valid = await POST(request({ feedbackCode: "wrong_timing" }), { params: Promise.resolve({ recommendationId: "nba-1" }) });

    expect(invalid.status).toBe(400);
    expect(valid.status).toBe(200);
    expect(mocks.dismissRecommendation).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", recommendationId: "nba-1", feedbackCode: "wrong_timing" }));
    expect(await valid.json()).not.toHaveProperty("taskTitle");
  });
});
