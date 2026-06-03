import { readStartupModulePreference, startupModuleToRoute } from "../tasktimer/lib/startupModule";

export function resolveAuthSuccessRoute(redirectOnSuccess?: string | null): string {
  const explicitRoute = String(redirectOnSuccess || "").trim();
  if (explicitRoute) return explicitRoute;
  return startupModuleToRoute(readStartupModulePreference());
}

export function shouldFallbackFromAuthSuccessRoute(currentPathname: string, targetRoute: string): boolean {
  const current = String(currentPathname || "").trim().replace(/\/+$/, "") || "/";
  const target = String(targetRoute || "").trim();
  if (current !== "/login") return false;
  if (!target.startsWith("/")) return true;
  const targetPathname = target.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return targetPathname !== current;
}

export function runAuthSuccessRedirect(input: {
  hasRedirected: boolean;
  shouldStartProCheckout: boolean;
  bypassAutoRedirect: boolean;
  redirectOnSuccess?: string | null;
  markRedirected: () => void;
  replace: (route: string) => void;
  fallbackReplace?: (route: string) => void;
  getCurrentPathname?: () => string;
  scheduleFallback?: (callback: () => void, delayMs: number) => void;
  fallbackDelayMs?: number;
}): boolean {
  if (input.hasRedirected || input.shouldStartProCheckout || input.bypassAutoRedirect) return false;
  const route = resolveAuthSuccessRoute(input.redirectOnSuccess);
  input.markRedirected();
  input.replace(route);
  if (input.fallbackReplace && input.getCurrentPathname && input.scheduleFallback) {
    input.scheduleFallback(() => {
      if (shouldFallbackFromAuthSuccessRoute(input.getCurrentPathname?.() || "", route)) {
        input.fallbackReplace?.(route);
      }
    }, input.fallbackDelayMs ?? 900);
  }
  return true;
}
