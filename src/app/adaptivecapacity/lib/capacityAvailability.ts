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

export function calculateRemainingFocusWindowMinutes(input: CapacityAvailabilityInput) {
  const start = timeToMinutes(input.startTime);
  const end = timeToMinutes(input.endTime);
  if (start == null || end == null) return null;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: input.timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false });
  }
  const parts = formatter.formatToParts(new Date(input.nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = weekdayMap[values.weekday] || "";
  const configuredDays = input.days.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  if (configuredDays.length && !configuredDays.includes(day)) return 0;
  const current = Number(values.hour) * 60 + Number(values.minute);
  if (start <= end) {
    if (current < start) return end - start;
    if (current > end) return 0;
    return Math.max(0, end - current);
  }
  if (current >= start) return (1440 - current) + end;
  if (current <= end) return end - current;
  return 0;
}
