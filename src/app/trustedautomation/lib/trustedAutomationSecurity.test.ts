import { describe, expect, it, vi } from "vitest";

import { assertTrustedAutomationAccountActive, safeAutomationFailureMessage } from "./trustedAutomationSecurity";

function createDb(exists: boolean) {
  const get = vi.fn().mockResolvedValue({ exists });
  const doc = vi.fn(() => ({ get }));
  const collection = vi.fn(() => ({ doc }));
  return { db: { collection }, get, doc };
}

describe("Trusted Automation security boundary", () => {
  it("blocks account-deleted users before automation state is accessed", async () => {
    const mock = createDb(true);

    await expect(assertTrustedAutomationAccountActive("user-1", mock.db as never)).rejects.toMatchObject({
      code: "AUTOMATION_ACCOUNT_DELETED",
      status: 403,
    });
    expect(mock.db.collection).toHaveBeenCalledWith("deletedAccountUids");
    expect(mock.doc).toHaveBeenCalledWith("user-1");
  });

  it("allows active accounts and maps failures to content-free diagnostics", async () => {
    const mock = createDb(false);

    await expect(assertTrustedAutomationAccountActive("user-1", mock.db as never)).resolves.toBeUndefined();
    expect(safeAutomationFailureMessage("DEPENDENCY", "DEPENDENCY_UNAVAILABLE")).toBe("Automation dependency unavailable.");
    expect(safeAutomationFailureMessage("UNKNOWN", "UNKNOWN")).toBe("Automation execution failed.");
    expect(safeAutomationFailureMessage("UNKNOWN", "UNKNOWN")).not.toContain("prompt");
  });
});
