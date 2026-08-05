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
    expect(source).toContain("confirmIdempotencyKey");
    expect(source).toContain("idempotencyKey: confirmIdempotencyKey");
    expect(source).toContain("itemUpdates");
    expect(source).toContain('trackEvent("brain_dump_tasks_created"');
    expect(source).toContain("created_count: payload.batch.createdCount");
    expect(source).toContain("skipped_count: payload.batch.skippedCount");
    expect(source).toContain('trackEvent("brain_dump_tasks_partial_failed"');
    expect(source).toContain('trackEvent("brain_dump_tasks_create_failed"');
    expect(source).toContain("failed_count: payload.batch.failedCount");
    expect(source).toContain("retryable_count: payload.batch.retryableCount");
    expect(source).toContain(`void trackEvent("brain_dump_tasks_created", {
          created_count: payload.batch.createdCount,
          skipped_count: payload.batch.skippedCount,
        });`);
  });

  it("preserves typed drafts through failures and exposes safe recovery controls", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BRAIN_DUMP_TYPED_DRAFT_KEY");
    expect(source).toContain("readStoredDraft");
    expect(source).toContain("writeStoredDraft");
    expect(source).toContain("handleClearDraft");
    expect(source).toContain("handleRetryProcessing");
    expect(source).toContain("handleCancelProcessing");
    expect(source).toContain("AbortController");
    expect(source).toContain("autoRetriedRef");
    expect(source).toContain('"Validating input"');
    expect(source).toContain('"Uploading securely"');
    expect(source).toContain('"Analysing Brain Dump"');
    expect(source).toContain('trackEvent("brain_dump_processing_failed"');
    expect(source).toContain("mode: \"typed\"");
    expect(source).toContain("draft_length: text.length");
    expect(source).toContain("Retry");
    expect(source).toContain("Clear draft");
    expect(source).toContain("Cancel");
    expect(source).not.toContain("raw_text");
    expect(source).not.toContain("source_text");
  });

  it("renders editable review dates without hiding source provenance", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpReviewDate");
    expect(source).toContain('type="date"');
    expect(source).toContain('aria-label={`Date for ${item.title}`}');
    expect(source).toContain("date: {");
    expect(source).toContain("userConfirmedDate: true");
    expect(source).toContain("Remove date");
    expect(source).toContain("item.date.dateSource");
    expect(source).toContain("item.date.originalDateText");
    expect(source).toContain("item.date.ambiguityFlags");
  });

  it("keeps optional enrichment collapsed, accessible, editable, saveable, and clearable", () => {
    const source = readFileSync(resolve(__dirname, "BrainDumpClient.tsx"), "utf8");

    expect(source).toContain("BrainDumpReviewEnrichment");
    expect(source).toContain("<details");
    expect(source).toContain("<summary");
    expect(source).toContain("Optional details");
    expect(source).toContain('aria-label={`Notes for ${item.title}`}');
    expect(source).toContain('aria-label={`Estimated duration minutes for ${item.title}`}');
    expect(source).toContain('aria-label={`Priority for ${item.title}`}');
    expect(source).toContain('aria-label={`First action for ${item.title}`}');
    expect(source).toContain("Clear optional details");
    expect(source).toContain('fetch(getApiUrl(`/api/brain-dump/sessions/${session.id}`), {');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain("validationErrors");
  });
});
