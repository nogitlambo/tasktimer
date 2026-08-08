import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "TaskClarificationOverlay.tsx"), "utf8");

describe("TaskClarificationOverlay hardening", () => {
  it("keeps the proposal modal keyboard-accessible and dismissible", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("tabIndex={-1}");
    expect(source).toContain('event.key !== "Tab"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain('aria-label={`Select subtask ${index + 1}`}');
    expect(source).toContain('/dismiss`');
    expect(source).toContain('/undo`');
  });

  it("keeps the review modal visible and explains an empty recommendation", () => {
    expect(source).toContain('style={{ display: "flex" }}');
    expect(source).toContain("No improvement suggestions were generated");
  });

  it("uses the primitive modal structure with a horizontal action footer", () => {
    expect(source).toContain("primitiveSciFiModalOverlay taskClarificationPrimitiveOverlay");
    expect(source).toContain("modal taskClarificationPrimitiveModal");
    expect(source).toContain("taskClarificationPrimitiveHeader");
    expect(source).toContain("taskClarificationPrimitiveBody");
    expect(source).toContain("taskClarificationPrimitiveFooter");
    expect(source).toContain("primitiveSciFiModalAction primitiveSciFiModalSecondaryAction");
    expect(source).toContain("primitiveSciFiModalAction primitiveSciFiModalPrimaryAction");
  });

  it("uses the privacy-safe lifecycle telemetry boundary", () => {
    expect(source).toContain("trackTaskClarificationLifecycle(\"opened\")");
    expect(source).toContain("trackTaskClarificationLifecycle(\"proposal_ready\"");
    expect(source).toContain("trackTaskClarificationLifecycle(\"stale_blocked\"");
    expect(source).toContain("trackTaskClarificationLifecycle(\"applied\"");
    expect(source).toContain("trackTaskClarificationLifecycle(\"dismissed\"");
    expect(source).toContain("trackTaskClarificationLifecycle(payload.partial ? \"partial_undo\" : \"undone\"");
    expect(source).not.toContain("console.log");
  });
});
