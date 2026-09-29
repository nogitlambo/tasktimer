import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REWARD_PROGRESS, awardDailyOpenReward, preserveDailyOpenRewards } from "./rewards";
import { localDayKey } from "./history";

const state = vi.hoisted(() => ({
  uid: "user-1", offline: false, loseResponse: false, revision: 0,
  docs: new Map<string, Record<string, unknown>>(),
  listener: null as null | ((snapshot: unknown) => void),
}));
vi.mock("@/lib/firebaseClient", () => ({ getFirebaseAuthClient: () => ({ currentUser: { uid: state.uid } }) }));
vi.mock("@/lib/firebaseFirestoreClient", () => ({ getFirebaseFirestoreClient: () => ({}) }));
vi.mock("./cloudStore", async (importOriginal) => ({
  ...await importOriginal<typeof import("./cloudStore")>(),
  saveUserRootPatch: vi.fn(async () => {}),
}));
vi.mock("firebase/firestore", () => {
  const snapshot = (path: string) => {
    const value = structuredClone(state.docs.get(path));
    return { exists: () => !!value, data: () => value };
  };
  return {
    doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
    serverTimestamp: () => "SERVER_TIME",
    getDocFromServer: async (path: string) => {
      if (state.offline) throw new Error("offline");
      return snapshot(path);
    },
    onSnapshot: (_ref: unknown, _options: unknown, callback: (snapshot: unknown) => void) => {
      state.listener = callback;
      return () => { state.listener = null; };
    },
    // Optimistic retries model two independent clients reading the same revision.
    runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => {
      for (let attempt = 0; attempt < 10; attempt++) {
        if (state.offline) throw new Error("offline");
        const revision = state.revision;
        const writes = new Map<string, Record<string, unknown>>();
        const result = await callback({
          get: async (path: string) => snapshot(path),
          set: (path: string, value: Record<string, unknown>) => writes.set(path, value),
        });
        if (revision !== state.revision) continue;
        for (const [path, value] of writes) state.docs.set(path, value);
        if (writes.size) state.revision++;
        if (state.loseResponse) { state.loseResponse = false; throw new Error("response lost"); }
        return result;
      }
      throw new Error("contention");
    },
  };
});

import { checkDailyRewardEligibility, claimDailyReward, subscribeDailyRewardClaim } from "./dailyRewardClaims";
import { buildDefaultUserPreferences } from "./cloudStore";

const preferencesPath = "users/user-1/preferences/v1";
const now = new Date(2026, 8, 29, 12).getTime();
const dayKey = localDayKey(now);
const claimPath = `users/user-1/dailyRewardClaims/${dayKey}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  state.uid = "user-1";
  state.offline = false;
  state.loseResponse = false;
  state.revision = 0;
  state.docs.clear();
  state.listener = null;
  state.docs.set(preferencesPath, { ...buildDefaultUserPreferences(), startupModule: "dashboard" });
});
afterEach(() => vi.useRealTimers());

describe("account-wide daily claims", () => {
  it("awards only once when two devices concurrently claim without a shared cache", async () => {
    const results = await Promise.all([claimDailyReward("user-1"), claimDailyReward("user-1")]);
    expect(results.map((result) => result.status).sort()).toEqual(["alreadyClaimed", "awarded"]);
    expect(state.docs.get(preferencesPath)).toMatchObject({ startupModule: "dashboard", rewards: { totalXp: 10 } });
    expect(state.docs.get(claimPath)).toEqual({ dayKey, xp: 10, sourceKey: `dailyOpen:${dayKey}`, claimedAt: "SERVER_TIME" });
    expect(await checkDailyRewardEligibility("user-1")).toBe("alreadyClaimed");
    expect((await claimDailyReward("user-1")).status).toBe("alreadyClaimed");
  });

  it("checks eligibility without consuming or awarding a new reward", async () => {
    expect(await checkDailyRewardEligibility("user-1")).toBe("eligible");
    expect(state.docs.has(claimPath)).toBe(false);
    expect(state.docs.get(preferencesPath)?.rewards).toMatchObject({ totalXp: 0 });
  });

  it("does not repay a committed claim after a lost response", async () => {
    state.loseResponse = true;
    expect((await claimDailyReward("user-1")).status).toBe("retryable");
    expect((await claimDailyReward("user-1")).status).toBe("alreadyClaimed");
    expect(state.docs.get(preferencesPath)?.rewards).toMatchObject({ totalXp: 10 });
  });

  it("defers while offline and succeeds after reconnecting", async () => {
    state.offline = true;
    expect(await checkDailyRewardEligibility("user-1")).toBe("retryable");
    expect((await claimDailyReward("user-1")).status).toBe("retryable");
    expect(state.docs.has(claimPath)).toBe(false);
    state.offline = false;
    expect((await claimDailyReward("user-1")).status).toBe("awarded");
  });

  it.each(["timestamp", "ledger"])("seeds a legacy %s claim without changing existing XP", async (evidence) => {
    const rewards = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, now).next;
    if (evidence === "timestamp") rewards.awardLedger = [];
    else rewards.lastDailyRewardAwardedAtMs = null;
    state.docs.set(preferencesPath, { ...buildDefaultUserPreferences(), rewards });
    expect(await checkDailyRewardEligibility("user-1")).toBe("alreadyClaimed");
    expect(state.docs.has(claimPath)).toBe(true);
    expect(state.docs.get(preferencesPath)?.rewards).toEqual(rewards);
    expect((await claimDailyReward("user-1")).status).toBe("alreadyClaimed");
  });

  it("permits a new reward at local midnight", async () => {
    await claimDailyReward("user-1");
    vi.setSystemTime(new Date(2026, 8, 30, 0, 0, 0));
    expect(await checkDailyRewardEligibility("user-1")).toBe("eligible");
    expect((await claimDailyReward("user-1")).status).toBe("awarded");
    expect(state.docs.get(preferencesPath)?.rewards).toMatchObject({ totalXp: 20 });
  });

  it("rejects an account or day that changed before transaction completion", async () => {
    const pending = claimDailyReward("user-1");
    state.uid = "user-2";
    expect((await pending).status).toBe("retryable");
    expect(state.docs.has(claimPath)).toBe(false);
    state.uid = "user-1";
    expect((await claimDailyReward("user-1", now - 86400000)).status).toBe("retryable");
  });

  it("uses only confirmed subscription snapshots and ignores unmounted/account-switched results", async () => {
    await claimDailyReward("user-1");
    const onClaimed = vi.fn();
    const stop = subscribeDailyRewardClaim("user-1", dayKey, onClaimed);
    const emit = (fromCache: boolean, hasPendingWrites: boolean) => state.listener?.({ exists: () => true, metadata: { fromCache, hasPendingWrites } });
    emit(true, false);
    emit(false, true);
    await Promise.resolve();
    expect(onClaimed).not.toHaveBeenCalled();
    emit(false, false);
    await Promise.resolve();
    expect(onClaimed).toHaveBeenCalledTimes(1);
    emit(false, false);
    stop();
    await Promise.resolve();
    expect(onClaimed).toHaveBeenCalledTimes(1);
    subscribeDailyRewardClaim("user-1", dayKey, onClaimed);
    emit(false, false);
    state.uid = "user-2";
    await Promise.resolve();
    expect(onClaimed).toHaveBeenCalledTimes(1);
  });
});

describe("stale daily reward reconciliation", () => {
  it("does not add XP already represented by a legacy timestamp-only snapshot", () => {
    const committed = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, now).next;
    const legacy = { ...committed, awardLedger: [] };
    expect(preserveDailyOpenRewards(legacy, committed).totalXp).toBe(10);
  });
  it("preserves other XP and adds each missing daily award once", () => {
    const committed = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, now).next;
    const stale = { ...DEFAULT_REWARD_PROGRESS, totalXp: 75, totalXpPrecise: 75, completedSessions: 3 };
    const merged = preserveDailyOpenRewards(stale, committed);
    expect(merged).toMatchObject({ totalXp: 85, totalXpPrecise: 85, completedSessions: 3, lastDailyRewardAwardedAtMs: now });
    expect(preserveDailyOpenRewards(merged, committed)).toEqual(merged);
    expect(merged.awardLedger).toHaveLength(1);
  });
});
