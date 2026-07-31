const NATIVE_APP_URL_SCHEME = "com.tasklaunch.app";

function asUrl(value: string) {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

function normalizeRouteInput(route: string) {
  const raw = String(route || "").trim();
  if (!raw) return "/tasklaunch";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function buildNativeAppRouteUrl(route: string) {
  const normalizedRoute = normalizeRouteInput(route);
  const hashIndex = normalizedRoute.indexOf("#");
  const queryIndex = normalizedRoute.indexOf("?");
  const cutIndex =
    queryIndex === -1 ? hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
  const pathOnly = cutIndex >= 0 ? normalizedRoute.slice(0, cutIndex) : normalizedRoute;
  const trailing = cutIndex >= 0 ? normalizedRoute.slice(cutIndex) : "";
  const segments = pathOnly.split("/").filter(Boolean);
  const host = segments[0] || "tasklaunch";
  const restPath = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "";
  return `${NATIVE_APP_URL_SCHEME}://${host}${restPath}${trailing}`;
}

export function resolveNativeAppRoute(rawUrl: string) {
  const url = asUrl(rawUrl);
  if (!url) return "";
  if (url.protocol.toLowerCase() !== `${NATIVE_APP_URL_SCHEME}:`) return "";
  const host = String(url.hostname || "").trim().toLowerCase();
  if (!host) return "";
  const pathname = String(url.pathname || "").replace(/\/+$/, "");
  const routePath = pathname && pathname !== "/" ? `/${host}${pathname}` : `/${host}`;
  return `${routePath}${url.search || ""}${url.hash || ""}`;
}
