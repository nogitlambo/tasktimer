import type { AppPage } from "../client/types";

export type StartupModulePreference = "dashboard" | "tasks" | "notes" | "friends" | "leaderboard";

export function normalizeStartupModule(raw: unknown): StartupModulePreference {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "tasks" || value === "notes" || value === "friends" || value === "leaderboard") return value;
  if (value === "dashboard") return value;
  return "tasks";
}

export function startupModuleToAppPage(startupModule: StartupModulePreference): AppPage {
  if (startupModule === "tasks") return "tasks";
  if (startupModule === "notes") return "notes";
  if (startupModule === "friends") return "friends";
  if (startupModule === "leaderboard") return "leaderboard";
  return "dashboard";
}

export function startupModuleToRoute(startupModule: StartupModulePreference): string {
  if (startupModule === "tasks") return "/tasklaunch";
  if (startupModule === "notes") return "/notes";
  if (startupModule === "friends") return "/friends";
  if (startupModule === "leaderboard") return "/leaderboards";
  return "/dashboard";
}

type StartupModulePreferencesSource = {
  loadCached: () => { startupModule?: unknown } | null;
  loadResolved: () => { startupModule?: unknown };
};

export function resolveStartupModulePreference(input: {
  preferences: StartupModulePreferencesSource;
  isSignedIn: boolean;
  readSignedOutFallback: () => unknown;
}): StartupModulePreference {
  const cachedPreferences = input.preferences.loadCached();
  if (cachedPreferences) return normalizeStartupModule(cachedPreferences.startupModule);
  if (input.isSignedIn) return normalizeStartupModule(input.preferences.loadResolved().startupModule);
  return normalizeStartupModule(input.readSignedOutFallback());
}

export function resolveStartupAppPagePreference(input: Parameters<typeof resolveStartupModulePreference>[0]): AppPage {
  return startupModuleToAppPage(resolveStartupModulePreference(input));
}
