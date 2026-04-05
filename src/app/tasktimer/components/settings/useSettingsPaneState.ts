"use client";

import { useMemo, useState } from "react";
import type { SettingsNavItem, SettingsPaneKey } from "./types";

const SETTINGS_PANE_KEYS: SettingsPaneKey[] = [
  "general",
  "preferences",
  "appearance",
  "notifications",
  "privacy",
  "userGuide",
  "about",
  "feedback",
  "data",
  "reset",
];

export function isSettingsPaneKey(value: string): value is SettingsPaneKey {
  return SETTINGS_PANE_KEYS.includes(value as SettingsPaneKey);
}

export function useSettingsPaneState(initialPane: SettingsPaneKey | null) {
  const [initialState] = useState<{ activePane: SettingsPaneKey | null; mobileDetailOpen: boolean }>(() => {
    if (typeof window === "undefined") return { activePane: initialPane, mobileDetailOpen: !!initialPane };
    const queryPaneRaw = String(new URLSearchParams(window.location.search).get("pane") || "").trim();
    const requestedPane = isSettingsPaneKey(queryPaneRaw) ? queryPaneRaw : initialPane;
    if (requestedPane) {
      return { activePane: requestedPane, mobileDetailOpen: true };
    }
    const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
    return { activePane: isMobileViewport ? null : ("general" as SettingsPaneKey), mobileDetailOpen: false };
  });
  const [activePane, setActivePane] = useState<SettingsPaneKey | null>(initialState.activePane);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(initialState.mobileDetailOpen);

  return {
    activePane,
    setActivePane,
    mobileDetailOpen,
    setMobileDetailOpen,
    selectPane: (pane: SettingsPaneKey) => {
      setActivePane(pane);
      setMobileDetailOpen(true);
    },
  };
}

export function useSettingsNavItems(): SettingsNavItem[] {
  return useMemo(
    () => [
      { key: "general", label: "Account", icon: "/Settings.svg" },
      { key: "preferences", label: "Preferences", icon: "/Task_Settings.svg" },
      { key: "appearance", label: "Appearance", icon: "/Appearance.svg" },
      { key: "notifications", label: "Notifications", icon: "/Settings.svg" },
      { key: "userGuide", label: "Help Center", icon: "/About.svg", id: "commandCenterHelpCenterBtn" },
      { key: "data", label: "Data", icon: "/History_Manager.svg" },
      { key: "about", label: "About", icon: "/About.svg" },
    ],
    [],
  );
}
