import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";
import { organizationJsonLd, seoConfig } from "./seo";

describe("TaskLaunch brand assets", () => {
  it("uses the canonical wordmark for organization structured data", () => {
    expect(seoConfig.organizationWordmarkPath).toBe("/logo/tasklaunch-logo-main.png");
    expect(organizationJsonLd().logo).toBe("https://tasklaunch.app/logo/tasklaunch-logo-main.png");
  });

  it("keeps browser and PWA icon roles on existing square assets", () => {
    const iconSources = (manifest().icons ?? []).map((icon) => icon.src);
    const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(iconSources).toContain("/logo/tasklaunch-icon-512.webp");
    expect(iconSources).toContain("/logo/tasklaunch-icon-512.png");
    expect(iconSources).not.toContain("/logo/tasklaunch-logo-main.png");
    expect(iconSources.some((source) => String(source).includes("lime-icon"))).toBe(false);
    expect(layoutSource).toContain("seoConfig.appIconPath");
    expect(layoutSource).not.toContain("seoConfig.organizationWordmarkPath");

    for (const source of iconSources) {
      expect(existsSync(join(process.cwd(), "public", String(source).replace(/^\//, "")))).toBe(true);
    }
  });
});
