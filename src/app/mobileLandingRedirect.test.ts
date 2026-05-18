import { describe, expect, it } from "vitest";
import { shouldRedirectMobileLanding } from "./mobileLandingRedirect";

describe("shouldRedirectMobileLanding", () => {
  it("returns true for mobile user agents", () => {
    expect(
      shouldRedirectMobileLanding(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"
      )
    ).toBe(true);
    expect(
      shouldRedirectMobileLanding(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/136.0.0.0 Mobile Safari/537.36"
      )
    ).toBe(true);
  });

  it("returns false for desktop user agents", () => {
    expect(
      shouldRedirectMobileLanding(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36"
      )
    ).toBe(false);
    expect(
      shouldRedirectMobileLanding(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15"
      )
    ).toBe(false);
  });
});
