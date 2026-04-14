export const DEFAULT_OPTIMAL_PRODUCTIVITY_START_TIME = "00:00";
export const DEFAULT_OPTIMAL_PRODUCTIVITY_END_TIME = "23:59";

export type OptimalProductivityPeriod = {
  startTime: string;
  endTime: string;
};

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
