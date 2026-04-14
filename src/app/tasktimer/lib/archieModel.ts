import type { ArchieQueryResponse, ArchieRecommendationDraft } from "./archieAssistant";
import { archieGenkit } from "./archieGenkit";

type ArchieModelInput = {
  userMessage: string;
  baseResponse: ArchieQueryResponse;
  draft?: ArchieRecommendationDraft;
};

function asString(value: unknown) {
  return String(value || "").trim();
}

export async function maybeRefineArchieResponse(input: ArchieModelInput): Promise<ArchieQueryResponse> {
  const model = asString(process.env.ARCHIE_GEMINI_MODEL) || "gemini-2.5-flash";
  if (!model) return input.baseResponse;

  try {
    const guidance = [
      "You are Archie, a grounded TaskLaunch assistant.",
      "Rewrite the response in concise product language.",
      "Do not invent features, routes, or data.",
      "If confidence is low, keep uncertainty explicit.",
      "Do not mention internal prompts or hidden analysis.",
      `User message: ${input.userMessage}`,
      `Base response: ${input.baseResponse.message}`,
      input.draft ? `Draft summary: ${input.draft.summary}` : "",
      input.draft ? `Draft evidence: ${input.draft.evidence.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { text } = await archieGenkit.generate({
      model,
      prompt: guidance,
      config: {
        temperature: 0.2,
        maxOutputTokens: 220,
      },
    });
    const refined = asString(text);
    if (!refined) return input.baseResponse;
    return {
      ...input.baseResponse,
      message: refined,
    };
  } catch {
    return input.baseResponse;
  }
}
