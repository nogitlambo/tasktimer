const LOGIN_PATH = "/login";
const NATIVE_APP_URL_SCHEME = "com.tasklaunch.app";
const NATIVE_HANDOFF_PARAM = "nativeHandoff";

function asUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function appendNativeHandoffAttempt(url: URL) {
  const nextUrl = new URL(url.href);
  nextUrl.searchParams.set(NATIVE_HANDOFF_PARAM, "1");
  return nextUrl.href;
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

function normalizeCustomSchemeLoginRoute(url: URL) {
  const protocol = url.protocol.toLowerCase();
  if (protocol !== `${NATIVE_APP_URL_SCHEME}:`) return "";
  const host = String(url.hostname || "").trim().toLowerCase();
  const pathname = String(url.pathname || "").replace(/\/+$/, "") || "/";
  if (host !== "login" && pathname.toLowerCase() !== LOGIN_PATH) return "";
  const params = new URLSearchParams(url.search);
  const wrappedLink = String(params.get("emailLink") || "").trim();
  if (!wrappedLink && !isEmailSignInActionUrl(url)) return "";
  return `${LOGIN_PATH}?${params.toString()}`;
}

export function resolveNativeEmailLinkLoginRoute(rawUrl: string) {
  const url = asUrl(rawUrl);
  if (!url) return "";
  const protocol = url.protocol.toLowerCase();
  const customSchemeLoginRoute = normalizeCustomSchemeLoginRoute(url);
  if (customSchemeLoginRoute) return customSchemeLoginRoute;

  if (protocol !== "https:" && protocol !== "http:") return "";

  const loginRoute = normalizeLoginRouteFromUrl(url);
  if (loginRoute) return loginRoute;

  if (!isFirebaseEmailLinkUrl(url)) return "";
  const params = new URLSearchParams();
  params.set("emailLink", url.href);
  return `${LOGIN_PATH}?${params.toString()}`;
}

export function shouldAttemptNativeEmailLinkHandoff(rawUrl: string, userAgent: string) {
  const url = asUrl(rawUrl);
  if (!url) return false;
  if (String(url.searchParams.get(NATIVE_HANDOFF_PARAM) || "") === "1") return false;
  if (!normalizeLoginRouteFromUrl(url) && !isFirebaseEmailLinkUrl(url)) return false;
  return /Android|iPhone|iPad|iPod/i.test(userAgent || "");
}

export function buildNativeEmailLinkHandoffUrl(rawUrl: string, userAgent: string) {
  const url = asUrl(rawUrl);
  if (!url || !shouldAttemptNativeEmailLinkHandoff(rawUrl, userAgent)) return "";
  const fallbackUrl = appendNativeHandoffAttempt(url);
  const loginRoute = normalizeLoginRouteFromUrl(url);
  const params = new URLSearchParams(loginRoute ? loginRoute.split("?", 2)[1] || "" : "");
  if (!loginRoute) params.set("emailLink", url.href);
  params.set(NATIVE_HANDOFF_PARAM, "1");
  const query = params.toString();
  if (/Android/i.test(userAgent || "")) {
    return `intent://login${query ? `?${query}` : ""}#Intent;scheme=${NATIVE_APP_URL_SCHEME};package=com.tasklaunch.app;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  }
  return `${NATIVE_APP_URL_SCHEME}://login${query ? `?${query}` : ""}`;
}
