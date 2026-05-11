export function getSettingsRouteRedirect(searchParams: URLSearchParams) {
  return searchParams.get("pane") === "general" ? "/account" : null;
}
