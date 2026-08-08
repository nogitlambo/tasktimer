import { ZodError } from "zod";

import {
  parseTaskClarificationResponse,
  TaskClarificationValidationError,
  type TaskClarificationAIProvider,
  type TaskClarificationProviderInput,
  type TaskClarificationResponse,
} from "./taskClarification";
import {
  getTaskClarificationAIProvider,
  TaskClarificationProviderError,
  TaskClarificationProviderUnavailableError,
} from "./taskClarificationProvider";

function errorCode(error: unknown) {
  return typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : "internal";
}

function isRetryableClarificationFailure(error: unknown) {
  return (
    error instanceof TaskClarificationProviderUnavailableError ||
    error instanceof TaskClarificationProviderError ||
    error instanceof TaskClarificationValidationError ||
    error instanceof ZodError ||
    errorCode(error) === "task-clarification/provider-invalid"
  );
}

export async function generateValidatedTaskClarification(
  input: TaskClarificationProviderInput,
  parentTitle: string,
  provider: TaskClarificationAIProvider = getTaskClarificationAIProvider()
): Promise<TaskClarificationResponse> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return parseTaskClarificationResponse(await provider.clarifyTask(input), parentTitle);
    } catch (error) {
      if (attempt === 0 && isRetryableClarificationFailure(error)) continue;
      throw error;
    }
  }
  throw new Error("Task clarification generation did not complete.");
}
