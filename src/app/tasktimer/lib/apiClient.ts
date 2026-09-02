"use client";

import { isNativeOrFileRuntime } from "@/lib/firebaseClient";

const DEFAULT_NATIVE_API_ORIGIN = "https://tasklaunch.app";

function normalizeOrigin(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function withTrailingSlashBeforeSuffix(path: string) {
  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex >= 0 ? path.slice(0, suffixIndex) : path;
  const suffix = suffixIndex >= 0 ? path.slice(suffixIndex) : "";
  return `${pathname.endsWith("/") ? pathname : `${pathname}/`}${suffix}`;
}

export function getApiUrl(path: string) {
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  if (!isNativeOrFileRuntime()) return normalizedPath;
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || "");
  return `${configuredOrigin || DEFAULT_NATIVE_API_ORIGIN}${withTrailingSlashBeforeSuffix(normalizedPath)}`;
}
