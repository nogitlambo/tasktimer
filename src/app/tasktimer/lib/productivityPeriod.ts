import { normalizeDashboardWeekStart, type DashboardWeekStart } from "./historyChart";

export const DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME = "00:00";
export const DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME = "23:59";
export const DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS: readonly DashboardWeekStart[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const OPTIMAL_PRODUCTIVITY_DAY_LABELS: ReadonlyArray<{ value: DashboardWeekStart; label: string; shortLabel: string }> = [
  { value: "sun", label: "Sunday", shortLabel: "Sun" },
  { value: "mon", label: "Monday", shortLabel: "Mon" },
  { value: "tue", label: "Tuesday", shortLabel: "Tue" },
  { value: "wed", label: "Wednesday", shortLabel: "Wed" },
  { value: "thu", label: "Thursday", shortLabel: "Thu" },
  { value: "fri", label: "Friday", shortLabel: "Fri" },
  { value: "sat", label: "Saturday", shortLabel: "Sat" },
] as const;

export type OptimalProductivityPeriod = {
  startTime: string;
  endTime: string;
};

export type OptimalProductivityDays = DashboardWeekStart[];

export function normalizeTimeOfDay(value: unknown, fallback: string): string {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return fallback;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeOptimalProductivityPeriod(value: {
  optimalProductivityStartTime?: unknown;
  optimalProductivityEndTime?: unknown;
}): OptimalProductivityPeriod {
  return {
    startTime: normalizeTimeOfDay(value.optimalProductivityStartTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME),
    endTime: normalizeTimeOfDay(value.optimalProductivityEndTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME),
  };
}

export function normalizeOptimalProductivityDays(value: unknown): OptimalProductivityDays {
  const source = Array.isArray(value) ? value : typeof value === "string" ? String(value).split(",") : [];
  const seen = new Set<DashboardWeekStart>();
  const normalized = source.reduce<OptimalProductivityDays>((days, entry) => {
    const day = normalizeDashboardWeekStart(entry);
    const raw = String(entry || "").trim().toLowerCase();
    if (raw !== day || seen.has(day)) return days;
    seen.add(day);
    days.push(day);
    return days;
  }, []);
  if (!normalized.length) return [...DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS];
  return DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.filter((day) => seen.has(day));
}

export function isOptimalProductivityDay(day: unknown): day is DashboardWeekStart {
  return DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.includes(normalizeDashboardWeekStart(day));
}

export function localDayToDashboardWeekStart(ts: number): DashboardWeekStart {
  const dayIndex = new Date(ts).getDay();
  return (DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS[dayIndex] || "sun") as DashboardWeekStart;
}

export function timestampIsInOptimalProductivityDays(ts: number, days: OptimalProductivityDays): boolean {
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const normalizedDays = normalizeOptimalProductivityDays(days);
  return normalizedDays.includes(localDayToDashboardWeekStart(ts));
}

export function buildOptimalProductivityDaysSummary(days: OptimalProductivityDays): string {
  const normalizedDays = normalizeOptimalProductivityDays(days);
  if (normalizedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length) return "All days";
  return OPTIMAL_PRODUCTIVITY_DAY_LABELS.filter((day) => normalizedDays.includes(day.value))
    .map((day) => day.shortLabel)
    .join(", ");
}

export function timeOfDayToMinutes(value: unknown, fallback: string): number {
  const normalized = normalizeTimeOfDay(value, fallback);
  const [hourRaw, minuteRaw] = normalized.split(":");
  return Math.max(0, Math.min(1439, Number(hourRaw || 0) * 60 + Number(minuteRaw || 0)));
}

export function isMinuteInProductivityPeriod(minuteOfDay: number, period: OptimalProductivityPeriod): boolean {
  const minute = Math.max(0, Math.min(1439, Math.floor(Number(minuteOfDay) || 0)));
  const start = timeOfDayToMinutes(period.startTime, DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME);
  const end = timeOfDayToMinutes(period.endTime, DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME);
  if (start <= end) return minute >= start && minute <= end;
  return minute >= start || minute <= end;
}

export function timestampIsInProductivityPeriod(ts: number, period: OptimalProductivityPeriod): boolean {
  if (!Number.isFinite(ts) || ts <= 0) return false;
  const date = new Date(ts);
  return isMinuteInProductivityPeriod(date.getHours() * 60 + date.getMinutes(), period);
}
