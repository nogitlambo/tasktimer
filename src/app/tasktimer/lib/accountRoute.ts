const ACCOUNT_BACK_FALLBACK_ROUTE = "/dashboard";

function normalizeTaskTimerAccountBackPath(pathname: string) {
  const normalized = String(pathname || "")
    .replace(/\\/g, "/")
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/, "") || "/";

  if (normalized === "/tasklaunch") return "/tasklaunch";
  if (normalized === "/dashboard") return "/dashboard";
  if (normalized === "/friends") return "/friends";
  if (normalized === "/leaderboard") return "/leaderboard";
  if (normalized === "/history-manager") return "/history-manager";
  if (normalized === "/settings") return "/settings";
  if (normalized === "/feedback") return "/feedback";
  return "";
}

export function getAccountBackRoute(referrer: string, currentHref: string) {
  try {
    const currentUrl = new URL(currentHref);
    const referrerUrl = new URL(referrer, currentUrl);
    if (referrerUrl.origin !== currentUrl.origin) return ACCOUNT_BACK_FALLBACK_ROUTE;

    const routePath = normalizeTaskTimerAccountBackPath(referrerUrl.pathname);
    if (!routePath) return ACCOUNT_BACK_FALLBACK_ROUTE;

    const params = referrerUrl.searchParams;
    if (routePath === "/settings" && params.get("pane") === "general") {
      return ACCOUNT_BACK_FALLBACK_ROUTE;
    }

    return `${routePath}${referrerUrl.search}${referrerUrl.hash}`;
  } catch {
    return ACCOUNT_BACK_FALLBACK_ROUTE;
  }
}
