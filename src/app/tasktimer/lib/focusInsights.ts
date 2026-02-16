export type InsightEntry = {
  ts: number;
  ms: number;
};

export type FocusInsightsResult = {
  bestMs: number;
  weekdayTotalMs: number;
  weekdayName: string | null;
  hasWeekdayEnoughDays: boolean;
  todayDeltaMs: number;
  weekDeltaMs: number;
};

function localDayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

function startOfTodayMs(nowTs: number): number {
  const d = new Date(nowTs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeekMs(refMs: number): number {
  const d = new Date(refMs);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function computeFocusInsights(entries: InsightEntry[], nowTs: number): FocusInsightsResult {
  const valid = (entries || []).filter((e) => Number.isFinite(+e?.ms) && Number.isFinite(+e?.ts));
  const bestMs = valid.length ? Math.max(...valid.map((e) => Math.max(0, +e.ms || 0))) : 0;

  const byDate = new Map<string, number>();
  const byWeekday = new Array<number>(7).fill(0);
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    const ms = Math.max(0, +e.ms || 0);
    const key = localDayKey(ts);
    byDate.set(key, (byDate.get(key) || 0) + ms);
    byWeekday[new Date(ts).getDay()] += ms;
  });

  let weekdayIdx = 0;
  for (let i = 1; i < 7; i += 1) {
    if (byWeekday[i] > byWeekday[weekdayIdx]) weekdayIdx = i;
  }
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const todayStart = startOfTodayMs(nowTs);
  const yesterdayStart = todayStart - 86400000;
  let todayMs = 0;
  let yesterdayMs = 0;
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    const ms = Math.max(0, +e.ms || 0);
    if (ts >= todayStart && ts < nowTs + 1) todayMs += ms;
    else if (ts >= yesterdayStart && ts < todayStart) yesterdayMs += ms;
  });

  const weekStart = startOfWeekMs(nowTs);
  const prevWeekStart = weekStart - 7 * 86400000;
  let thisWeekMs = 0;
  let lastWeekMs = 0;
  valid.forEach((e) => {
    const ts = +e.ts || 0;
    const ms = Math.max(0, +e.ms || 0);
    if (ts >= weekStart && ts <= nowTs) thisWeekMs += ms;
    else if (ts >= prevWeekStart && ts < weekStart) lastWeekMs += ms;
  });

  const enoughDays = byDate.size >= 14;
  return {
    bestMs,
    weekdayTotalMs: byWeekday[weekdayIdx],
    weekdayName: enoughDays ? weekdayNames[weekdayIdx] : null,
    hasWeekdayEnoughDays: enoughDays,
    todayDeltaMs: todayMs - yesterdayMs,
    weekDeltaMs: thisWeekMs - lastWeekMs,
  };
}
