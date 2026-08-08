import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyFirebaseRequestUser: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  isDeletedAccountUid: vi.fn(),
  createRepository: vi.fn(),
  getCapacity: vi.fn(),
}));

vi.mock("@/app/api/shared/auth", () => ({ verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser }));
vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));
vi.mock("@/app/api/account/deletedAccountUid", () => ({ isDeletedAccountUid: mocks.isDeletedAccountUid }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityRepository", () => ({ createFirestoreDailyCapacityRepository: mocks.createRepository }));
vi.mock("@/app/adaptivecapacity/lib/dailyCapacityService", () => ({ getDailyCapacity: mocks.getCapacity }));

import { GET } from "./route";

const snapshot = {
  schemaVersion: 1,
  id: "uid-1-2026-08-07-aabbccddeeff0011",
  userId: "uid-1",
  localDate: "2026-08-07",
  fullDayRange: { min: 30, max: 60 },
  remainingRange: { min: 30, max: 60 },
  completedMinutesToday: 0,
  availableMinutesCeiling: null,
  state: "STANDARD",
  confidence: "LOW",
  primarySource: "DEFAULT",
  sourceSignals: ["DEFAULT_BASELINE", "INSUFFICIENT_HISTORY"],
  manualOverride: null,
  historicalSampleSize: 0,
  generatedAt: "2026-08-07T09:00:00.000Z",
  expiresAt: "2026-08-07T09:15:00.000Z",
  sourceVersion: "a".repeat(64),
};

function request(query = "") {
  return new Request(`https://tasklaunch.test/api/executive-function/capacity/today${query}`, { headers: { origin: "https://tasklaunch.app" } });
}

describe("GET /api/executive-function/capacity/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.createRepository.mockReturnValue({});
    mocks.getCapacity.mockResolvedValue({ snapshot, reused: false });
  });

  it("returns an authenticated user-scoped default snapshot without trusting client task data", async () => {
    const response = await GET(request("?timezone=Australia%2FSydney&tasks=attacker-data"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, reused: false, snapshot });
    expect(mocks.getCapacity).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", timezone: "Australia/Sydney", forceRefresh: false }));
  });

  it("rejects unsafe available-time ceilings", async () => {
    const response = await GET(request("?availableMinutes=0"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "capacity/invalid-available-time" });
    expect(mocks.getCapacity).not.toHaveBeenCalled();
  });

  it("rejects deleted accounts before loading capacity", async () => {
    mocks.isDeletedAccountUid.mockResolvedValueOnce(true);
    const response = await GET(request());
    expect(response.status).toBe(410);
    expect(mocks.createRepository).not.toHaveBeenCalled();
  });

  it("passes explicit refresh and available-time ceilings to the service", async () => {
    await GET(request("?forceRefresh=true&availableMinutes=15"));
    expect(mocks.getCapacity).toHaveBeenCalledWith(expect.objectContaining({ forceRefresh: true, availableMinutesCeiling: 15 }));
  });
});
