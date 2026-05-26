import { describe, expect, it } from "vitest";

import { extractClientIp } from "./rateLimit";

describe("extractClientIp", () => {
  it("ignores spoofable forwarding headers without trusted proxy secret", () => {
    delete process.env.TRUSTED_PROXY_HEADER_SECRET;
    const req = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
        "cf-connecting-ip": "9.9.9.9",
      },
    });
    expect(extractClientIp(req)).toBe("unknown");
  });

  it("uses trusted proxy headers when authenticated", () => {
    process.env.TRUSTED_PROXY_HEADER_SECRET = "secret";
    const req = new Request("https://example.test", {
      headers: {
        "x-tasktimer-proxy-auth": "secret",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });
});
