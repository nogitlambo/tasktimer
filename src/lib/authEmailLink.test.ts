import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

import { sendAuthSignInEmail } from "./authEmailLink";

describe("sendAuthSignInEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.AUTH_EMAIL_FROM = "TaskLaunch Auth <auth@example.test>";
    process.env.AUTH_EMAIL_REPLY_TO = "support@example.test";
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue(undefined);
  });

  it("sends the generated sign-in link through SMTP", async () => {
    await sendAuthSignInEmail({
      email: "User@Example.com",
      signInLink: "https://tasktimer-prod.firebaseapp.com/auth/link?mode=signIn&oobCode=abc",
    });

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 587,
      secure: false,
      auth: { user: "smtp-user", pass: "smtp-pass" },
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "User@Example.com",
        from: "TaskLaunch Auth <auth@example.test>",
        replyTo: "support@example.test",
        subject: "Sign in to TaskLaunch",
        text: expect.stringContaining("https://tasktimer-prod.firebaseapp.com/auth/link?mode=signIn&oobCode=abc"),
        html: expect.stringContaining("Sign in to TaskLaunch"),
      })
    );
  });
});
