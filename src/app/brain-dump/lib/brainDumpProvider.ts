import type { BrainDumpAiProvider } from "./brainDumpProcessing";

class BrainDumpProviderUnavailableError extends Error {
  status = 503;
  code = "brain-dump/provider-unavailable";
}

class BrainDumpOpenAiProviderError extends Error {
  status = 502;
  code = "brain-dump/provider-failed";
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.6";

const brainDumpResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "itemType",
          "title",
          "sourceEvidence",
          "confidence",
          "ambiguityFlags",
          "dueDateText",
          "dateSource",
          "recurrenceText",
          "dependencyTimingText",
          "notes",
          "estimatedDurationMinutes",
          "priority",
          "firstAction",
        ],
        properties: {
          id: { type: ["string", "null"], maxLength: 120 },
          itemType: {
            type: "string",
            enum: ["task", "project", "recurrence", "dependency", "location", "energy", "subtask", "note", "event", "reference"],
          },
          title: { type: "string", minLength: 1, maxLength: 200 },
          sourceEvidence: {
            type: "array",
            maxItems: 5,
            items: { type: "string", minLength: 1, maxLength: 280 },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          ambiguityFlags: {
            type: "array",
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 160 },
          },
          dueDateText: { type: ["string", "null"], minLength: 1, maxLength: 160 },
          dateSource: { type: "string", enum: ["explicit", "inferred", "suggested", "none"] },
          recurrenceText: { type: ["string", "null"], minLength: 1, maxLength: 200 },
          dependencyTimingText: { type: ["string", "null"], minLength: 1, maxLength: 200 },
          notes: { type: ["string", "null"], minLength: 1, maxLength: 1000 },
          estimatedDurationMinutes: { type: ["number", "null"], minimum: 1, maximum: 1440 },
          priority: { type: ["string", "null"], enum: ["low", "medium", "high", null] },
          firstAction: { type: ["string", "null"], minLength: 1, maxLength: 240 },
        },
      },
    },
  },
} as const;

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredOpenAiApiKey() {
  return asTrimmedString(process.env.OPENAI_API_KEY);
}

function configuredOpenAiModel() {
  return asTrimmedString(process.env.BRAIN_DUMP_OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
}

function buildTypedExtractionPrompt(input: { text: string; timezone: string }) {
  return [
    {
      role: "system",
      content: [
        "You extract reviewable TaskLaunch Brain Dump items from unstructured user text.",
        "Return only items grounded in the user's text. Do not invent tasks, dates, notes, durations, or priorities.",
        "Use itemType task for actionable tasks. Use other item types only when the text is clearly not an actionable task.",
        "For unsupported item types, add a short ambiguity flag explaining why it is not directly createable as a task.",
        "Keep sourceEvidence short and quote or closely paraphrase only the relevant user wording.",
        "Use dateSource explicit only when the user stated timing, inferred only for direct inference, suggested only for weak suggestions, and none when no date exists.",
        "Use null for unknown optional values. The user's timezone is provided only for interpreting wording, not for adding today's date.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Timezone: ${input.timezone}\n\nBrain Dump:\n${input.text}`,
    },
  ];
}

function extractOutputText(response: unknown) {
  const directText = asTrimmedString((response as { output_text?: unknown })?.output_text);
  if (directText) return directText;

  const output = (response as { output?: unknown })?.output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = (item as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const text = asTrimmedString((part as { text?: unknown })?.text);
      if (text) return text;
    }
  }
  return "";
}

function omitNullValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitNullValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== null)
      .map(([key, entryValue]) => [key, omitNullValues(entryValue)])
  );
}

async function requestOpenAiTypedExtraction(input: { promptId: string; text: string; timezone: string }) {
  const apiKey = configuredOpenAiApiKey();
  if (!apiKey) {
    throw new BrainDumpProviderUnavailableError("Brain Dump processing is not configured yet.");
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: configuredOpenAiModel(),
      store: false,
      input: buildTypedExtractionPrompt(input),
      text: {
        format: {
          type: "json_schema",
          name: "brain_dump_review_items",
          strict: true,
          schema: brainDumpResponseSchema,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = asTrimmedString((payload as { error?: { message?: unknown } } | null)?.error?.message);
    throw new BrainDumpOpenAiProviderError(message || "Brain Dump provider request failed.");
  }

  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new BrainDumpOpenAiProviderError("Brain Dump provider returned no structured output.");
  }

  try {
    return omitNullValues(JSON.parse(outputText));
  } catch {
    throw new BrainDumpOpenAiProviderError("Brain Dump provider returned invalid JSON.");
  }
}

export function getBrainDumpAiProvider(): BrainDumpAiProvider {
  return {
    async extractTyped(input) {
      return requestOpenAiTypedExtraction(input);
    },
    async transcribeVoice() {
      throw new BrainDumpProviderUnavailableError("Brain Dump voice transcription is not configured yet.");
    },
    async interpretImage() {
      throw new BrainDumpProviderUnavailableError("Brain Dump image interpretation is not configured yet.");
    },
  };
}
