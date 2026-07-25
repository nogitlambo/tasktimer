const LOGIN_PATH = "/login";

function asUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function isEmailSignInActionUrl(url: URL) {
  const mode = String(url.searchParams.get("mode") || "").trim().toLowerCase();
  const hasCode = Boolean(String(url.searchParams.get("oobCode") || "").trim());
  return mode === "signin" && hasCode;
}

function isFirebaseEmailLinkUrl(url: URL) {
  return (
    /^\/__\/auth\/(?:action|links)/i.test(url.pathname || "") ||
    isEmailSignInActionUrl(url)
  );
}

function normalizeLoginRouteFromUrl(url: URL) {
  const pathname = String(url.pathname || "").replace(/\/+$/, "") || "/";
  if (pathname.toLowerCase() !== LOGIN_PATH) return "";
  const params = new URLSearchParams(url.search);
  const wrappedLink = String(params.get("emailLink") || "").trim();
  if (!wrappedLink && !isEmailSignInActionUrl(url)) return "";
  return `${LOGIN_PATH}?${params.toString()}`;
}

export function resolveNativeEmailLinkLoginRoute(rawUrl: string) {
  const url = asUrl(rawUrl);
  if (!url) return "";
  const protocol = url.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") return "";

  const loginRoute = normalizeLoginRouteFromUrl(url);
  if (loginRoute) return loginRoute;

  if (!isFirebaseEmailLinkUrl(url)) return "";
  const params = new URLSearchParams();
  params.set("emailLink", url.href);
  return `${LOGIN_PATH}?${params.toString()}`;
}
