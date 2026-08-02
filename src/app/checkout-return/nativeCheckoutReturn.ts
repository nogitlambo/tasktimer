import { buildNativeAppRouteUrl } from "@/lib/nativeAppLinks";

const CHECKOUT_RETURN_PATH = "/checkout-return";
const NATIVE_HANDOFF_PARAM = "nativeHandoff";
const NATIVE_APP_URL_SCHEME = "com.tasklaunch.app";
const ALLOWED_TARGETS = new Set(["/account", "/settings", "/dashboard", "/tasklaunch", "/pricing", "/login"]);

function asUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function normalizeHostedCheckoutReturnPath(pathname: string) {
  return String(pathname || "").replace(/\/+$/, "") || "/";
}

function normalizeTargetRoute(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("//") || normalized.includes("\\") || normalized.includes("://")) return "";
  const pathOnly = normalized.split("#")[0]?.split("?")[0] || "";
  return ALLOWED_TARGETS.has(pathOnly.replace(/\/+$/, "") || "/") ? normalized : "";
}

function appendNativeHandoffAttempt(url: URL) {
  const nextUrl = new URL(url.href);
  nextUrl.searchParams.set(NATIVE_HANDOFF_PARAM, "1");
  return nextUrl.href;
}

function isMobileUserAgent(userAgent: string) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent || "");
}

export function isHostedCheckoutReturnUrl(rawUrl: string) {
  const url = asUrl(rawUrl);
  if (!url) return false;
  return normalizeHostedCheckoutReturnPath(url.pathname) === CHECKOUT_RETURN_PATH;
}

export function resolveHostedCheckoutReturnRoute(rawUrl: string) {
  const url = asUrl(rawUrl);
  if (!url || !isHostedCheckoutReturnUrl(rawUrl)) return "";
  const target = normalizeTargetRoute(String(url.searchParams.get("target") || ""));
  if (!target) return "";

  const targetUrl = new URL(target, "https://tasklaunch.app");
  const mergedParams = new URLSearchParams(targetUrl.search);
  url.searchParams.forEach((value, key) => {
    if (key === "target" || key === NATIVE_HANDOFF_PARAM) return;
    mergedParams.set(key, value);
  });
  const query = mergedParams.toString();
  return `${targetUrl.pathname}${query ? `?${query}` : ""}${targetUrl.hash || ""}`;
}

export function shouldAttemptNativeCheckoutReturnHandoff(rawUrl: string, userAgent: string) {
  const url = asUrl(rawUrl);
  if (!url) return false;
  if (String(url.searchParams.get(NATIVE_HANDOFF_PARAM) || "") === "1") return false;
  if (!resolveHostedCheckoutReturnRoute(rawUrl)) return false;
  return isMobileUserAgent(userAgent);
}

export function buildNativeCheckoutReturnHandoffUrl(rawUrl: string, userAgent: string) {
  const url = asUrl(rawUrl);
  const route = resolveHostedCheckoutReturnRoute(rawUrl);
  if (!url || !route || !shouldAttemptNativeCheckoutReturnHandoff(rawUrl, userAgent)) return "";
  const fallbackUrl = appendNativeHandoffAttempt(url);
  const nativeUrl = buildNativeAppRouteUrl(route);
  if (/Android/i.test(userAgent || "")) {
    const parsedNativeUrl = asUrl(nativeUrl);
    if (!parsedNativeUrl) return nativeUrl;
    const host = String(parsedNativeUrl.hostname || "").trim().toLowerCase();
    const pathname = String(parsedNativeUrl.pathname || "");
    const query = parsedNativeUrl.search ? parsedNativeUrl.search.slice(1) : "";
    return `intent://${host}${pathname}${query ? `?${query}` : ""}#Intent;scheme=${NATIVE_APP_URL_SCHEME};package=com.tasklaunch.app;S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`;
  }
  return nativeUrl;
}

