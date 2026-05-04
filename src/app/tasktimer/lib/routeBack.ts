"use client";

import { STORAGE_KEY } from "./storage";

const NAV_STACK_KEY = `${STORAGE_KEY}:navStack`;

function normalizeKnownRoute(pathRaw: string) {
  const trimmed = String(pathRaw || "").trim();
  if (!trimmed) return "";
  const [pathAndQuery, hash = ""] = trimmed.split("#");
  const [pathOnly, query = ""] = String(pathAndQuery || "").split("?");
  let normalizedPath = pathOnly.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  normalizedPath = normalizedPath.replace(/\/index\.html$/i, "");

  if (/^\/$/.test(normalizedPath)) return `/${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/tasklaunch$/i.test(normalizedPath)) return `/tasklaunch${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/dashboard$/i.test(normalizedPath)) return `/dashboard${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/friends$/i.test(normalizedPath)) return `/friends${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/leaderboard$/i.test(normalizedPath)) return `/leaderboard${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/settings$/i.test(normalizedPath)) return `/settings${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/history-manager$/i.test(normalizedPath)) return `/history-manager${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/feedback$/i.test(normalizedPath)) return `/feedback${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/privacy$/i.test(normalizedPath)) return `/privacy${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  if (/\/signed-out$/i.test(normalizedPath)) return `/signed-out${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  return "";
}

function pathForAppToken(token: string) {
  const match = String(token || "").match(/\|page=(tasks|schedule|dashboard|friends|leaderboard|history)$/);
  if (!match) return "";
  const page = match[1];
  if (page === "dashboard") return "/dashboard";
  if (page === "friends") return "/friends";
  if (page === "leaderboard") return "/leaderboard";
  if (page === "history") return "/history-manager";
  if (page === "schedule") return "/tasklaunch?page=schedule";
  return "/tasklaunch";
}

function readNavStackTarget(currentPath: string) {
  try {
    const raw = window.localStorage.getItem(NAV_STACK_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return "";
    const currentNormalized = normalizeKnownRoute(currentPath);
    for (let index = parsed.length - 1; index >= 0; index -= 1) {
      const token = String(parsed[index] || "").trim();
      if (!token) continue;
      if (token.startsWith("route:")) {
        const normalized = normalizeKnownRoute(token.slice("route:".length));
        if (normalized && normalized !== currentNormalized) return normalized;
        continue;
      }
      if (token.startsWith("app:")) {
        const normalized = normalizeKnownRoute(pathForAppToken(token));
        if (normalized && normalized !== currentNormalized) return normalized;
      }
    }
  } catch {
    // ignore storage/JSON failures
  }
  return "";
}

export function resolveStandaloneRouteBackTarget(fallbackPath: string) {
  if (typeof window === "undefined") return fallbackPath;

  const currentPath = `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  const currentNormalized = normalizeKnownRoute(currentPath);

  try {
    const referrer = String(document.referrer || "").trim();
    if (referrer) {
      const refUrl = new URL(referrer, window.location.href);
      if (refUrl.origin === window.location.origin) {
        const normalizedReferrer = normalizeKnownRoute(`${refUrl.pathname || "/"}${refUrl.search || ""}${refUrl.hash || ""}`);
        if (normalizedReferrer && normalizedReferrer !== currentNormalized) return normalizedReferrer;
      }
    }
  } catch {
    // ignore referrer parsing failures
  }

  const navStackTarget = readNavStackTarget(currentPath);
  if (navStackTarget) return navStackTarget;

  return fallbackPath;
}
