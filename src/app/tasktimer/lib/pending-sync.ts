export const PENDING_PREFERENCES_SYNC_TTL_MS = 5 * 60 * 1000;
export const PENDING_WORKSPACE_SYNC_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function filterPendingSyncEntries(
  value: Record<string, number> | null | undefined,
  now: number,
  maxAgeMs: number
): Record<string, number> {
  const next: Record<string, number> = {};
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeMaxAgeMs = Number.isFinite(maxAgeMs) && maxAgeMs >= 0 ? maxAgeMs : 0;

  Object.entries(value || {}).forEach(([id, ts]) => {
    const normalizedId = String(id || "").trim();
    const normalizedTs = Number(ts || 0);
    if (!normalizedId || !Number.isFinite(normalizedTs) || normalizedTs <= 0) return;
    if (safeNow - normalizedTs > safeMaxAgeMs) return;
    next[normalizedId] = normalizedTs;
  });

  return next;
}
