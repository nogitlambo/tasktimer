import type { AppPage } from "../client/types";
import { STORAGE_KEY, loadCachedPreferences } from "./storage";

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

export function readStartupModulePreference(storageKey = `${STORAGE_KEY}:startupModule`): StartupModulePreference {
  if (typeof window === "undefined") return "tasks";
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
  return "tasks";
}

export function readStartupAppPagePreference(storageKey?: string): AppPage {
  return startupModuleToAppPage(readStartupModulePreference(storageKey));
}
