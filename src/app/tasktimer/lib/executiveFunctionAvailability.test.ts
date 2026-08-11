import { describe, expect, it } from "vitest";

import {
  EXECUTIVE_FUNCTION_DISABLED_MESSAGE,
  getExecutiveFunctionLockedActionLabel,
} from "./executiveFunctionAvailability";

describe("getExecutiveFunctionLockedActionLabel", () => {
  it("keeps upgrade CTA text for plan-locked users", () => {
    expect(getExecutiveFunctionLockedActionLabel("Upgrade to PLUS to use Executive Function features.", "Retry")).toBe("Upgrade to PLUS");
  });

  it("uses the normal action label for PLUS users who disabled Executive Function", () => {
    expect(getExecutiveFunctionLockedActionLabel(EXECUTIVE_FUNCTION_DISABLED_MESSAGE, "Retry")).toBe("Retry");
    expect(getExecutiveFunctionLockedActionLabel(EXECUTIVE_FUNCTION_DISABLED_MESSAGE, "Refresh")).toBe("Refresh");
  });
});
