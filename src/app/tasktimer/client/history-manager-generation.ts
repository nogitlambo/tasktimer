import type { HistoryGenTaskGoal } from "./history-manager-shared";

export function parseHistoryGenTimeToMinute(value: string): number | null {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatHistoryGenMinute(minute: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(minute || 0)));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function allocateHistoryGenDailyBudgets(taskCount: number, availableWindowMinutes: number): number[] | null {
  const unitMinutes = 15;
  const totalUnits = Math.floor(availableWindowMinutes / unitMinutes);
  if (taskCount <= 0) return [];
  if (totalUnits < taskCount) return null;
  const budgets = Array.from({ length: taskCount }, () => 1);
  let remainingUnits = totalUnits - taskCount;
  while (remainingUnits > 0) {
    budgets[Math.floor(Math.random() * budgets.length)] += 1;
    remainingUnits -= 1;
  }
  return budgets.map((units) => units * unitMinutes);
}

export function buildHistoryGenTaskGoal(dailyBudgetMinutes: number): HistoryGenTaskGoal {
  const timeGoalPeriod: "day" | "week" = Math.random() < 0.5 ? "day" : "week";
  const periodMinutes = timeGoalPeriod === "week" ? dailyBudgetMinutes * 7 : dailyBudgetMinutes;
  const timeGoalUnit: "minute" | "hour" = periodMinutes >= 60 && Math.random() < 0.5 ? "hour" : "minute";
  const timeGoalValue = timeGoalUnit === "hour" ? Math.round((periodMinutes / 60) * 100) / 100 : periodMinutes;
  const timeGoalMinutes = timeGoalUnit === "hour" ? Math.round(timeGoalValue * 60) : Math.round(timeGoalValue);
  return {
    timeGoalEnabled: true,
    timeGoalValue,
    timeGoalUnit,
    timeGoalPeriod,
    timeGoalMinutes,
    dailyBudgetMinutes,
  };
}

export function formatHistoryGenGoalValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

export function getHistoryGenWeekKey(date: Date) {
  const local = new Date(date);
  local.setHours(0, 0, 0, 0);
  const day = local.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + diffToMonday);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}
