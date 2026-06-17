const EMAIL_LINK_PARAM = "emailLink";

function asHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function wrapEmailSignInLinkForApp(signInLink: string, continueUrl: string) {
  const firebaseLink = signInLink.trim();
  const targetUrl = asHttpUrl(continueUrl);
  if (!firebaseLink || !targetUrl) return firebaseLink;
  targetUrl.searchParams.set(EMAIL_LINK_PARAM, firebaseLink);
  return targetUrl.href;
}

export function extractWrappedEmailSignInLink(href: string) {
  const url = asHttpUrl(href);
  if (!url) return "";
  return String(url.searchParams.get(EMAIL_LINK_PARAM) || "").trim();
}
