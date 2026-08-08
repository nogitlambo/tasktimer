import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  createRepository: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("../shared/auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("../shared/auth")>()), verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/dailyexecutivebrief/lib/dailyExecutiveBriefRepository", () => ({ createFirestoreDailyExecutiveBriefRepository: mocks.createRepository }));
vi.mock("@/app/dailyexecutivebrief/lib/dailyExecutiveBriefService", () => ({ generateDailyExecutiveBrief: mocks.generate }));

import { POST } from "./route";

const brief = { schemaVersion: 1, date: "2026-08-07", status: "READY", plan: {}, summary: "A safe summary", sourceVersion: "a".repeat(64), generatedAt: "2026-08-07T09:00:00.000Z", expiresAt: "2026-08-07T15:00:00.000Z" };

function request(body: Record<string, unknown> = {}) {
  return new Request("https://tasklaunch.test/api/daily-executive-brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("POST /api/daily-executive-brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.createRepository.mockReturnValue({});
    mocks.generate.mockResolvedValue({ snapshot: brief, reused: false });
  });

  it("authenticates and returns a generated brief without trusting client task data", async () => {
    const response = await POST(request({ tasks: [{ id: "attacker-task" }], timezone: "UTC" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reused: false, brief });
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", forceRefresh: false }));
  });

  it("rejects deleted accounts before creating a repository", async () => {
    mocks.isDeletedAccountUid.mockResolvedValueOnce(true);
    const response = await POST(request());
    expect(response.status).toBe(410);
    expect(mocks.createRepository).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("passes explicit refresh through to the generation service", async () => {
    await POST(request({ forceRefresh: true }));
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true }));
  });

  it("rejects unsafe available-time overrides before generation", async () => {
    const response = await POST(request({ availableMinutes: 0 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "brief/invalid-available-time" });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
