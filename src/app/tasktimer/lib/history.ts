export function normalizeHistoryTimestampMs(tsRaw: unknown): number {
  const tsNum = Number(tsRaw || 0);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return 0;
  return tsNum < 1e12 ? Math.floor(tsNum * 1000) : Math.floor(tsNum);
}

export function localDayKey(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function getCalendarWeekStartMs(now: Date): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
