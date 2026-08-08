import { z } from "zod";

import type { DailyExecutiveBriefPlan } from "./dailyExecutiveBriefPlanning";

export const DAILY_EXECUTIVE_BRIEF_SUMMARY_PROMPT_VERSION = "daily-executive-brief-summary-v1";
export const DEFAULT_DAILY_EXECUTIVE_BRIEF_OPENAI_MODEL = "gpt-5.6-terra";

const SummaryResponseSchema = z.object({ summary: z.string().trim().min(1).max(1000) }).strict();

export type DailyExecutiveBriefSummaryInput = Pick<DailyExecutiveBriefPlan, "plannedMinutes" | "completedMinutes" | "remainingMinutes" | "realisticWorkloadRange" | "planHealth" | "deadlineRisk" | "reasonCodes">;

export class DailyExecutiveBriefSummaryProviderUnavailableError extends Error { code = "brief/summary-unavailable"; }
export class DailyExecutiveBriefSummaryProviderError extends Error { code = "brief/summary-failed"; }

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function configuredApiKey() { return asString(process.env.OPENAI_API_KEY, 4000); }
export function configuredDailyExecutiveBriefOpenAiModel() { return asString(process.env.DAILY_EXECUTIVE_BRIEF_OPENAI_MODEL, 120) || DEFAULT_DAILY_EXECUTIVE_BRIEF_OPENAI_MODEL; }

function extractOutputText(response: unknown) {
  const direct = asString((response as { output_text?: unknown })?.output_text);
  if (direct) return direct;
  for (const item of ((response as { output?: unknown })?.output as Array<{ content?: Array<{ text?: unknown }> }> | undefined) || []) {
    for (const part of item.content || []) { const text = asString(part.text); if (text) return text; }
  }
  return "";
}

export function validateDailyExecutiveBriefAiSummary(value: unknown, input: DailyExecutiveBriefSummaryInput) {
  const parsed = SummaryResponseSchema.safeParse(value);
  if (!parsed.success) return null;
  const summary = parsed.data.summary;
  if (/\b(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|tomorrow|yesterday|my task|your task|notes?)\b/i.test(summary)) return null;
  const suppliedNumbers = [input.plannedMinutes, input.completedMinutes, input.remainingMinutes, input.realisticWorkloadRange.minMinutes, input.realisticWorkloadRange.maxMinutes].map(String);
  const numbers = summary.match(/\b\d+\b/g) || [];
  if (numbers.some((number) => !suppliedNumbers.includes(number))) return null;
  if (/\bdeadline\b/i.test(summary) && input.deadlineRisk === "NONE") return null;
  if (/\boverloaded\b/i.test(summary) && input.planHealth === "REALISTIC") return null;
  return summary;
}

export function createDailyExecutiveBriefSummaryProvider(options: { fetchImpl?: typeof fetch; apiKey?: string | null; model?: string } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiKey = asString(options.apiKey ?? configuredApiKey(), 4000);
  if (!apiKey) throw new DailyExecutiveBriefSummaryProviderUnavailableError("Daily Executive Brief summaries are not configured.");
  const model = asString(options.model, 120) || configuredDailyExecutiveBriefOpenAiModel();
  return {
    async summarize(input: DailyExecutiveBriefSummaryInput) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      let response: Response;
      try {
        response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ model, store: false, input: [{ role: "system", content: "Rephrase only the supplied deterministic planning facts and reason codes into one concise neutral summary. Do not invent task details, deadlines, history, or causes. Return only the requested JSON object.", }, { role: "user", content: JSON.stringify(input) }], text: { format: { type: "json_schema", name: "daily_executive_brief_summary", strict: true, schema: { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string", minLength: 1, maxLength: 1000 } } } } } }),
        });
      } catch { clearTimeout(timeout); throw new DailyExecutiveBriefSummaryProviderError("Daily Executive Brief summary request failed."); }
      clearTimeout(timeout);
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new DailyExecutiveBriefSummaryProviderError("Daily Executive Brief summary request failed.");
      const outputText = extractOutputText(payload);
      if (!outputText) throw new DailyExecutiveBriefSummaryProviderError("Daily Executive Brief summary returned no structured output.");
      try {
        const summary = validateDailyExecutiveBriefAiSummary(JSON.parse(outputText), input);
        if (!summary) throw new Error("unsupported summary");
        return summary;
      } catch { throw new DailyExecutiveBriefSummaryProviderError("Daily Executive Brief summary returned invalid structured output."); }
    },
  };
}

export function getDailyExecutiveBriefSummaryProvider() {
  if (!configuredApiKey()) return null;
  try { return createDailyExecutiveBriefSummaryProvider(); } catch { return null; }
}
