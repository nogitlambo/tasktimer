import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_USER_GUIDE_MODULE_IDS,
  USER_GUIDE_MODULES,
  filterUserGuideModules,
} from "./content";

describe("User Guide content", () => {
  it("covers every required current module with steps and screenshots", () => {
    const ids = USER_GUIDE_MODULES.map((module) => module.id);

    expect(ids).toEqual(REQUIRED_USER_GUIDE_MODULE_IDS);
    USER_GUIDE_MODULES.forEach((module) => {
      expect(module.howTos.length).toBeGreaterThan(0);
      expect(module.details.length).toBeGreaterThan(0);
      expect(module.tips.length).toBeGreaterThan(0);
      expect(module.screenshot).toMatch(/^\/user-guide\/.+\.webp$/);
      expect(existsSync(join(process.cwd(), "public", module.screenshot))).toBe(true);
    });
  });

  it("filters by title, category, and how-to step text", () => {
    expect(filterUserGuideModules(USER_GUIDE_MODULES, "dashboard").map((module) => module.id)).toContain("dashboard");
    expect(filterUserGuideModules(USER_GUIDE_MODULES, "social").map((module) => module.id)).toContain("friends");
    expect(filterUserGuideModules(USER_GUIDE_MODULES, "manual history entry").map((module) => module.id)).toContain("history-manager");
  });
});
