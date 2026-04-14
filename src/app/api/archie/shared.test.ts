import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArchieQueryRequest, ArchieQueryResponse } from "@/app/tasktimer/lib/archieAssistant";

import { createArchieSessionTelemetry, createArchieTelemetryEvent } from "./shared";

function createRequest(overrides?: Partial<ArchieQueryRequest>): ArchieQueryRequest {
  return {
    message: "Where do I change the theme?",
    activePage: "settings",
    intentHint: null,
    focusSessionNotesByTaskId: {},
    ...overrides,
  };
}

function createResponse(overrides?: Partial<ArchieQueryResponse>): ArchieQueryResponse {
  return {
    mode: "product_answer",
    message: "Open Settings, then Appearance.",
    citations: [
      {
        id: "faq-settings-appearance-theme",
        title: "Settings > Appearance",
        section: "Where do I change the theme?",
        route: "/settings",
        settingsPane: "appearance",
        sourceKind: "settings",
      },
    ],
    confidence: "high",
    draftId: undefined,
    draft: undefined,
    suggestedAction: undefined,
    ...overrides,
  };
}

describe("Archie telemetry helpers", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRawFlag = process.env.ARCHIE_LOG_RAW_TEXT;
  const originalModel = process.env.ARCHIE_GEMINI_MODEL;

  afterEach(() => {
    Object.assign(process.env, {
      NODE_ENV: originalNodeEnv,
      ARCHIE_LOG_RAW_TEXT: originalRawFlag,
      ARCHIE_GEMINI_MODEL: originalModel,
    });
    vi.useRealTimers();
  });

  it("omits raw conversation text in production telemetry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T00:00:00.000Z"));
    Object.assign(process.env, {
      NODE_ENV: "production",
      ARCHIE_LOG_RAW_TEXT: "1",
      ARCHIE_GEMINI_MODEL: "gemini-2.5-flash",
    });

    const telemetry = createArchieSessionTelemetry({
      sessionId: "session-1",
      request: createRequest(),
      response: createResponse(),
      latencyMs: 481,
    }) as Record<string, unknown>;

    expect(telemetry.rawUserMessage).toBeUndefined();
    expect(telemetry.rawAssistantMessage).toBeUndefined();
    expect(telemetry.debugLoggingEnabled).toBe(false);
    expect(telemetry.provider).toBe("genkit-google-genai");
    expect(telemetry.model).toBe("gemini-2.5-flash");
    expect(telemetry.groundingKind).toBe("grounded");
    expect(telemetry.citationIds).toEqual(["faq-settings-appearance-theme"]);
    expect(telemetry.citationSources).toEqual(["Settings > Appearance"]);
    expect(telemetry.expiresAt).toEqual(new Date("2026-07-13T00:00:00.000Z"));
  });

  it("includes raw text only for env-gated non-production debugging", () => {
    Object.assign(process.env, {
      NODE_ENV: "development",
      ARCHIE_LOG_RAW_TEXT: "1",
    });

    const telemetry = createArchieSessionTelemetry({
      sessionId: "session-2",
      request: createRequest({ message: "Raw user question" }),
      response: createResponse({ message: "Raw assistant answer" }),
      latencyMs: 125,
    }) as Record<string, unknown>;

    expect(telemetry.debugLoggingEnabled).toBe(true);
    expect(telemetry.rawUserMessage).toBe("Raw user question");
    expect(telemetry.rawAssistantMessage).toBe("Raw assistant answer");
  });

  it("creates structured decision events without raw conversation data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T00:00:00.000Z"));

    const event = createArchieTelemetryEvent({
      sessionId: "session-3",
      draftId: "draft-9",
      eventType: "apply",
      appliedCount: 2,
      draftKind: "schedule_adjustment",
    }) as Record<string, unknown>;

    expect(event).toMatchObject({
      sessionId: "session-3",
      draftId: "draft-9",
      eventType: "apply",
      appliedCount: 2,
      draftKind: "schedule_adjustment",
      schemaVersion: 1,
    });
    expect(event.expiresAt).toEqual(new Date("2026-07-13T00:00:00.000Z"));
    expect("rawUserMessage" in event).toBe(false);
    expect("rawAssistantMessage" in event).toBe(false);
  });
});
