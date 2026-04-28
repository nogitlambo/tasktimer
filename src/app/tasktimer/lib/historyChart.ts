export type DashboardWeekStart = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export function normalizeDashboardWeekStart(value: unknown): DashboardWeekStart {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "sun" ||
    normalized === "mon" ||
    normalized === "tue" ||
    normalized === "wed" ||
    normalized === "thu" ||
    normalized === "fri" ||
    normalized === "sat"
  ) {
    return normalized;
  }
  return "mon";
}

function weekdayIndexForWeekStart(dayOfWeek: number, weekStart: DashboardWeekStart) {
  const safeDayOfWeek = Math.max(0, Math.min(6, Math.floor(dayOfWeek)));
  const weekStartIndexByKey: Record<DashboardWeekStart, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekStartIndex = weekStartIndexByKey[weekStart] ?? 1;
  return (safeDayOfWeek - weekStartIndex + 7) % 7;
}

export function getDashboardWeekdayLabels(weekStart: DashboardWeekStart, format: "narrow" | "short" = "short") {
  const labels =
    format === "narrow"
      ? ["S", "M", "T", "W", "T", "F", "S"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekStartIndexByKey: Record<DashboardWeekStart, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const weekStartIndex = weekStartIndexByKey[weekStart] ?? 1;
  return labels.slice(weekStartIndex).concat(labels.slice(0, weekStartIndex));
}

export function startOfCurrentWeekMs(nowValue: number, weekStart: DashboardWeekStart) {
  const d = new Date(nowValue);
  const delta = weekdayIndexForWeekStart(d.getDay(), weekStart);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - delta);
  return d.getTime();
}

export function getDashboardAvgRangeWindow(
  range: "past7" | "past30",
  nowValue: number
) {
  const endMs = nowValue;
  if (range === "past30") return { startMs: nowValue - 30 * 24 * 60 * 60 * 1000, endMs };
  return { startMs: nowValue - 7 * 24 * 60 * 60 * 1000, endMs };
}

export function dashboardAvgRangeLabel(range: "past7" | "past30") {
  if (range === "past30") return "Past 30 Days";
  return "Past 7 Days";
}

export function formatDashboardDurationShort(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms || 0));
  const totalMinutes = Math.floor(safeMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatDashboardDurationWithMinutes(ms: number) {
  const safeMs = Math.max(0, Math.floor(ms || 0));
  const totalMinutes = Math.floor(safeMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

