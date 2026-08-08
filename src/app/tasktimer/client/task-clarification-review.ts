export type TaskClarificationReviewTask = {
  taskId: string;
  title: string;
  taskType?: "recurring" | "once-off";
  dueDate?: string | null;
};

export type TaskClarificationReviewRecommendation = {
  recommendationId: string;
  originalTitle: string;
  suggestedTitle: string | null;
  definitionOfDone: string | null;
  firstAction: string | null;
  stoppingPoint: string | null;
  estimatedMinutes: number | null;
  estimatedRange: { minMinutes: number; maxMinutes: number } | null;
  subtasks: Array<{ id: string; title: string; estimatedMinutes: number | null }>;
  clarificationQuestions: string[];
  warnings: string[];
};

export type TaskClarificationReviewState = {
  status: "closed" | "loading" | "ready" | "error";
  task: TaskClarificationReviewTask | null;
  recommendation: TaskClarificationReviewRecommendation | null;
  error: string | null;
};

export function closeTaskClarificationReview(): TaskClarificationReviewState {
  return { status: "closed", task: null, recommendation: null, error: null };
}

export function createTaskClarificationReviewLoading(task: TaskClarificationReviewTask): TaskClarificationReviewState {
  return { status: "loading", task, recommendation: null, error: null };
}

export function createTaskClarificationReviewReady(
  task: TaskClarificationReviewTask,
  recommendation: TaskClarificationReviewRecommendation
): TaskClarificationReviewState {
  return { status: "ready", task, recommendation, error: null };
}

export function createTaskClarificationReviewError(task: TaskClarificationReviewTask, error: string): TaskClarificationReviewState {
  return { status: "error", task, recommendation: null, error };
}
