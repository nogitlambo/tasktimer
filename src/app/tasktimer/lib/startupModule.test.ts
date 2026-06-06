import { describe, expect, it } from "vitest";

import { normalizeStartupModule, startupModuleToAppPage, startupModuleToRoute } from "./startupModule";

describe("startupModule", () => {
  it("accepts Session Notes as a startup module", () => {
    expect(normalizeStartupModule("session-notes")).toBe("session-notes");
    expect(startupModuleToAppPage("session-notes")).toBe("session-notes");
    expect(startupModuleToRoute("session-notes")).toBe("/session-notes");
  });
});
