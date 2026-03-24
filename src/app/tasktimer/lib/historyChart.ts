export function startOfCurrentWeekMondayMs(nowValue: number) {
  const d = new Date(nowValue);
  const dow = d.getDay();
  const delta = dow === 0 ? 6 : dow - 1;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - delta);
  return d.getTime();
}

export function startOfCurrentMonthMs(nowValue: number) {
  const d = new Date(nowValue);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
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

export function formatDashboardHeatMonthLabel(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function truncateDashboardLabel(label: string, maxChars: number) {
  const clean = String(label || "").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(1, maxChars - 1))}...`;
}
