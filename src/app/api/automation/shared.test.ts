import { describe, expect, it } from "vitest";

import { safeAutomationError } from "./shared";

describe("Trusted Automation API error boundary", () => {
  it("never returns arbitrary provider or authorization error text", () => {
    const safe = safeAutomationError(Object.assign(new Error("private task notes and provider response"), { status: 400, code: "INVALID_SCHEMA" }));

    expect(safe).toEqual({ status: 400, code: "INVALID_SCHEMA", message: "Automation request is invalid." });
    expect(JSON.stringify(safe)).not.toContain("private task notes");
  });
});
