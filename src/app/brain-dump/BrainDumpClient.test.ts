import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BrainDumpClient", () => {
  it("uses the hosted API helper and Firebase auth header for typed processing", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain('fetch(getApiUrl("/api/brain-dump/sessions/"), {');
    expect(source).toContain('"x-firebase-auth": idToken');
    expect(source).not.toContain("api.openai.com");
  });

  it("keeps typed capture gated and renders the review selected count", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("maxLength={BRAIN_DUMP_TEXT_LIMIT}");
    expect(source).toContain("disabled={!canSubmit}");
    expect(source).toContain("{session.review.selectedCount}");
    expect(source).toContain("{session.review.items.length}");
  });
});
