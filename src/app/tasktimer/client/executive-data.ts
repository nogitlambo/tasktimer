import { getApiUrl } from "../lib/apiClient";
import { parseDailyCapacityResponse, type DailyCapacityDashboardSnapshot } from "./dashboard-daily-capacity";
import { parseBriefResponse, type DailyExecutiveBriefDashboard } from "./dashboard-daily-executive-brief";
import { parseNextBestActionDashboardResponse, type NextBestActionDashboardRecommendation } from "./dashboard-next-best-action";
import { parseRecoveryResponse, type RecoverySession } from "./dashboard-recovery";
import { parseScheduleRepairResponse, type ScheduleRepairDashboardProposal } from "./dashboard-schedule-repair";

type ExecutiveSection<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "empty" }
  | { status: "error"; message: string };

export type ExecutiveDataSnapshot = {
  brief: ExecutiveSection<DailyExecutiveBriefDashboard>;
  capacity: ExecutiveSection<DailyCapacityDashboardSnapshot>;
  nba: ExecutiveSection<NextBestActionDashboardRecommendation>;
  repair: ExecutiveSection<ScheduleRepairDashboardProposal>;
  recovery: ExecutiveSection<RecoverySession>;
};

type LoadExecutiveDataOptions = {
  fetchImpl?: typeof fetch;
  getIdToken: () => Promise<string | null>;
  timezone?: string;
  nowMs?: () => number;
  forceRefresh?: boolean;
};

const SAFE_ERROR_MESSAGE = "This Executive section is unavailable right now.";

function sectionError(): ExecutiveSection<never> {
  return { status: "error", message: SAFE_ERROR_MESSAGE };
}

function sectionFrom<T>(value: T | null, empty = false): ExecutiveSection<T> {
  if (empty || value == null) return { status: "empty" };
  return { status: "ready", value };
}

async function requestJson(options: LoadExecutiveDataOptions, path: string, init: RequestInit = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await options.getIdToken();
  if (!token) throw new Error("missing-session");
  const response = await fetchImpl(getApiUrl(path), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}), "x-firebase-auth": token },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("request-failed");
  return payload;
}

async function loadBrief(options: LoadExecutiveDataOptions): Promise<ExecutiveSection<DailyExecutiveBriefDashboard>> {
  try {
    const payload = await requestJson(options, "/api/daily-executive-brief", {
      method: "POST",
      body: JSON.stringify({ timezone: options.timezone || "UTC", forceRefresh: options.forceRefresh === true }),
    });
    const parsed = parseBriefResponse(payload);
    if (parsed.kind !== "brief") return parsed.kind === "stale" ? sectionError() : { status: "empty" };
    return sectionFrom(parsed.brief);
  } catch {
    return sectionError();
  }
}

async function loadCapacity(options: LoadExecutiveDataOptions): Promise<ExecutiveSection<DailyCapacityDashboardSnapshot>> {
  try {
    const timezone = encodeURIComponent(options.timezone || "UTC");
    const force = options.forceRefresh ? "&forceRefresh=true" : "";
    const payload = await requestJson(options, `/api/executive-function/capacity/today?timezone=${timezone}${force}`, { headers: {} });
    const parsed = parseDailyCapacityResponse(payload);
    return parsed.kind === "capacity" ? sectionFrom(parsed.capacity) : sectionError();
  } catch {
    return sectionError();
  }
}

async function loadNba(options: LoadExecutiveDataOptions): Promise<ExecutiveSection<NextBestActionDashboardRecommendation>> {
  try {
    const payload = await requestJson(options, "/api/recommendations/next-best-action", {
      method: "POST",
      body: JSON.stringify({ timezone: options.timezone || "UTC" }),
    });
    const parsed = parseNextBestActionDashboardResponse(payload, options.nowMs?.() ?? Date.now());
    if (parsed.kind === "recommendation") return sectionFrom(parsed.recommendation);
    if (parsed.kind === "empty") return { status: "empty" };
    return sectionError();
  } catch {
    return sectionError();
  }
}

async function loadRepair(options: LoadExecutiveDataOptions): Promise<ExecutiveSection<ScheduleRepairDashboardProposal>> {
  try {
    const payload = await requestJson(options, "/api/executive-function/schedule-repair", {
      method: "POST",
      body: JSON.stringify({ timezone: options.timezone || "UTC", forceRefresh: options.forceRefresh === true }),
    });
    const parsed = parseScheduleRepairResponse(payload);
    return parsed.kind === "proposal" ? sectionFrom(parsed.proposal) : { status: "empty" };
  } catch {
    return sectionError();
  }
}

async function loadRecovery(options: LoadExecutiveDataOptions): Promise<ExecutiveSection<RecoverySession>> {
  try {
    const payload = await requestJson(options, "/api/executive-function/recovery", {
      method: "POST",
      body: JSON.stringify({ timezone: options.timezone || "UTC", forceRefresh: options.forceRefresh === true, userRequested: false }),
    });
    const parsed = parseRecoveryResponse(payload);
    return parsed.kind === "session" ? sectionFrom(parsed.session) : { status: "empty" };
  } catch {
    return sectionError();
  }
}

export async function loadExecutiveData(options: LoadExecutiveDataOptions): Promise<ExecutiveDataSnapshot> {
  const [brief, capacity, nba, repair, recovery] = await Promise.all([
    loadBrief(options),
    loadCapacity(options),
    loadNba(options),
    loadRepair(options),
    loadRecovery(options),
  ]);
  return { brief, capacity, nba, repair, recovery };
}
