export function isTaskClarificationUndoWindowOpen(reversibleUntil: string | null | undefined, nowMs: number) {
  const deadlineMs = reversibleUntil ? Date.parse(reversibleUntil) : Number.NaN;
  return Number.isFinite(deadlineMs) && Number.isFinite(nowMs) && nowMs < deadlineMs;
}
