import nodemailer from "nodemailer";

const DEFAULT_FROM = "TaskLaunch <support@tasklaunch.app>";
const EMAIL_SUBJECT = "Sign in to TaskLaunch";
const LOGO_URL = "https://tasklaunch.app/logo/tasklaunch-logo.webp";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function getRequiredEnv(name: string) {
  const value = asString(process.env[name]);
  if (!value) throw new Error(`${name} is required to send auth sign-in email.`);
  return value;
}

function getSmtpSecure() {
  const raw = asString(process.env.SMTP_SECURE).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return Number(process.env.SMTP_PORT) === 465;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailBody(input: { signInLink: string }) {
  const escapedLink = escapeHtml(input.signInLink);
  const escapedLogoUrl = escapeHtml(LOGO_URL);
  const text = [
    "Sign in to TaskLaunch",
    "",
    "Use this secure link to sign in:",
    input.signInLink,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0d0f13;color:#f7fafc;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.16);border-radius:12px;padding:24px;background:#151923;">
      <img src="${escapedLogoUrl}" alt="TaskLaunch" width="220" style="display:block;width:220px;max-width:100%;height:auto;margin:0 0 16px;" />
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">Sign in to TaskLaunch</h1>
      <p style="margin:0 0 16px;line-height:1.55;">Use this secure link to sign in.</p>
      <p style="margin:0 0 20px;line-height:1.55;"><a href="${escapedLink}" style="display:inline-block;background:#c6f238;color:#0d0f13;text-decoration:none;font-weight:700;padding:12px 16px;border-radius:0;">Sign in</a></p>
      <p style="margin:0;color:#b8c0cc;font-size:14px;line-height:1.5;">If you did not request this, you can ignore this email.</p>
    </div>
  </body>
</html>`;

  return { text, html };
}

export async function sendAuthSignInEmail(input: { email: string; signInLink: string }) {
  const email = asString(input.email, 320);
  const signInLink = asString(input.signInLink, 4096);
  if (!email || !signInLink) throw new Error("Email and sign-in link are required.");

  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isFinite(port) || port <= 0) throw new Error("SMTP_PORT must be a valid port number.");

  const user = asString(process.env.SMTP_USER);
  const pass = asString(process.env.SMTP_PASS);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: getSmtpSecure(),
    auth: user || pass ? { user, pass } : undefined,
  });

  const body = buildEmailBody({ signInLink });

  await transporter.sendMail({
    to: email,
    from: asString(process.env.AUTH_EMAIL_FROM, 320) || asString(process.env.EARLY_ACCESS_EMAIL_FROM, 320) || DEFAULT_FROM,
    replyTo:
      asString(process.env.AUTH_EMAIL_REPLY_TO, 320) ||
      asString(process.env.EARLY_ACCESS_EMAIL_REPLY_TO, 320) ||
      "support@tasklaunch.app",
    subject: EMAIL_SUBJECT,
    text: body.text,
    html: body.html,
  });
}
