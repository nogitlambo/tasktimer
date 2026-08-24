import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getBrainDumpAiProvider } from "./brainDumpProvider";

describe("getBrainDumpAiProvider", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOpenAiModel = process.env.BRAIN_DUMP_OPENAI_MODEL;
  const originalTranscriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL;
  const originalTranscriptionLanguage = process.env.BRAIN_DUMP_TRANSCRIPTION_LANGUAGE;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.BRAIN_DUMP_OPENAI_MODEL = "gpt-test";
    process.env.OPENAI_TRANSCRIPTION_MODEL = "gpt-transcription-test";
    process.env.BRAIN_DUMP_TRANSCRIPTION_LANGUAGE = "en";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    process.env.BRAIN_DUMP_OPENAI_MODEL = originalOpenAiModel;
    process.env.OPENAI_TRANSCRIPTION_MODEL = originalTranscriptionModel;
    process.env.BRAIN_DUMP_TRANSCRIPTION_LANGUAGE = originalTranscriptionLanguage;
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

  it("calls OpenAI audio transcription server-side with configured model, language, and faithful guidance", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: "Call the dentist tomorrow." }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getBrainDumpAiProvider().transcribeVoice!({
      promptId: "brain-dump-voice-transcription-v1",
      audioBytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      mimeType: "audio/webm",
      fileName: "recording.webm",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer test-openai-key" },
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get("model")).toBe("gpt-transcription-test");
    expect(body.get("language")).toBe("en");
    expect(body.get("response_format")).toBe("json");
    expect(String(body.get("prompt"))).toContain("Transcribe faithfully");
    expect(String(body.get("prompt"))).toContain("Do not summarise");
    expect(body.get("file")).toBeInstanceOf(Blob);
    expect(result).toEqual({ transcript: "Call the dentist tomorrow.", model: "gpt-transcription-test" });
    expect(JSON.stringify(requestInit.headers)).not.toContain("Call the dentist");
  });

  it.each([
    [401, "invalid_api_key", "brain-dump/provider-unavailable", 503],
    [403, "model_not_found", "brain-dump/provider-unavailable", 503],
    [400, "model_not_found", "brain-dump/provider-unavailable", 503],
    [429, "rate_limit_exceeded", "brain-dump/provider-rate-limited", 503],
    [400, "invalid_value", "brain-dump/invalid-audio", 422],
    [500, "server_error", "brain-dump/provider-temporary", 502],
  ])("categorizes OpenAI transcription status %s without exposing raw details", async (providerStatus, providerCode, code, status) => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: providerStatus,
      headers: new Headers({ "x-request-id": "req_safe_123" }),
      json: async () => ({
        error: {
          message: "sensitive provider detail",
          type: "invalid_request_error",
          code: providerCode,
          param: "file",
        },
      }),
    })));

    const request =
      getBrainDumpAiProvider().transcribeVoice!({
        promptId: "brain-dump-voice-transcription-v1",
        audioBytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        mimeType: "audio/webm",
        fileName: "recording.webm",
      });

    await expect(request).rejects.toMatchObject({
      code,
      status,
      providerStatus,
      providerCode,
      providerType: "invalid_request_error",
      providerParam: "file",
      providerRequestId: "req_safe_123",
    });
    await expect(request).rejects.not.toThrow("sensitive provider detail");
  });

  it("categorizes a successful empty transcription as no detectable speech", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "req_empty_123" }),
      json: async () => ({ text: "" }),
    })));

    await expect(
      getBrainDumpAiProvider().transcribeVoice!({
        promptId: "brain-dump-voice-transcription-v1",
        audioBytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        mimeType: "audio/webm",
        fileName: "recording.webm",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/no-speech",
      status: 422,
      providerStatus: 200,
      providerRequestId: "req_empty_123",
    });
  });

  it("categorizes a malformed successful provider response separately from no speech", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "x-request-id": "req_malformed_123" }),
      json: async () => ({}),
    })));

    await expect(
      getBrainDumpAiProvider().transcribeVoice!({
        promptId: "brain-dump-voice-transcription-v1",
        audioBytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
        mimeType: "audio/webm",
        fileName: "recording.webm",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/provider-malformed-response",
      status: 502,
      providerStatus: 200,
      providerRequestId: "req_malformed_123",
    });
  });

  it("categorizes transcription transport failures without exposing network details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("sensitive proxy address");
    }));

    const request = getBrainDumpAiProvider().transcribeVoice!({
      promptId: "brain-dump-voice-transcription-v1",
      audioBytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
      mimeType: "audio/webm",
      fileName: "recording.webm",
    });

    await expect(request).rejects.toMatchObject({
      code: "brain-dump/provider-temporary",
      status: 502,
      model: "gpt-transcription-test",
    });
    await expect(request).rejects.not.toThrow("sensitive proxy address");
  });
});
