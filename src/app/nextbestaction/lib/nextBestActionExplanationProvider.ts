import { z } from "zod";

import type { NextBestActionReasonCode } from "./nextBestActionRecommendation";

export const NEXT_BEST_ACTION_EXPLANATION_PROMPT_VERSION = "next-best-action-explanation-v1";
export const DEFAULT_NEXT_BEST_ACTION_OPENAI_MODEL = "gpt-5.6-terra";

const ExplanationResponseSchema = z.object({ explanation: z.string().trim().min(1).max(500) }).strict();

export type NextBestActionExplanationProviderInput = {
  reasonCodes: readonly NextBestActionReasonCode[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  availableMinutes?: number | null;
};

export class NextBestActionExplanationProviderUnavailableError extends Error {
  code = "next-best-action/explanation-unavailable";
}

export class NextBestActionExplanationProviderError extends Error {
  code = "next-best-action/explanation-failed";
}

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function configuredApiKey() {
  return asString(process.env.OPENAI_API_KEY, 4000);
}

export function configuredNextBestActionOpenAiModel() {
  return asString(process.env.NEXT_BEST_ACTION_OPENAI_MODEL, 120) || DEFAULT_NEXT_BEST_ACTION_OPENAI_MODEL;
}

function extractOutputText(response: unknown) {
  const direct = asString((response as { output_text?: unknown })?.output_text);
  if (direct) return direct;
  const output = (response as { output?: unknown })?.output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = asString((part as { text?: unknown })?.text);
      if (text) return text;
    }
  }
  return "";
}

const claimKeywords: Record<NextBestActionReasonCode, string[]> = {
  DUE_TODAY: ["today", "due"],
  DUE_SOON: ["soon", "due"],
  HIGH_PRIORITY: ["high priority", "priority"],
  MEDIUM_PRIORITY: ["medium priority", "priority"],
  FITS_AVAILABLE_TIME: ["fit", "available time"],
  FITS_REMAINING_CAPACITY: ["fit", "remaining capacity"],
  MATCHES_FOCUS_WINDOW: ["focus window", "focus"],
  HAS_CLEAR_FIRST_ACTION: ["first action", "clear start", "clear next"],
  FREQUENTLY_POSTPONED: ["postponed", "put off"],
  BLOCKS_OTHER_WORK: ["blocks", "blocking"],
  RECENTLY_STARTED: ["recently started", "already started"],
  QUICK_WIN: ["quick", "short"],
  LONG_FOCUS_FIT: ["long focus", "focus"],
  LOW_DURATION_CONFIDENCE: ["duration", "estimate", "time"],
  EXCEEDS_AVAILABLE_TIME: ["available time", "longer"],
  USER_PREFERENCE_MATCH: ["preference", "usually prefer"],
};

export function validateNextBestActionAiExplanation(value: unknown, input: NextBestActionExplanationProviderInput) {
  const parsed = ExplanationResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const explanation = parsed.data.explanation;
  if (/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|tomorrow|yesterday|overdue|deadline|urgent)\b/i.test(explanation)) return null;
  const allowedKeywords = new Set(input.reasonCodes.flatMap((reason) => claimKeywords[reason] || []));
  const claimChecks: Array<[RegExp, string[]]> = [
    [/\bpriority\b/i, ["priority"]],
    [/\bfocus\b/i, ["focus", "long focus"]],
    [/\bpostponed|put off\b/i, ["postponed", "put off"]],
    [/\bblock(?:s|ing)?\b/i, ["blocks", "blocking"]],
    [/\bdue\b/i, ["due", "today", "soon"]],
  ];
  if (claimChecks.some(([pattern, keywords]) => pattern.test(explanation) && !keywords.some((keyword) => allowedKeywords.has(keyword)))) return null;
  return explanation;
}

function buildPrompt(input: NextBestActionExplanationProviderInput) {
  return [
    {
      role: "system",
      content: "Rephrase only the supplied deterministic reason codes into one concise neutral explanation. Do not invent deadlines, history, priority, blockers, task details, or facts. Return only the requested JSON object and no reasoning.",
    },
    {
      role: "user",
      content: JSON.stringify({ reasonCodes: input.reasonCodes, confidence: input.confidence, availableMinutes: input.availableMinutes ?? null }),
    },
  ];
}

export function createNextBestActionExplanationProvider(options: { fetchImpl?: typeof fetch; apiKey?: string | null; model?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = asString(options.apiKey ?? configuredApiKey(), 4000);
  if (!apiKey) throw new NextBestActionExplanationProviderUnavailableError("Next Best Action explanations are not configured.");
  const model = asString(options.model, 120) || configuredNextBestActionOpenAiModel();
  return {
    async explain(input: NextBestActionExplanationProviderInput) {
      let response: Response;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      try {
        response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ model, store: false, input: buildPrompt(input), text: { format: { type: "json_schema", name: "next_best_action_explanation", strict: true, schema: { type: "object", additionalProperties: false, required: ["explanation"], properties: { explanation: { type: "string", minLength: 1, maxLength: 500 } } } } } }),
        });
      } catch {
        clearTimeout(timeout);
        throw new NextBestActionExplanationProviderError("Next Best Action explanation request failed.");
      }
      clearTimeout(timeout);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new NextBestActionExplanationProviderError("Next Best Action explanation request failed.");
      const outputText = extractOutputText(payload);
      if (!outputText) throw new NextBestActionExplanationProviderError("Next Best Action explanation returned no structured output.");
      try {
        const explanation = validateNextBestActionAiExplanation(JSON.parse(outputText), input);
        if (!explanation) throw new Error("unsupported explanation");
        return explanation;
      } catch {
        throw new NextBestActionExplanationProviderError("Next Best Action explanation returned invalid structured output.");
      }
    },
  };
}

export function getNextBestActionExplanationProvider() {
  if (!configuredApiKey()) return null;
  try {
    return createNextBestActionExplanationProvider();
  } catch {
    return null;
  }
}

export async function resolveNextBestActionExplanation(input: NextBestActionExplanationProviderInput, fallback: string) {
  const provider = getNextBestActionExplanationProvider();
  if (!provider) return fallback;
  try {
    return await provider.explain(input);
  } catch {
    return fallback;
  }
}
