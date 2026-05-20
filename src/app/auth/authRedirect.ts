import { readStartupModulePreference, startupModuleToRoute } from "../tasktimer/lib/startupModule";

export function resolveAuthSuccessRoute(redirectOnSuccess?: string | null): string {
  const explicitRoute = String(redirectOnSuccess || "").trim();
  if (explicitRoute) return explicitRoute;
  return startupModuleToRoute(readStartupModulePreference());
}
