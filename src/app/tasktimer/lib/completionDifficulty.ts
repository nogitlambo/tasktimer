export type CompletionDifficulty = 1 | 2 | 3 | 4 | 5;

export const COMPLETION_DIFFICULTY_LABELS: Record<CompletionDifficulty, string> = {
  1: "Very Difficult",
  2: "Somewhat Difficult",
  3: "Neutral",
  4: "Somewhat Easy",
  5: "Very Easy",
};

export const COMPLETION_DIFFICULTY_OPTIONS: Array<{
  value: CompletionDifficulty;
  label: string;
  iconSrc: string;
}> = [
  { value: 1, label: COMPLETION_DIFFICULTY_LABELS[1], iconSrc: "/sentiment/very_difficult.svg" },
  { value: 2, label: COMPLETION_DIFFICULTY_LABELS[2], iconSrc: "/sentiment/somewhat_difficult.svg" },
  { value: 3, label: COMPLETION_DIFFICULTY_LABELS[3], iconSrc: "/sentiment/neutral.svg" },
  { value: 4, label: COMPLETION_DIFFICULTY_LABELS[4], iconSrc: "/sentiment/easy.svg" },
  { value: 5, label: COMPLETION_DIFFICULTY_LABELS[5], iconSrc: "/sentiment/very_easy.svg" },
];

export function normalizeCompletionDifficulty(value: unknown): CompletionDifficulty | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return undefined;
  return parsed as CompletionDifficulty;
}

export function completionDifficultyLabel(value: unknown): string | null {
  const normalized = normalizeCompletionDifficulty(value);
  return normalized ? COMPLETION_DIFFICULTY_LABELS[normalized] : null;
}
