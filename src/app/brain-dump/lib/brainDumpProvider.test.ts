import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrainDumpAiProvider } from "./brainDumpProvider";

describe("getBrainDumpAiProvider", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiModel = process.env.BRAIN_DUMP_OPENAI_MODEL;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.BRAIN_DUMP_OPENAI_MODEL = "gpt-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    process.env.BRAIN_DUMP_OPENAI_MODEL = originalOpenAiModel;
  });

  it("calls OpenAI Responses with structured output for typed extraction", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  items: [
                    {
                      id: null,
                      itemType: "task",
                      title: "Call dentist",
                      sourceEvidence: ["call dentist tomorrow"],
                      confidence: 0.9,
                      ambiguityFlags: [],
                      dueDateText: "tomorrow",
                      dateSource: "explicit",
                      recurrenceText: null,
                      dependencyTimingText: null,
                      notes: null,
                      estimatedDurationMinutes: null,
                      priority: null,
                      firstAction: null,
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = getBrainDumpAiProvider();
    const result = await provider.extractTyped({
      promptId: "brain-dump-v1",
      text: "call dentist tomorrow",
      timezone: "Australia/Sydney",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-openai-key",
          "content-type": "application/json",
        }),
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const requestBody = JSON.parse(String(requestInit.body || "{}")) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      model: "gpt-test",
      store: false,
      text: {
        format: {
          type: "json_schema",
          name: "brain_dump_review_items",
          strict: true,
        },
      },
    });
    expect(JSON.stringify(requestBody)).toContain("call dentist tomorrow");
    expect(JSON.stringify(requestBody)).toContain("Australia/Sydney");
    expect(result).toEqual({
      items: [
        {
          itemType: "task",
          title: "Call dentist",
          sourceEvidence: ["call dentist tomorrow"],
          confidence: 0.9,
          ambiguityFlags: [],
          dueDateText: "tomorrow",
          dateSource: "explicit",
        },
      ],
    });
  });

  it("keeps typed processing unavailable until an OpenAI API key is configured", async () => {
    process.env.OPENAI_API_KEY = "";

    await expect(
      getBrainDumpAiProvider().extractTyped({
        promptId: "brain-dump-v1",
        text: "call dentist",
        timezone: "UTC",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/provider-unavailable",
      status: 503,
    });
  });
});
