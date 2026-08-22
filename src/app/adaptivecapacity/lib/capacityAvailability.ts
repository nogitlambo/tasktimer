type CapacityAvailabilityInput = {
  nowMs: number;
  timezone: string;
  startTime: string;
  endTime: string;
  days: string[];
};

const weekdayMap: Record<string, string> = { Sunday: "sun", Monday: "mon", Tuesday: "tue", Wednesday: "wed", Thursday: "thu", Friday: "fri", Saturday: "sat" };

function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function localDayForTimezone(nowMs: number, timezone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const parts = formatter.formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: weekdayMap[values.weekday] || "",
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

function configuredProductivityDays(days: string[]) {
  return days.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
}

export function isConfiguredProductivityDay(input: Pick<CapacityAvailabilityInput, "nowMs" | "timezone" | "days">) {
  const configuredDays = configuredProductivityDays(input.days);
  if (!configuredDays.length) return true;
  return configuredDays.includes(localDayForTimezone(input.nowMs, input.timezone).day);
}

export function calculateRemainingFocusWindowMinutes(input: CapacityAvailabilityInput) {
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  if (start == null || end == null) return null;
  if (!isConfiguredProductivityDay(input)) return 0;
  const current = localDayForTimezone(input.nowMs, input.timezone).minuteOfDay;
  if (start <= end) {
    if (current < start) return end - start;
    if (current > end) return 0;
    return Math.max(0, end - current);
  }
  if (current >= start) return (1440 - current) + end;
  if (current <= end) return end - current;
  return 0;
}
