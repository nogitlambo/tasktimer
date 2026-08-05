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
    expect(source).toContain("const selectedCount = session?.review.items.filter");
    expect(source).toContain("{session.review.items.length}");
  });

  it("supports title edits, item selection, and confirmed creation through the hosted endpoint", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("function updateReviewItem");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain('aria-label={`Select ${item.title}`}');
    expect(source).toContain('value={item.title}');
    expect(source).toContain("selectedCount");
    expect(source).toContain('fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}/confirm/`), {');
    expect(source).toContain("itemUpdates");
    expect(source).toContain('trackEvent("brain_dump_tasks_created"');
    expect(source).toContain("created_count: payload.batch.createdCount");
    expect(source).toContain("skipped_count: payload.batch.skippedCount");
    expect(source).toContain(`void trackEvent("brain_dump_tasks_created", {
        created_count: payload.batch.createdCount,
        skipped_count: payload.batch.skippedCount,
      });`);
  });
});
