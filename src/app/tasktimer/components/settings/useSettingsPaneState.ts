"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SettingsNavItem, SettingsPaneKey } from "./types";

const SETTINGS_PANE_KEYS: SettingsPaneKey[] = [
  "general",
  "preferences",
  "appearance",
  "sounds",
  "notifications",
  "privacy",
  "help",
  "about",
  "feedback",
  "data",
  "reset",
];

const SETTINGS_PANE_TRANSITION_MS = 220;

type SettingsPaneSlideDirection = "forward" | "backward";

function isSettingsPaneKey(value: string): value is SettingsPaneKey {
  return SETTINGS_PANE_KEYS.includes(value as SettingsPaneKey);
}

export function useSettingsPaneState(initialPane: SettingsPaneKey | null) {
  const [initialState] = useState<{ activePane: SettingsPaneKey | null; mobileDetailOpen: boolean }>(() => {
    return { activePane: initialPane, mobileDetailOpen: !!initialPane };
  });
  const [activePane, setActivePane] = useState<SettingsPaneKey | null>(initialState.activePane);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(initialState.mobileDetailOpen);
  const [paneSlideDirection, setPaneSlideDirection] = useState<SettingsPaneSlideDirection | null>(null);
  const [exitingPane, setExitingPane] = useState<SettingsPaneKey | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const queryPaneRaw = String(new URLSearchParams(window.location.search).get("pane") || "").trim();
      const requestedPane = isSettingsPaneKey(queryPaneRaw) ? queryPaneRaw : initialPane;
      if (requestedPane) {
        setActivePane(requestedPane);
        setMobileDetailOpen(true);
        return;
      }
      const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
      if (!isMobileViewport) {
        setActivePane("general");
      }
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [initialPane]);

  function clearPaneTransitionLater(nextExitingPane: SettingsPaneKey | null) {
    if (typeof window === "undefined") return;
    if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      setExitingPane((current) => (current === nextExitingPane ? null : current));
      transitionTimerRef.current = null;
    }, SETTINGS_PANE_TRANSITION_MS);
  }

  return {
    activePane,
    setActivePane,
    mobileDetailOpen,
    setMobileDetailOpen,
    paneSlideDirection,
    exitingPane,
    closeMobileDetail: () => {
      setPaneSlideDirection("backward");
      setMobileDetailOpen(false);
    },
    selectPane: (pane: SettingsPaneKey) => {
      if (pane === activePane) {
        setPaneSlideDirection("forward");
        setMobileDetailOpen(true);
        return;
      }
      const previousPane = activePane;
      setPaneSlideDirection("forward");
      setExitingPane(previousPane);
      setActivePane(pane);
      setMobileDetailOpen(true);
      clearPaneTransitionLater(previousPane);
    },
  };
}

export function getSettingsNavItems(): SettingsNavItem[] {
  return [
    { key: "general", label: "Profile", icon: "/avatars/avatar_01.webp", desktopOnly: true },
    { key: "preferences", label: "Preferences", icon: "/icons/icons_default/preferences.webp" },
    { key: "appearance", label: "Appearance", icon: "/icons/icons_default/appearance.webp" },
    { key: "sounds", label: "Sounds & Alerts", icon: "/icons/icons_default/sounds.webp" },
    { key: "notifications", label: "Notifications", icon: "/icons/icons_default/toast.webp" },
    { key: "help", label: "Help Center", icon: "/icons/icons_default/question.webp", id: "commandCenterHelpCenterBtn" },
    { key: "data", label: "Data", icon: "/icons/icons_default/data.webp" },
    { key: "about", label: "About", icon: "/icons/icons_default/about.webp" },
  ];
}

export function getVisibleSettingsNavItems(showDesktopOnlyItems = false): SettingsNavItem[] {
  return getSettingsNavItems().filter((item) => showDesktopOnlyItems || !item.desktopOnly);
}

function subscribeToDesktopSettingsNav(callback: () => void) {
  const query = window.matchMedia("(min-width: 641px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getDesktopSettingsNavSnapshot() {
  return window.matchMedia("(min-width: 641px)").matches;
}

function getServerDesktopSettingsNavSnapshot() {
  return false;
}

export function useSettingsNavItems(): SettingsNavItem[] {
  const showDesktopOnlyItems = useSyncExternalStore(
    subscribeToDesktopSettingsNav,
    getDesktopSettingsNavSnapshot,
    getServerDesktopSettingsNavSnapshot
  );

  return useMemo(
    () => getVisibleSettingsNavItems(showDesktopOnlyItems),
    [showDesktopOnlyItems]
  );
}
