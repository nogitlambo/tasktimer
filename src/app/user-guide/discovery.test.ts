import { describe, expect, it } from "vitest";
import robots from "../robots";
import { seoConfig } from "../seo";

describe("User Guide public discovery", () => {
  it("publishes the User Guide as an indexable public route", () => {
    const rules = robots().rules;
    const firstRule = Array.isArray(rules) ? rules[0] : rules;
    const allow = Array.isArray(firstRule.allow) ? firstRule.allow : [firstRule.allow].filter(Boolean);
    const disallow = Array.isArray(firstRule.disallow) ? firstRule.disallow : [firstRule.disallow].filter(Boolean);

    expect(seoConfig.publicRoutes.map((route) => route.path)).toContain("/user-guide/");
    expect(allow).toContain("/user-guide");
    expect(disallow).not.toContain("/user-guide");
  });
});
