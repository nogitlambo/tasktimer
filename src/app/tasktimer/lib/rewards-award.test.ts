import { afterEach, describe, expect, it, vi } from "vitest";

import {
  awardDailyOpenReward,
  awardCompletedSessionXp,
  buildRankLadderSummary,
  DAILY_OPEN_REWARD_XP,
  DEFAULT_REWARD_PROGRESS,
  getPersistedRewardProgressUpdate,
  getRankForXp,
  isDailyOpenRewardEligible,
  MIN_REWARD_ELIGIBLE_SESSION_MS,
  RANK_LADDER,
  normalizeRewardProgress,
} from "./rewards";
import { computeMomentumSnapshot } from "./momentum";
import type { Task } from "./types";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Focus",
    order: 0,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestones: [],
    hasStarted: true,
    ...overrides,
  };
}

describe("awardCompletedSessionXp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still awards session XP when the device clock is behind the latest ledger entry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T09:50:00.000Z"));

    const progress = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 1,
      totalXpPrecise: 1,
      completedSessions: 1,
      lastAwardedAt: Date.parse("2026-05-05T10:00:00.000Z"),
      awardLedger: [
        {
          ts: Date.parse("2026-05-05T10:00:00.000Z"),
          dayKey: "2026-05-05",
          taskId: "task-older",
          xp: 1,
          baseXp: 1,
          multiplier: 1,
          eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
          reason: "session",
          sourceKey: "session:task-older:1746439200000:0",
        },
      ],
    });

    const result = awardCompletedSessionXp(progress, {
      taskId: "task-new",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-new": [
          {
            ts: Date.now(),
            name: "Task New",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXpPrecise).toBe(2);
    expect(result.next.totalXp).toBe(2);
    expect(result.next.completedSessions).toBe(2);
  });

  it("does not apply a global daily session XP cap across different tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previousLedger = Array.from({ length: 12 }, (_, index) => {
      const ts = Date.parse("2026-05-05T08:00:00.000Z") + index * MIN_REWARD_ELIGIBLE_SESSION_MS;
      return {
        ts,
        dayKey: "2026-05-05",
        taskId: `task-${index}`,
        xp: 1,
        baseXp: 1,
        multiplier: 1,
        eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
        reason: "session" as const,
        sourceKey: `session:task-${index}:${ts}:0`,
      };
    });
    const progress = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 12,
      totalXpPrecise: 12,
      completedSessions: 12,
      lastAwardedAt: previousLedger[previousLedger.length - 1]?.ts,
      awardLedger: previousLedger,
    });

    const result = awardCompletedSessionXp(progress, {
      taskId: "task-new",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-new": [
          {
            ts: Date.now(),
            name: "Task New",
            ms: MIN_REWARD_ELIGIBLE_SESSION_MS,
          },
        ],
      },
      tasks: [],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXpPrecise).toBe(13);
    expect(result.next.totalXp).toBe(13);
    expect(result.next.completedSessions).toBe(13);
  });

  it("awards one XP for a two-minute no-goal task session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(1);
    expect(result.next.totalXpPrecise).toBe(1);
    expect(result.next.totalXp).toBe(1);
    expect(result.next.completedSessions).toBe(1);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      taskId: "task-1",
      eligibleMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      baseXp: 1,
      multiplier: 1,
      xp: 1,
    });
  });

  it("does not award XP below two minutes but still counts the completed session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS - 1,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS - 1 }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(0);
    expect(result.next.totalXp).toBe(0);
    expect(result.next.completedSessions).toBe(1);
    expect(result.next.awardLedger).toEqual([]);
  });

  it("caps a no-goal task session at sixty minutes per day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 120 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const sessionEligibleMs = result.next.awardLedger
      .filter((entry) => entry.reason === "session")
      .reduce((sum, entry) => sum + entry.eligibleMs, 0);
    expect(sessionEligibleMs).toBe(60 * MINUTE_MS);
    expect(result.next.totalXpPrecise).toBe(30);
    expect(result.next.totalXp).toBe(30);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      eligibleMs: 60 * MINUTE_MS,
      baseXp: 30,
      multiplier: 1,
    });
  });

  it("caps a daily-goal task at its configured daily goal minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 45 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task({ timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 30 })],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(15);
    expect(result.next.totalXp).toBe(15);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      eligibleMs: 30 * MINUTE_MS,
      baseXp: 15,
    });
  });

  it("uses the sixty-minute fallback cap for weekly-goal tasks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const elapsedMs = 90 * MINUTE_MS;
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: elapsedMs }],
      },
      tasks: [task({ timeGoalEnabled: true, timeGoalPeriod: "week", timeGoalMinutes: 120 })],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    const sessionEligibleMs = result.next.awardLedger
      .filter((entry) => entry.reason === "session")
      .reduce((sum, entry) => sum + entry.eligibleMs, 0);
    expect(sessionEligibleMs).toBe(60 * MINUTE_MS);
    expect(result.next.totalXp).toBeGreaterThanOrEqual(30);
  });

  it("persists extra logged time after the cap without awarding more session XP", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previous = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now() - MINUTE_MS,
      elapsedMs: 60 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now() - MINUTE_MS, name: "Focus", ms: 60 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    }).next;

    const result = awardCompletedSessionXp(previous, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: 10 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: 70 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
      completedSessionsDelta: 0,
    });

    expect(result.amount).toBe(0);
    expect(result.next.totalXp).toBe(30);
    expect(result.next.completedSessions).toBe(1);
  });

  it("awards daily-goal session XP again after a reset boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const firstCompletedAt = Date.now() - 2 * MINUTE_MS;
    const resetAt = Date.now() - MINUTE_MS;
    const secondCompletedAt = Date.now();
    const dailyGoalTask = task({ timeGoalEnabled: true, timeGoalPeriod: "day", timeGoalMinutes: 30 });
    const first = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: firstCompletedAt,
      elapsedMs: 30 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: firstCompletedAt, name: "Focus", ms: 30 * MINUTE_MS }],
      },
      tasks: [dailyGoalTask],
      weekStarting: "mon",
      momentumEntitled: false,
    }).next;

    const result = awardCompletedSessionXp(first, {
      taskId: "task-1",
      awardedAt: secondCompletedAt,
      elapsedMs: 30 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [
          { ts: firstCompletedAt, name: "Focus", ms: 30 * MINUTE_MS },
          { ts: secondCompletedAt, name: "Focus", ms: 30 * MINUTE_MS },
        ],
      },
      tasks: [dailyGoalTask],
      weekStarting: "mon",
      momentumEntitled: false,
      historyCapBoundaryMs: resetAt,
      sessionSegments: [
        {
          startMs: secondCompletedAt - 30 * MINUTE_MS,
          endMs: secondCompletedAt,
          multiplier: 1.5,
        },
      ],
    });

    expect(first.totalXpPrecise).toBe(15);
    expect(result.amount).toBe(22.5);
    expect(result.next.totalXpPrecise).toBe(37.5);
    expect(result.next.completedSessions).toBe(2);
    expect(result.next.awardLedger.at(-1)).toMatchObject({
      reason: "session",
      eligibleMs: 30 * MINUTE_MS,
      baseXp: 15,
      multiplier: 1.5,
      xp: 22.5,
    });
  });

  it("applies Momentum multipliers without an advancedInsights entitlement", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const awardedAt = Date.now();
    const historyByTaskId = {
      "task-1": Array.from({ length: 5 }, (_, index) => ({
        ts: awardedAt - index * DAY_MS - (index === 0 ? MINUTE_MS : 0),
        name: "Focus",
        ms: 5 * MINUTE_MS,
      })),
    };
    const tasks = [task({ running: true, startMs: awardedAt - MIN_REWARD_ELIGIBLE_SESSION_MS })];
    const expectedMultiplier = computeMomentumSnapshot({
      tasks,
      historyByTaskId,
      weekStarting: "mon",
      nowValue: awardedAt,
    }).multiplier;
    const expectedXp = expectedMultiplier;

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt,
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId,
      tasks,
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.amount).toBe(expectedXp);
    expect(result.next.totalXpPrecise).toBe(expectedXp);
    expect(result.next.totalXp).toBe(1);
    expect(result.next.awardLedger[0]).toMatchObject({
      reason: "session",
      baseXp: 1,
      multiplier: expectedMultiplier,
      xp: expectedXp,
    });
  });

  it("scales session XP from the base rate across the multiplier table", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const awardedAt = Date.now();
    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt,
      elapsedMs: 4 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: awardedAt, name: "Focus", ms: 4 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
      sessionSegments: [
        { startMs: awardedAt - 4 * MINUTE_MS, endMs: awardedAt - 3 * MINUTE_MS, multiplier: 1 },
        { startMs: awardedAt - 3 * MINUTE_MS, endMs: awardedAt - 2 * MINUTE_MS, multiplier: 1.2 },
        { startMs: awardedAt - 2 * MINUTE_MS, endMs: awardedAt - MINUTE_MS, multiplier: 1.5 },
        { startMs: awardedAt - MINUTE_MS, endMs: awardedAt, multiplier: 2 },
      ],
    });

    expect(result.next.awardLedger.map((entry) => entry.xp)).toEqual([0.5, 0.6, 0.75, 1]);
    expect(result.next.awardLedger.map((entry) => entry.multiplier)).toEqual([1, 1.2, 1.5, 2]);
    expect(result.amount).toBe(2.85);
    expect(result.next.totalXpPrecise).toBe(2.85);
    expect(result.next.totalXp).toBe(2);
  });
});

describe("awardDailyOpenReward", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("awards ten XP on the first app open claim for a local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 10, 0, 0, 0));

    const result = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, Date.now());

    expect(result.amount).toBe(DAILY_OPEN_REWARD_XP);
    expect(result.next.totalXp).toBe(10);
    expect(result.next.totalXpPrecise).toBe(10);
    expect(result.next.lastDailyRewardAwardedAtMs).toBe(Date.now());
    expect(result.next.awardLedger.at(-1)).toMatchObject({
      reason: "dailyOpen",
      taskId: null,
      xp: DAILY_OPEN_REWARD_XP,
      baseXp: DAILY_OPEN_REWARD_XP,
      multiplier: 1,
      eligibleMs: 0,
      sourceKey: "dailyOpen:2026-05-05",
    });
  });

  it("does not award twice for the same local day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 10, 0, 0, 0));

    const first = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, Date.now()).next;
    const second = awardDailyOpenReward(first, Date.now() + 60 * 60 * 1000);

    expect(second.amount).toBe(0);
    expect(second.next.totalXp).toBe(10);
    expect(second.next.awardLedger.filter((entry) => entry.reason === "dailyOpen")).toHaveLength(1);
  });

  it("awards again on the next local day without backfilling missed days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 10, 0, 0, 0));

    const first = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, Date.now()).next;
    const threeDaysLater = new Date(2026, 4, 8, 10, 0, 0, 0).getTime();
    vi.setSystemTime(new Date(threeDaysLater));
    const second = awardDailyOpenReward(first, threeDaysLater);

    expect(second.amount).toBe(DAILY_OPEN_REWARD_XP);
    expect(second.next.totalXp).toBe(20);
    expect(second.next.awardLedger.filter((entry) => entry.reason === "dailyOpen")).toHaveLength(2);
    expect(second.next.awardLedger.at(-1)?.sourceKey).toBe("dailyOpen:2026-05-08");
  });

  it("normalizes missing daily reward timestamps to null", () => {
    expect(normalizeRewardProgress({ ...DEFAULT_REWARD_PROGRESS, lastDailyRewardAwardedAtMs: undefined }).lastDailyRewardAwardedAtMs).toBeNull();
  });

  it("reports eligibility from the last awarded local day", () => {
    const sameDayMorning = new Date(2026, 4, 5, 10, 0, 0, 0).getTime();
    const sameDayEvening = new Date(2026, 4, 5, 18, 0, 0, 0).getTime();
    const nextDay = new Date(2026, 4, 6, 10, 0, 0, 0).getTime();
    const previous = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      lastDailyRewardAwardedAtMs: sameDayMorning,
    });

    expect(isDailyOpenRewardEligible(previous, sameDayEvening)).toBe(false);
    expect(isDailyOpenRewardEligible(previous, nextDay)).toBe(true);
  });
});

describe("rank ladder", () => {
  it("uses the configured unlock thresholds", () => {
    expect(RANK_LADDER.map(({ id, minXp }) => [id, minXp])).toEqual([
      ["unranked", 0],
      ["initiate", 10],
      ["operator", 60],
      ["technician", 240],
      ["engineer", 960],
      ["analyst", 2880],
      ["specialist", 5760],
      ["strategist", 8640],
      ["director", 12000],
      ["ascendent", 15600],
      ["commander", 18720],
      ["architect", 22460],
      ["overseer", 26900],
      ["visionary", 32280],
      ["sovereign", 38740],
      ["mythic", 50000],
    ]);
    expect(getRankForXp(9).id).toBe("unranked");
    expect(getRankForXp(10).id).toBe("initiate");
    expect(getRankForXp(59).id).toBe("initiate");
    expect(getRankForXp(60).id).toBe("operator");
    expect(getRankForXp(50000).id).toBe("mythic");
  });

  it("builds the rank ladder summary for unranked users", () => {
    expect(buildRankLadderSummary(0)).toBe("Your current rank is: Unranked.\nYou need 10 XP to move up to Initiate.");
  });

  it("builds the rank ladder summary near the next threshold", () => {
    expect(buildRankLadderSummary(59)).toBe("Your current rank is: Initiate.\nYou need 1 XP to move up to Operator.");
  });

  it("builds the rank ladder summary for max-rank users", () => {
    expect(buildRankLadderSummary(50000)).toBe("Your current rank is: Mythic.\nYou have reached the highest configured rank.");
  });
});

describe("reward progress normalization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("backfills legacy unlocked ranks from retained reward history", () => {
    const initiateAt = Date.parse("2026-05-01T09:00:00.000Z");
    const operatorAt = Date.parse("2026-05-02T09:00:00.000Z");

    const normalized = normalizeRewardProgress(
      {
        ...DEFAULT_REWARD_PROGRESS,
        totalXp: 60,
        totalXpPrecise: 60,
        currentRankId: "operator",
        awardLedger: [
          {
            ts: initiateAt,
            dayKey: "2026-05-01",
            taskId: "task-1",
            xp: 10,
            baseXp: 10,
            multiplier: 1,
            eligibleMs: 0,
            reason: "dailyOpen",
            sourceKey: "legacy:initiate",
          },
          {
            ts: operatorAt,
            dayKey: "2026-05-02",
            taskId: "task-1",
            xp: 50,
            baseXp: 50,
            multiplier: 1,
            eligibleMs: 0,
            reason: "dailyOpen",
            sourceKey: "legacy:operator",
          },
        ],
      },
      { nowMs: operatorAt }
    );

    expect(normalized.rankPromotionsById).toEqual({
      initiate: { promotedAt: initiateAt, promotedAtXp: 10 },
      operator: { promotedAt: operatorAt, promotedAtXp: 60 },
    });
  });

  it("preserves valid promotion records and backfills only missing unlocked ranks", () => {
    const initiateAt = Date.parse("2026-05-01T09:00:00.000Z");
    const operatorAt = Date.parse("2026-05-02T09:00:00.000Z");
    const technicianAt = Date.parse("2026-05-03T09:00:00.000Z");

    const normalized = normalizeRewardProgress(
      {
        ...DEFAULT_REWARD_PROGRESS,
        totalXp: 240,
        totalXpPrecise: 240,
        currentRankId: "technician",
        rankPromotionsById: {
          operator: {
            promotedAt: operatorAt,
            promotedAtXp: 60,
          },
        },
        awardLedger: [
          {
            ts: initiateAt,
            dayKey: "2026-05-01",
            taskId: "task-1",
            xp: 10,
            baseXp: 10,
            multiplier: 1,
            eligibleMs: 0,
            reason: "dailyOpen",
            sourceKey: "legacy:initiate",
          },
          {
            ts: operatorAt,
            dayKey: "2026-05-02",
            taskId: "task-1",
            xp: 50,
            baseXp: 50,
            multiplier: 1,
            eligibleMs: 0,
            reason: "dailyOpen",
            sourceKey: "legacy:operator",
          },
          {
            ts: technicianAt,
            dayKey: "2026-05-03",
            taskId: "task-1",
            xp: 180,
            baseXp: 180,
            multiplier: 1,
            eligibleMs: 0,
            reason: "dailyOpen",
            sourceKey: "legacy:technician",
          },
        ],
      },
      { nowMs: technicianAt }
    );

    expect(normalized.rankPromotionsById).toEqual({
      initiate: { promotedAt: initiateAt, promotedAtXp: 10 },
      operator: { promotedAt: operatorAt, promotedAtXp: 60 },
      technician: { promotedAt: technicianAt, promotedAtXp: 240 },
    });
  });

  it("falls back to the normalization timestamp for malformed or non-inferable promotion records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const { normalized, changed } = getPersistedRewardProgressUpdate({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 960,
      totalXpPrecise: 960,
      currentRankId: "engineer",
      rankPromotionsById: {
        initiate: { promotedAt: 0, promotedAtXp: 10 },
        operator: { promotedAt: Number.NaN, promotedAtXp: 60 },
      },
    });

    expect(changed).toBe(true);
    expect(normalized.rankPromotionsById).toEqual({
      initiate: { promotedAt: Date.now(), promotedAtXp: 10 },
      operator: { promotedAt: Date.now(), promotedAtXp: 60 },
      technician: { promotedAt: Date.now(), promotedAtXp: 240 },
      engineer: { promotedAt: Date.now(), promotedAtXp: 960 },
    });
  });
});

describe("rank promotion metadata writes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the promotion timestamp and threshold XP for a single-rank promotion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previous = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 59,
      totalXpPrecise: 59,
      currentRankId: "initiate",
      rankPromotionsById: {
        initiate: {
          promotedAt: Date.parse("2026-05-01T10:00:00.000Z"),
          promotedAtXp: 10,
        },
      },
    });

    const result = awardCompletedSessionXp(previous, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
    });

    expect(result.next.rankPromotionsById.operator).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 60,
    });
  });

  it("stamps all crossed ranks with the same timestamp on a multi-rank promotion", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const result = awardCompletedSessionXp(DEFAULT_REWARD_PROGRESS, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: 60 * MINUTE_MS,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: 60 * MINUTE_MS }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
      sessionSegments: [
        {
          startMs: Date.now() - 60 * MINUTE_MS,
          endMs: Date.now(),
          multiplier: 200,
        },
      ],
    });

    expect(result.next.currentRankId).toBe("specialist");
    expect(result.next.rankPromotionsById.initiate).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 10,
    });
    expect(result.next.rankPromotionsById.operator).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 60,
    });
    expect(result.next.rankPromotionsById.technician).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 240,
    });
    expect(result.next.rankPromotionsById.engineer).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 960,
    });
    expect(result.next.rankPromotionsById.analyst).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 2880,
    });
    expect(result.next.rankPromotionsById.specialist).toEqual({
      promotedAt: Date.now(),
      promotedAtXp: 5760,
    });
  });

  it("does not mutate unrelated promotion metadata when no rank is crossed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T10:00:00.000Z"));

    const previous = normalizeRewardProgress({
      ...DEFAULT_REWARD_PROGRESS,
      totalXp: 60,
      totalXpPrecise: 60,
      currentRankId: "operator",
      rankPromotionsById: {
        initiate: { promotedAt: Date.parse("2026-05-01T10:00:00.000Z"), promotedAtXp: 10 },
        operator: { promotedAt: Date.parse("2026-05-02T10:00:00.000Z"), promotedAtXp: 60 },
      },
    });

    const result = awardCompletedSessionXp(previous, {
      taskId: "task-1",
      awardedAt: Date.now(),
      elapsedMs: MIN_REWARD_ELIGIBLE_SESSION_MS - 1,
      historyByTaskId: {
        "task-1": [{ ts: Date.now(), name: "Focus", ms: MIN_REWARD_ELIGIBLE_SESSION_MS - 1 }],
      },
      tasks: [task()],
      weekStarting: "mon",
      momentumEntitled: false,
      completedSessionsDelta: 0,
    });

    expect(result.next.rankPromotionsById).toEqual(previous.rankPromotionsById);
  });
});
