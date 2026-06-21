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

import { sendEarlyAccessConfirmationEmail } from "./earlyAccessEmail";

describe("sendEarlyAccessConfirmationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.EARLY_ACCESS_UNSUBSCRIBE_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://tasklaunch.test";
    delete process.env.EARLY_ACCESS_EMAIL_FROM;
    delete process.env.EARLY_ACCESS_EMAIL_REPLY_TO;
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue(undefined);
  });

  it("sends warm early access launch copy with unsubscribe links in text and html", async () => {
    await sendEarlyAccessConfirmationEmail({ email: "User@Example.com" });

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.test",
      port: 587,
      secure: false,
      auth: { user: "smtp-user", pass: "smtp-pass" },
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);

    const payload = mocks.sendMail.mock.calls[0][0];
    expect(payload).toMatchObject({
      to: "User@Example.com",
      from: "TaskLaunch <support@tasklaunch.app>",
      replyTo: "support@tasklaunch.app",
      subject: "Early Access List",
    });
    expect(payload.text).not.toContain("Early access opens on May 25, 2026.");
    expect(payload.text).toContain("Thank you for registering your interest in TaskLaunch.");
    expect(payload.text).toContain("TaskLaunch is built for neurodivergent productivity patterns");
    expect(payload.text).toContain("progress without guilt-driven systems.");
    expect(payload.text).toContain("Learn more about TaskLaunch: https://tasklaunch.app/about");
    expect(payload.text).toContain("If you did not request this, unsubscribe here: https://tasklaunch.test/unsubscribe?");
    expect(payload.html).not.toContain("Early access opens on May 25, 2026.");
    expect(payload.html).toContain("Thank you for registering your interest in TaskLaunch.");
    expect(payload.html).toContain("TaskLaunch is built for neurodivergent productivity patterns");
    expect(payload.html).toContain("progress without guilt-driven systems.");
    expect(payload.html).toContain('src="https://tasklaunch.app/logo/tasklaunch-logo.webp"');
    expect(payload.html).toContain('alt="TaskLaunch"');
    expect(payload.html).toContain('href="https://tasklaunch.app/about"');
    expect(payload.html).toContain(">About TaskLaunch</a>");
    expect(payload.html).toContain('href="https://tasklaunch.test/unsubscribe?');
  });
});
