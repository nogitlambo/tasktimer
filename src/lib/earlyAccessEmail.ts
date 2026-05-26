import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

const DEFAULT_FROM = "TaskLaunch <support@tasklaunch.app>";
const EMAIL_SUBJECT = "Early Access List";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

export function normalizeEarlyAccessEmail(value: unknown) {
  return asString(value, 320).toLowerCase();
}

function getRequiredEnv(name: string) {
  const value = asString(process.env[name]);
  if (!value) throw new Error(`${name} is required to send early access email.`);
  return value;
}

function getAppBaseUrl() {
  return asString(process.env.NEXT_PUBLIC_APP_URL) || "https://tasklaunch.app";
}

function getSmtpSecure() {
  const raw = asString(process.env.SMTP_SECURE).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "no") return false;
  return Number(process.env.SMTP_PORT) === 465;
}

function signEarlyAccessEmail(emailNormalized: string) {
  return createHmac("sha256", getRequiredEnv("EARLY_ACCESS_UNSUBSCRIBE_SECRET"))
    .update(emailNormalized)
    .digest("base64url");
}

export function createEarlyAccessUnsubscribeToken(email: string) {
  const emailNormalized = normalizeEarlyAccessEmail(email);
  if (!emailNormalized) throw new Error("A valid email address is required.");
  return signEarlyAccessEmail(emailNormalized);
}

export function verifyEarlyAccessUnsubscribeToken(email: string, token: string) {
  const emailNormalized = normalizeEarlyAccessEmail(email);
  let expected = "";
  try {
    expected = emailNormalized ? signEarlyAccessEmail(emailNormalized) : "";
  } catch {
    return false;
  }
  const candidate = asString(token, 512);
  if (!expected || !candidate) return false;

  const expectedBuffer = Buffer.from(expected);
  const candidateBuffer = Buffer.from(candidate);
  if (expectedBuffer.length !== candidateBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, candidateBuffer);
}

export function buildEarlyAccessUnsubscribeUrl(email: string) {
  const emailNormalized = normalizeEarlyAccessEmail(email);
  const token = createEarlyAccessUnsubscribeToken(emailNormalized);
  const url = new URL("/unsubscribe", getAppBaseUrl());
  url.searchParams.set("email", emailNormalized);
  url.searchParams.set("token", token);
  return url.toString();
}

function buildAboutUrl() {
  return new URL("/about", getAppBaseUrl()).toString();
}

function buildEmailLogoUrl() {
  return new URL("/logo/launch-icon-original-transparent.png", getAppBaseUrl()).toString();
}

function buildEmailBody(input: { email: string; unsubscribeUrl: string }) {
  const aboutUrl = buildAboutUrl();
  const logoUrl = buildEmailLogoUrl();
  const text = [
    "You're on the TaskLaunch early access list.",
    "",
    "Thank you for registering your interest in TaskLaunch.",
    "",
    "TaskLaunch is built for neurodivergent productivity patterns: flexible momentum, gentle recovery after inconsistency, and progress without guilt-driven systems.",
    "",
    "We'll email this address when access opens.",
    "",
    `Learn more about TaskLaunch: ${aboutUrl}`,
    "",
    `If you did not request this, unsubscribe here: ${input.unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0d0f13;color:#f7fafc;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.16);border-radius:12px;padding:24px;background:#151923;">
      <img src="${logoUrl}" alt="TaskLaunch" width="56" height="56" style="display:block;width:56px;height:56px;margin:0 0 16px;" />
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">You're on the TaskLaunch early access list.</h1>
      <p style="margin:0 0 16px;line-height:1.55;">Thank you for registering your interest in TaskLaunch.</p>
      <p style="margin:0 0 16px;line-height:1.55;">TaskLaunch is built for neurodivergent productivity patterns: flexible momentum, gentle recovery after inconsistency, and progress without guilt-driven systems.</p>
      <p style="margin:0 0 16px;line-height:1.55;">We'll email this address when access opens.</p>
      <p style="margin:0 0 16px;line-height:1.55;"><a href="${aboutUrl}" style="color:#67e8f9;">About TaskLaunch</a></p>
      <p style="margin:0;color:#b8c0cc;font-size:14px;line-height:1.5;">If you did not request this, <a href="${input.unsubscribeUrl}" style="color:#67e8f9;">unsubscribe here</a>.</p>
    </div>
  </body>
</html>`;

  return { text, html };
}

export async function sendEarlyAccessConfirmationEmail(input: { email: string }) {
  const email = asString(input.email, 320);
  const emailNormalized = normalizeEarlyAccessEmail(email);
  if (!emailNormalized) throw new Error("A valid email address is required.");

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

  const unsubscribeUrl = buildEarlyAccessUnsubscribeUrl(emailNormalized);
  const body = buildEmailBody({ email: emailNormalized, unsubscribeUrl });

  await transporter.sendMail({
    to: email,
    from: asString(process.env.EARLY_ACCESS_EMAIL_FROM, 320) || DEFAULT_FROM,
    replyTo: asString(process.env.EARLY_ACCESS_EMAIL_REPLY_TO, 320) || "support@tasklaunch.app",
    subject: EMAIL_SUBJECT,
    text: body.text,
    html: body.html,
  });
}
