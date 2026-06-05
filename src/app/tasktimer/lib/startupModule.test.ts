import { describe, expect, it } from "vitest";

import { normalizeStartupModule, startupModuleToAppPage, startupModuleToRoute } from "./startupModule";

describe("startupModule", () => {
  it("accepts Holding Space as a startup module", () => {
    expect(normalizeStartupModule("holding-space")).toBe("holding-space");
    expect(startupModuleToAppPage("holding-space")).toBe("holding-space");
    expect(startupModuleToRoute("holding-space")).toBe("/holding-space");
  });
});
