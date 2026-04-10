"use client";

import { Capacitor } from "@capacitor/core";

export function resolveTaskTimerRouteHref(path: string) {
  const input = String(path || "").trim();
  if (!input) return "/tasklaunch";

  if (typeof window === "undefined") return input;

  const currentPath = String(window.location.pathname || "");
  const isNativeCapacitorRuntime = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();
  const usesExportedHtmlPaths =
    window.location.protocol === "file:" || /\.html$/i.test(currentPath) || isNativeCapacitorRuntime;
  if (!usesExportedHtmlPaths) return input;

  const hashIndex = input.indexOf("#");
  const queryIndex = input.indexOf("?");
  const cutIndex =
    queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
  const pathOnly = cutIndex >= 0 ? input.slice(0, cutIndex) : input;
  const trailing = cutIndex >= 0 ? input.slice(cutIndex) : "";
  if (/\/index\.html$/i.test(pathOnly)) return input;

  const normalizedPath = pathOnly.replace(/\/+$/, "") || "/";
  return `${normalizedPath}/index.html${trailing}`;
}
