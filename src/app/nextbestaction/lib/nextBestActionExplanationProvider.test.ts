import { describe, expect, it, vi } from "vitest";

import { createNextBestActionExplanationProvider, validateNextBestActionAiExplanation } from "./nextBestActionExplanationProvider";

const input = { reasonCodes: ["DUE_SOON", "HAS_CLEAR_FIRST_ACTION"] as const, confidence: "HIGH" as const, availableMinutes: 20 };

describe("Next Best Action explanation provider", () => {
  it("accepts a grounded structured provider response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ output_text: JSON.stringify({ explanation: "It is due soon and has a clear first action." }) }), { status: 200 }));
    await expect(createNextBestActionExplanationProvider({ apiKey: "key", fetchImpl }).explain(input)).resolves.toBe("It is due soon and has a clear first action.");
  });

  it("falls back by rejecting invented or unsupported claims", () => {
    expect(validateNextBestActionAiExplanation({ explanation: "It has an urgent deadline tomorrow." }, input)).toBeNull();
    expect(validateNextBestActionAiExplanation({ explanation: "It is high priority and due soon." }, input)).toBeNull();
  });

  it("rejects malformed provider output and provider failures", async () => {
    const malformed = vi.fn(async () => new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 }));
    const failed = vi.fn(async () => new Response("", { status: 503 }));
    await expect(createNextBestActionExplanationProvider({ apiKey: "key", fetchImpl: malformed }).explain(input)).rejects.toMatchObject({ code: "next-best-action/explanation-failed" });
    await expect(createNextBestActionExplanationProvider({ apiKey: "key", fetchImpl: failed }).explain(input)).rejects.toMatchObject({ code: "next-best-action/explanation-failed" });
  });
});
