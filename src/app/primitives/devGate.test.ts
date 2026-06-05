import { describe, expect, it } from "vitest";
import { normalizePrimitiveGalleryHostname, shouldShowPrimitiveGallery } from "./devGate";

describe("primitive gallery dev gate", () => {
  it("allows localhost development when the flag is unset", () => {
    expect(shouldShowPrimitiveGallery({ host: "localhost:3000", nodeEnv: "development" })).toBe(true);
  });

  it("allows local IP and IPv6 development hosts", () => {
    expect(shouldShowPrimitiveGallery({ host: "127.0.0.1:3000", nodeEnv: "development" })).toBe(true);
    expect(shouldShowPrimitiveGallery({ host: "[::1]:3000", nodeEnv: "development" })).toBe(true);
  });

  it("blocks production even on localhost", () => {
    expect(shouldShowPrimitiveGallery({ host: "localhost:3000", nodeEnv: "production" })).toBe(false);
  });

  it("blocks non-local development hosts", () => {
    expect(shouldShowPrimitiveGallery({ host: "tasklaunch.test", nodeEnv: "development" })).toBe(false);
  });

  it.each(["false", "0", "off"])("blocks localhost development when the flag is %s", (flag) => {
    expect(shouldShowPrimitiveGallery({ host: "localhost:3000", nodeEnv: "development", flag })).toBe(false);
  });

  it("normalizes hosts without losing bracketed IPv6 loopback", () => {
    expect(normalizePrimitiveGalleryHostname({ host: "localhost:3000" })).toBe("localhost");
    expect(normalizePrimitiveGalleryHostname({ host: "[::1]:3000" })).toBe("[::1]");
  });
});
