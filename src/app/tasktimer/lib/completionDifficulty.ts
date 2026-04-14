export type CompletionDifficulty = 1 | 2 | 3 | 4 | 5;

export const COMPLETION_DIFFICULTY_LABELS: Record<CompletionDifficulty, string> = {
  1: "Very Difficult",
  2: "Somewhat Difficult",
  3: "Neutral",
  4: "Somewhat Easy",
  5: "Very Easy",
};

export function normalizeCompletionDifficulty(value: unknown): CompletionDifficulty | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed as CompletionDifficulty;
}

export function completionDifficultyLabel(value: unknown): string | null {
  const normalized = normalizeCompletionDifficulty(value);
  return normalized ? COMPLETION_DIFFICULTY_LABELS[normalized] : null;
}
