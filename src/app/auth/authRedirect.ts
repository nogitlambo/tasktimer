import { readStartupModulePreference, startupModuleToRoute } from "../tasktimer/lib/startupModule";

export function resolveAuthSuccessRoute(redirectOnSuccess?: string | null): string {
  const explicitRoute = String(redirectOnSuccess || "").trim();
  if (explicitRoute) return explicitRoute;
  return startupModuleToRoute(readStartupModulePreference());
}

export function runAuthSuccessRedirect(input: {
  hasRedirected: boolean;
  shouldStartProCheckout: boolean;
  bypassAutoRedirect: boolean;
  redirectOnSuccess?: string | null;
  markRedirected: () => void;
  replace: (route: string) => void;
}): boolean {
  if (input.hasRedirected || input.shouldStartProCheckout || input.bypassAutoRedirect) return false;
  input.markRedirected();
  input.replace(resolveAuthSuccessRoute(input.redirectOnSuccess));
  return true;
}
