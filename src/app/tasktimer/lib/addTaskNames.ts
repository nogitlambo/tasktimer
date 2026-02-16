export const ADD_TASK_PRESET_NAMES = [
  "Exercise",
  "Meditation",
  "Reading",
  "Running",
  "Study",
  "Walking",
  "Workout",
];

export function normalizeTaskNameKey(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export function isPresetTaskName(name: string, presets = ADD_TASK_PRESET_NAMES): boolean {
  const k = normalizeTaskNameKey(name);
  return presets.some((x) => normalizeTaskNameKey(x) === k);
}

export function parseRecentCustomTaskNames(raw: string | null | undefined, limit = 5): string[] {
  if (!raw) return [];
  let arr: unknown = null;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const t = String(v || "").trim();
    if (!t) continue;
    const k = normalizeTaskNameKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

export function rememberRecentCustomTaskName(
  name: string,
  current: string[],
  presets = ADD_TASK_PRESET_NAMES,
  limit = 5
): string[] {
  const t = String(name || "").trim();
  if (!t || isPresetTaskName(t, presets)) return current.slice(0, limit);
  const k = normalizeTaskNameKey(t);
  return [t, ...current.filter((x) => normalizeTaskNameKey(x) !== k)].slice(0, limit);
}

export function filterTaskNameOptions(custom: string[], presets: string[], query: string) {
  const q = normalizeTaskNameKey(query);
  const match = (s: string) => !q || normalizeTaskNameKey(s).includes(q);
  return {
    custom: custom.filter(match).slice(0, 5),
    presets: presets.filter(match),
  };
}
