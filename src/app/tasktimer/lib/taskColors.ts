export const TASK_COLOR_PALETTE = [
  "#00cfc8",
  "#79e2ff",
  "#8b5cf6",
  "#f472b6",
  "#fb7185",
  "#f59e0b",
  "#c9ff24",
  "#34d399",
] as const;

const TASK_COLOR_SET = new Set<string>(TASK_COLOR_PALETTE);

export function normalizeTaskColor(value: unknown): string | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return TASK_COLOR_SET.has(normalized) ? normalized : null;
}
