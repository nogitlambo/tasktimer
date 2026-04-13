import type { ArchieQueryResponse, ArchieRecommendationDraft } from "./archieAssistant";

type ArchieModelInput = {
  userMessage: string;
  baseResponse: ArchieQueryResponse;
  draft?: ArchieRecommendationDraft;
};

function asString(value: unknown) {
  return String(value || "").trim();
}

export async function maybeRefineArchieResponse(input: ArchieModelInput): Promise<ArchieQueryResponse> {
  const apiKey = asString(process.env.OPENAI_API_KEY);
  const model = asString(process.env.ARCHIE_OPENAI_MODEL);
  if (!apiKey || !model) return input.baseResponse;

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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: guidance,
      }),
    });
    if (!response.ok) return input.baseResponse;
    const payload = (await response.json().catch(() => null)) as { output_text?: unknown } | null;
    const refined = asString(payload?.output_text);
    if (!refined) return input.baseResponse;
    return {
      ...input.baseResponse,
      message: refined,
    };
  } catch {
    return input.baseResponse;
  }
}
