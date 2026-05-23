export const SETTINGS_PANE_QUERY_KEY = "pane";
export const SETTINGS_HIGHLIGHT_QUERY_KEY = "highlight";
export const SETTINGS_PREFERENCES_PANE = "preferences";
export const SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS = "optimalProductivityDays";

export function getSettingsRouteRedirect(searchParams: URLSearchParams) {
  return searchParams.get(SETTINGS_PANE_QUERY_KEY) === "general" ? "/account" : null;
}

export function getSettingsRouteHighlight(searchParams: URLSearchParams) {
  return searchParams.get(SETTINGS_HIGHLIGHT_QUERY_KEY) === SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS
    ? SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS
    : null;
}

export function buildSettingsPreferencesOptimalProductivityDaysHref() {
  const searchParams = new URLSearchParams();
  searchParams.set(SETTINGS_PANE_QUERY_KEY, SETTINGS_PREFERENCES_PANE);
  searchParams.set(SETTINGS_HIGHLIGHT_QUERY_KEY, SETTINGS_HIGHLIGHT_OPTIMAL_PRODUCTIVITY_DAYS);
  return `/settings?${searchParams.toString()}`;
}
