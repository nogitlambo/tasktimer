import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforcePublicRateLimit: vi.fn(),
  generateSignInWithEmailLink: vi.fn(),
  getFirebaseAdminAuth: vi.fn(),
  sendAuthSignInEmail: vi.fn(),
}));

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
  return {
    ...actual,
    enforcePublicRateLimit: mocks.enforcePublicRateLimit,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminAuth: mocks.getFirebaseAdminAuth,
}));

vi.mock("@/lib/authEmailLink", () => ({
  sendAuthSignInEmail: mocks.sendAuthSignInEmail,
}));

import { OPTIONS, POST } from "./route";

function emailLinkRequest(email = "User@Example.com") {
  return new Request("https://tasklaunch.app/api/auth/email-link", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://tasklaunch.app",
      referer: "https://tasklaunch.app/login",
    },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/email-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePublicRateLimit.mockResolvedValue(undefined);
    mocks.generateSignInWithEmailLink.mockResolvedValue("https://tasktimer-prod.firebaseapp.com/auth/link");
    mocks.getFirebaseAdminAuth.mockReturnValue({
      generateSignInWithEmailLink: mocks.generateSignInWithEmailLink,
    });
    mocks.sendAuthSignInEmail.mockResolvedValue(undefined);
  });

  it("allows native preflight requests", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/auth/email-link", {
        method: "OPTIONS",
        headers: {
          origin: "capacitor://localhost",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
  });

  it("generates a Firebase email sign-in link and sends it through app SMTP", async () => {
    const response = await POST(emailLinkRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://tasklaunch.app");
    expect(mocks.generateSignInWithEmailLink).toHaveBeenCalledWith(
      "User@Example.com",
      expect.objectContaining({
        handleCodeInApp: true,
        url: "https://tasklaunch.app/login",
      })
    );
    expect(mocks.generateSignInWithEmailLink.mock.calls[0][1]).not.toHaveProperty("linkDomain");
    expect(mocks.sendAuthSignInEmail).toHaveBeenCalledWith({
      email: "User@Example.com",
      signInLink: "https://tasktimer-prod.firebaseapp.com/auth/link",
    });
  });

  it("returns an error when SMTP sending fails", async () => {
    mocks.sendAuthSignInEmail.mockRejectedValue(new Error("SMTP rejected the message"));

    const response = await POST(emailLinkRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Could not send sign-in email right now." });
  });
});
