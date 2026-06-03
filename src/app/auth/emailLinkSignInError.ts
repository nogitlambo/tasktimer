export const USED_OR_EXPIRED_EMAIL_LINK_MESSAGE =
  "This sign-in link has already been used or has expired. Use Continue with email to request a new sign-in link.";

function getErrorCode(err: unknown) {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code || "").toLowerCase()
    : "";
}

function getErrorText(err: unknown) {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string") return msg.toLowerCase();
  }
  return String(err || "").toLowerCase();
}

export function isUsedOrExpiredEmailLinkError(err: unknown) {
  const code = getErrorCode(err);
  const text = getErrorText(err);
  return (
    code === "auth/invalid-action-code" ||
    code === "auth/expired-action-code" ||
    text.includes("auth/invalid-action-code") ||
    text.includes("auth/expired-action-code")
  );
}

export function getEmailLinkSignInErrorMessage(err: unknown, fallback: string) {
  if (isUsedOrExpiredEmailLinkError(err)) return USED_OR_EXPIRED_EMAIL_LINK_MESSAGE;
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}
