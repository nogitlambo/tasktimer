"use client";

import { isNativeOrFileRuntime } from "@/lib/firebaseClient";

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

export function getApiUrl(path: string) {
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  if (!isNativeOrFileRuntime()) return normalizedPath;
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || "");
  return configuredOrigin ? `${configuredOrigin}${normalizedPath}` : normalizedPath;
}
