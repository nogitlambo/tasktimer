import type { AppPage } from "../client/types";
import { STORAGE_KEY, loadCachedPreferences } from "./storage";

export type StartupModulePreference = "dashboard" | "tasks" | "friends" | "leaderboard";

export function normalizeStartupModule(raw: unknown): StartupModulePreference {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "tasks" || value === "friends" || value === "leaderboard") return value;
  return "dashboard";
}

export function startupModuleToAppPage(startupModule: StartupModulePreference): AppPage {
  if (startupModule === "tasks") return "tasks";
  if (startupModule === "friends") return "test2";
  if (startupModule === "leaderboard") return "leaderboard";
  return "dashboard";
}

export function startupModuleToRoute(startupModule: StartupModulePreference): string {
  if (startupModule === "tasks") return "/tasklaunch";
  if (startupModule === "friends") return "/friends";
  if (startupModule === "leaderboard") return "/leaderboard";
  return "/dashboard";
}

export function readStartupModulePreference(storageKey = `${STORAGE_KEY}:startupModule`): StartupModulePreference {
  if (typeof window === "undefined") return "dashboard";
  try {
    const localValue = window.localStorage.getItem(storageKey);
    if (localValue) return normalizeStartupModule(localValue);
  } catch {
    // ignore localStorage failures
  }
  const cachedPreferences = loadCachedPreferences();
  if (cachedPreferences && typeof cachedPreferences === "object" && "startupModule" in cachedPreferences) {
    return normalizeStartupModule((cachedPreferences as { startupModule?: unknown }).startupModule);
  }
  return "dashboard";
}

export function readStartupAppPagePreference(storageKey?: string): AppPage {
  return startupModuleToAppPage(readStartupModulePreference(storageKey));
}
