"use client";

export function resolveTaskTimerRouteHref(path: string) {
  const input = String(path || "").trim();
  if (!input) return "/tasklaunch";

  if (typeof window === "undefined") return input;

  const currentPath = String(window.location.pathname || "");
  const usesExportedHtmlPaths =
    window.location.protocol === "file:" || /\.html$/i.test(currentPath);
  if (!usesExportedHtmlPaths) return input;

  const hashIndex = input.indexOf("#");
  const queryIndex = input.indexOf("?");
  const cutIndex =
    queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
  const pathOnly = cutIndex >= 0 ? input.slice(0, cutIndex) : input;
  const trailing = cutIndex >= 0 ? input.slice(cutIndex) : "";
  if (/\/index\.html$/i.test(pathOnly)) return input;

  const normalizedPath = pathOnly.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/") return `/index.html${trailing}`;
  return `${normalizedPath}/index.html${trailing}`;
}
