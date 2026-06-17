import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  enforcePublicRateLimit: vi.fn(),
  generateSignInWithEmailLink: vi.fn(),
  getFirebaseAdminAuth: vi.fn(),
  sendAuthSignInEmail: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: mocks.after,
  };
});

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
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.enforcePublicRateLimit.mockResolvedValue(undefined);
    mocks.generateSignInWithEmailLink.mockResolvedValue("https://tasktimer-prod.firebaseapp.com/auth/link");
    mocks.getFirebaseAdminAuth.mockReturnValue({
      generateSignInWithEmailLink: mocks.generateSignInWithEmailLink,
    });
    mocks.sendAuthSignInEmail.mockResolvedValue(undefined);
    mocks.after.mockImplementation((callback: () => unknown) => {
      void callback();
    });
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

  it("generates a Firebase email sign-in link and schedules app SMTP delivery", async () => {
    const response = await POST(emailLinkRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://tasklaunch.app");
    expect(mocks.generateSignInWithEmailLink).toHaveBeenCalledWith(
      "User@Example.com",
      expect.objectContaining({
        handleCodeInApp: true,
        url: "https://tasklaunch.app/login/",
      })
    );
    expect(mocks.generateSignInWithEmailLink.mock.calls[0][1]).not.toHaveProperty("linkDomain");
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.sendAuthSignInEmail).toHaveBeenCalledWith({
      email: "User@Example.com",
      signInLink: "https://tasktimer-prod.firebaseapp.com/auth/link",
    });
  });

  it("starts independent rate-limit checks together before generating the link", async () => {
    const releases: Array<() => void> = [];
    mocks.enforcePublicRateLimit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        })
    );

    const pendingResponse = POST(emailLinkRequest());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.enforcePublicRateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.generateSignInWithEmailLink).not.toHaveBeenCalled();

    releases.forEach((release) => release());
    const response = await pendingResponse;

    expect(response.status).toBe(200);
    expect(mocks.generateSignInWithEmailLink).toHaveBeenCalledTimes(1);
  });

  it("returns once the Firebase link is generated without waiting for SMTP delivery", async () => {
    let sendScheduled: (() => unknown) | undefined;
    mocks.after.mockImplementation((callback: () => unknown) => {
      sendScheduled = callback;
    });

    const response = await POST(emailLinkRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(mocks.sendAuthSignInEmail).not.toHaveBeenCalled();

    await sendScheduled?.();

    expect(mocks.sendAuthSignInEmail).toHaveBeenCalledWith({
      email: "User@Example.com",
      signInLink: "https://tasktimer-prod.firebaseapp.com/auth/link",
    });
  });

  it("uses a normalized Firebase Hosting custom link domain when configured", async () => {
    vi.stubEnv("AUTH_EMAIL_LINK_DOMAIN", "https://tasklaunch.app/");

    const response = await POST(emailLinkRequest());

    expect(response.status).toBe(200);
    expect(mocks.generateSignInWithEmailLink).toHaveBeenCalledWith(
      "User@Example.com",
      expect.objectContaining({
        handleCodeInApp: true,
        linkDomain: "tasklaunch.app",
        url: "https://tasklaunch.app/login/",
      })
    );
  });

  it("does not generate Android WebView localhost continue URLs", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "tasktimer-prod.firebaseapp.com");

    const response = await POST(
      new Request("https://tasklaunch.app/api/auth/email-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://localhost",
          referer: "https://localhost/login",
        },
        body: JSON.stringify({ email: "User@Example.com" }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.generateSignInWithEmailLink).toHaveBeenCalledWith(
      "User@Example.com",
      expect.objectContaining({
        handleCodeInApp: true,
        url: "https://tasktimer-prod.firebaseapp.com/login/",
      })
    );
  });

  it("logs scheduled SMTP failures without failing the already-returned response", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.sendAuthSignInEmail.mockRejectedValue(new Error("SMTP rejected the message"));

    const response = await POST(emailLinkRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(consoleErrorSpy).toHaveBeenCalledWith("Could not send auth sign-in email.", expect.any(Error));
  });
});
