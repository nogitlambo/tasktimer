import type { AutomationPipelineResult } from "./trustedAutomationPipeline";
import type { AutomationSettings } from "./trustedAutomationPolicy";
import type { ExecuteAutomationRequestDTO, RetryAutomationRequestDTO } from "./trustedAutomationDtos";
import { safeAutomationFailureMessage } from "./trustedAutomationSecurity";

export type AutomationExecuteHandler = (input: {
  uid: string;
  settings: AutomationSettings;
  request: ExecuteAutomationRequestDTO;
}) => Promise<AutomationPipelineResult>;

export type AutomationRetryHandler = (input: {
  uid: string;
  request: RetryAutomationRequestDTO;
}) => Promise<AutomationPipelineResult>;

export async function executeAutomationRequest(input: {
  uid: string;
  settings: AutomationSettings;
  request: ExecuteAutomationRequestDTO;
  handler?: AutomationExecuteHandler;
}) {
  if (!input.handler) return { kind: "SKIPPED" as const, reason: "FEATURE_UNAVAILABLE" };
  return sanitizeAutomationResult(await input.handler(input));
}

export async function retryAutomationRequest(input: {
  uid: string;
  request: RetryAutomationRequestDTO;
  handler?: AutomationRetryHandler;
}) {
  if (!input.handler) return { kind: "SKIPPED" as const, reason: "FEATURE_UNAVAILABLE" };
  return sanitizeAutomationResult(await input.handler(input));
}

function sanitizeAutomationResult(result: AutomationPipelineResult): AutomationPipelineResult {
  if (result.kind !== "FAILED" || !result.execution.error) return result;
  const error = result.execution.error;
  return {
    ...result,
    execution: {
      ...result.execution,
      error: { ...error, message: safeAutomationFailureMessage(error.category, error.code) },
    },
  };
}
