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

import { DELETE, POST } from "./route";

const snapshot = { localDate: "2026-08-07", state: "LIGHT", manualOverride: { type: "STATE", state: "LIGHT" } };

function request(method: string, body?: Record<string, unknown>) {
  return new Request("https://tasklaunch.test/api/executive-function/capacity/today/override?timezone=UTC", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("today capacity override routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyFirebaseRequestUser.mockResolvedValue({ uid: "uid-1" });
    mocks.getFirebaseAdminDb.mockReturnValue({});
    mocks.isDeletedAccountUid.mockResolvedValue(false);
    mocks.createRepository.mockReturnValue({});
    mocks.getCapacity.mockResolvedValue({ snapshot, reused: false });
  });

  it("persists a validated state override without accepting client history", async () => {
    const response = await POST(request("POST", { type: "STATE", state: "LIGHT", history: [{ minutes: 9999 }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, snapshot });
    expect(mocks.getCapacity).toHaveBeenCalledWith(expect.objectContaining({ uid: "uid-1", manualOverride: expect.objectContaining({ type: "STATE", state: "LIGHT" }), forceRefresh: true }));
  });

  it("accepts custom minutes and rejects unsafe values", async () => {
    await POST(request("POST", { type: "MINUTES", minutes: 45 }));
    expect(mocks.getCapacity).toHaveBeenCalledWith(expect.objectContaining({ manualOverride: expect.objectContaining({ type: "MINUTES", minutes: 45 }) }));
    const response = await POST(request("POST", { type: "MINUTES", minutes: 0 }));
    expect(response.status).toBe(400);
  });

  it("clears the override for the authenticated user and date", async () => {
    const response = await DELETE(request("DELETE"));
    expect(response.status).toBe(200);
    expect(mocks.getCapacity).toHaveBeenCalledWith(expect.objectContaining({ manualOverride: null, forceRefresh: true }));
  });
});
